import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import {
  fetchUnprocessedEmails,
  getAttachmentsFromMessage,
  listOrCreateLabel,
  markEmailAsIngested,
  type EmailAttachment
} from "@/lib/gmail";
import { ingestFiles, type IngestResult } from "@/lib/ingest";

export const runtime = "nodejs";

type MessageResult = {
  messageId: string;
  status: "success" | "error";
  emailDate: string | null;
  attachmentsFound: number;
  filesIngested: number;
  storesMatched: string[];
  ingestResults: IngestResult[];
  error?: string;
};

type SourceResult = {
  senderEmail: string;
  storeIds: string[];
  messagesFound: number;
  messageResults: MessageResult[];
};

function parseEmailDateToBusinessDate(emailDate: string | null): string {
  if (!emailDate) {
    const now = new Date();
    return now.toISOString().slice(0, 10);
  }
  const parsed = new Date(emailDate);
  if (isNaN(parsed.getTime())) {
    const now = new Date();
    return now.toISOString().slice(0, 10);
  }
  return parsed.toISOString().slice(0, 10);
}

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error("CRON_SECRET env var is not set");
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sources = await prisma.emailSource.findMany({
    where: { isActive: true },
    include: { store: true }
  });

  if (sources.length === 0) {
    return NextResponse.json({
      message: "No active email sources configured",
      sourcesChecked: 0,
      results: []
    });
  }

  const allStores = await prisma.store.findMany({
    where: { abbreviation: { not: null } },
    select: { id: true, abbreviation: true }
  });
  const storeByAbbreviation = new Map(
    allStores
      .filter((s) => s.abbreviation)
      .map((s) => [s.abbreviation!.toUpperCase(), s.id])
  );

  const ingestedLabelId = await listOrCreateLabel("ingested");

  type SourceWithStore = (typeof sources)[number];
  const senderGroups = new Map<string, SourceWithStore[]>();
  for (const source of sources) {
    const key = source.senderEmail.toLowerCase();
    const group = senderGroups.get(key) ?? [];
    group.push(source);
    senderGroups.set(key, group);
  }

  const sourceResults: SourceResult[] = [];

  for (const [senderEmail, groupSources] of senderGroups) {
    const subjectPatterns = groupSources
      .map((s) => s.subjectPattern)
      .filter(Boolean);
    const subjectPattern = subjectPatterns.length > 0
      ? subjectPatterns.join(" OR ")
      : null;

    let messages;
    try {
      messages = await fetchUnprocessedEmails(senderEmail, subjectPattern);
    } catch (err) {
      console.error(`Failed to fetch emails for sender ${senderEmail}:`, err);
      sourceResults.push({
        senderEmail,
        storeIds: groupSources.map((s) => s.storeId),
        messagesFound: 0,
        messageResults: [{
          messageId: "N/A",
          status: "error",
          emailDate: null,
          attachmentsFound: 0,
          filesIngested: 0,
          storesMatched: [],
          ingestResults: [],
          error: `Failed to fetch emails: ${String(err)}`
        }]
      });
      continue;
    }

    const messageResults: MessageResult[] = [];

    for (const msg of messages) {
      try {
        const { attachments, emailDate } = await getAttachmentsFromMessage(msg.id);

        if (attachments.length === 0) {
          await markEmailAsIngested(msg.id, ingestedLabelId);
          messageResults.push({
            messageId: msg.id,
            status: "success",
            emailDate,
            attachmentsFound: 0,
            filesIngested: 0,
            storesMatched: [],
            ingestResults: []
          });
          continue;
        }

        const businessDate = parseEmailDateToBusinessDate(emailDate);

        const filesByStoreId = new Map<string, EmailAttachment[]>();

        for (const att of attachments) {
          const upperName = att.filename.toUpperCase();
          let resolvedStoreId: string | undefined;

          for (const [abbr, sid] of storeByAbbreviation) {
            if (upperName.includes(abbr)) {
              resolvedStoreId = sid;
              break;
            }
          }

          if (!resolvedStoreId) {
            if (groupSources.length === 1) {
              resolvedStoreId = groupSources[0].storeId;
            } else {
              console.warn(
                `Could not resolve store for attachment '${att.filename}' in message ${msg.id}. ` +
                `No abbreviation matched and multiple sources exist for sender.`
              );
              continue;
            }
          }

          const existing = filesByStoreId.get(resolvedStoreId) ?? [];
          existing.push(att);
          filesByStoreId.set(resolvedStoreId, existing);
        }

        const ingestResults: IngestResult[] = [];
        const storesMatched: string[] = [];

        for (const [storeId, files] of filesByStoreId) {
          storesMatched.push(storeId);
          const result = await ingestFiles({
            storeId,
            businessDate,
            files: files.map((f) => ({ name: f.filename, buffer: f.buffer }))
          });
          ingestResults.push(result);
        }

        await markEmailAsIngested(msg.id, ingestedLabelId);

        const sourceIds = new Set(groupSources.map((s) => s.storeId));
        const matchedSourceIds = storesMatched.filter((id) => sourceIds.has(id));
        if (matchedSourceIds.length > 0) {
          await prisma.emailSource.updateMany({
            where: {
              storeId: { in: matchedSourceIds },
              senderEmail: { equals: senderEmail, mode: "insensitive" }
            },
            data: { lastProcessedAt: new Date() }
          });
        }

        messageResults.push({
          messageId: msg.id,
          status: "success",
          emailDate,
          attachmentsFound: attachments.length,
          filesIngested: ingestResults.reduce((sum, r) => sum + r.filesIngested.length, 0),
          storesMatched,
          ingestResults
        });
      } catch (err) {
        console.error(`Failed to process message ${msg.id}:`, err);
        messageResults.push({
          messageId: msg.id,
          status: "error",
          emailDate: null,
          attachmentsFound: 0,
          filesIngested: 0,
          storesMatched: [],
          ingestResults: [],
          error: String(err)
        });
      }
    }

    sourceResults.push({
      senderEmail,
      storeIds: groupSources.map((s) => s.storeId),
      messagesFound: messages.length,
      messageResults
    });
  }

  const totalMessages = sourceResults.reduce((s, r) => s + r.messagesFound, 0);
  const totalErrors = sourceResults.reduce(
    (s, r) => s + r.messageResults.filter((m) => m.status === "error").length,
    0
  );

  return NextResponse.json({
    sourcesChecked: sourceResults.length,
    totalMessages,
    totalErrors,
    results: sourceResults
  });
}
