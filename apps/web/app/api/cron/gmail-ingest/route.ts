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
  unmatchedAttachments: string[];
  ingestResults: IngestResult[];
  error?: string;
};

type SourceResult = {
  senderEmail: string;
  organizationIds: string[];
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

  const ingestedLabelId = await listOrCreateLabel("ingested");

  type SourceWithStore = (typeof sources)[number];
  const senderGroups = new Map<string, SourceWithStore[]>();
  for (const source of sources) {
    const key = source.senderEmail.toLowerCase();
    const group = senderGroups.get(key) ?? [];
    group.push(source);
    senderGroups.set(key, group);
  }

  // For each sender, build an abbreviation map scoped to the organizations
  // that subscribe to it. This prevents two customer orgs that share a DMS
  // (e.g. both on Tekion's reportbuilder@tekion.com) from routing each
  // other's attachments via globally-overlapping abbreviations.
  const orgIdsBySender = new Map<string, string[]>();
  for (const [senderEmail, groupSources] of senderGroups) {
    const orgIds = Array.from(
      new Set(groupSources.map((s) => s.organizationId))
    );
    orgIdsBySender.set(senderEmail, orgIds);
  }

  const allRelevantOrgIds = Array.from(
    new Set(Array.from(orgIdsBySender.values()).flat())
  );
  const scopedStores = await prisma.store.findMany({
    where: {
      organizationId: { in: allRelevantOrgIds },
      abbreviation: { not: null },
    },
    select: { id: true, abbreviation: true, organizationId: true },
  });
  const storesByOrg = new Map<string, { abbr: string; storeId: string }[]>();
  for (const s of scopedStores) {
    if (!s.abbreviation) continue;
    const list = storesByOrg.get(s.organizationId) ?? [];
    list.push({ abbr: s.abbreviation.toUpperCase(), storeId: s.id });
    storesByOrg.set(s.organizationId, list);
  }

  const sourceResults: SourceResult[] = [];

  for (const [senderEmail, groupSources] of senderGroups) {
    const senderOrgIds = orgIdsBySender.get(senderEmail) ?? [];
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
        organizationIds: senderOrgIds,
        storeIds: groupSources.map((s) => s.storeId).filter((x): x is string => !!x),
        messagesFound: 0,
        messageResults: [{
          messageId: "N/A",
          status: "error",
          emailDate: null,
          attachmentsFound: 0,
          filesIngested: 0,
          storesMatched: [],
          unmatchedAttachments: [],
          ingestResults: [],
          error: `Failed to fetch emails: ${String(err)}`
        }]
      });
      continue;
    }

    // Build the abbreviation lookup tables this sender is allowed to route
    // into. Each entry is scoped to one of the orgs that subscribes to this
    // sender. We try them in turn per attachment.
    const senderAbbrTables = senderOrgIds.map((orgId) => ({
      orgId,
      stores: storesByOrg.get(orgId) ?? [],
    }));

    // Per-store-override fallback (for the rare per-store EmailSource).
    const storeOverrideSources = groupSources.filter((s) => s.storeId);

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
            unmatchedAttachments: [],
            ingestResults: []
          });
          continue;
        }

        const businessDate = parseEmailDateToBusinessDate(emailDate);

        const filesByStoreId = new Map<string, EmailAttachment[]>();
        const unmatchedAttachments: string[] = [];

        for (const att of attachments) {
          const upperName = att.filename.toUpperCase();
          let resolvedStoreId: string | undefined;

          // Org-scoped abbreviation matching — try each subscribed org's
          // store list. First abbreviation match (longest abbreviations
          // should be added first; we don't enforce ordering yet).
          for (const { stores } of senderAbbrTables) {
            for (const { abbr, storeId } of stores) {
              if (upperName.includes(abbr)) {
                resolvedStoreId = storeId;
                break;
              }
            }
            if (resolvedStoreId) break;
          }

          // Fallback: a single store-scoped EmailSource for this sender.
          // Only safe when there's exactly one such override AND no org-wide
          // sources for this sender (otherwise we'd be guessing across orgs).
          if (
            !resolvedStoreId &&
            storeOverrideSources.length === 1 &&
            groupSources.length === 1
          ) {
            resolvedStoreId = storeOverrideSources[0].storeId ?? undefined;
          }

          if (!resolvedStoreId) {
            unmatchedAttachments.push(att.filename);
            console.warn(
              `[gmail-ingest] Could not resolve store for attachment '${att.filename}' in message ${msg.id}. ` +
                `Subscribed orgs: ${senderOrgIds.join(", ")}.`
            );
            continue;
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

        // Stamp every EmailSource matching this sender across all subscribed
        // orgs that actually had a matched store. This keeps the "last
        // processed" indicator accurate per source row.
        if (storesMatched.length > 0) {
          const storesMatchedOrgIds = await prisma.store.findMany({
            where: { id: { in: storesMatched } },
            select: { organizationId: true },
          });
          const matchedOrgIds = Array.from(
            new Set(storesMatchedOrgIds.map((s) => s.organizationId))
          );
          if (matchedOrgIds.length > 0) {
            await prisma.emailSource.updateMany({
              where: {
                organizationId: { in: matchedOrgIds },
                senderEmail: { equals: senderEmail, mode: "insensitive" }
              },
              data: { lastProcessedAt: new Date() }
            });
          }
        }

        messageResults.push({
          messageId: msg.id,
          status: "success",
          emailDate,
          attachmentsFound: attachments.length,
          filesIngested: ingestResults.reduce((sum, r) => sum + r.filesIngested.length, 0),
          storesMatched,
          unmatchedAttachments,
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
          unmatchedAttachments: [],
          ingestResults: [],
          error: String(err)
        });
      }
    }

    sourceResults.push({
      senderEmail,
      organizationIds: senderOrgIds,
      storeIds: groupSources.map((s) => s.storeId).filter((x): x is string => !!x),
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
