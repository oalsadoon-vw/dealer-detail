import { google, gmail_v1 } from "googleapis";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}. Set it in .env or Vercel dashboard.`);
  }
  return value;
}

let cachedClient: gmail_v1.Gmail | null = null;

export function getGmailClient(): gmail_v1.Gmail {
  if (cachedClient) return cachedClient;

  const auth = new google.auth.OAuth2(
    requireEnv("GMAIL_CLIENT_ID"),
    requireEnv("GMAIL_CLIENT_SECRET")
  );
  auth.setCredentials({ refresh_token: requireEnv("GMAIL_REFRESH_TOKEN") });

  cachedClient = google.gmail({ version: "v1", auth });
  return cachedClient;
}

const labelIdCache = new Map<string, string>();

export async function listOrCreateLabel(labelName: string): Promise<string> {
  const cached = labelIdCache.get(labelName);
  if (cached) return cached;

  const gmail = getGmailClient();

  const listRes = await gmail.users.labels.list({ userId: "me" });
  const existing = listRes.data.labels?.find(
    (l) => l.name?.toLowerCase() === labelName.toLowerCase()
  );
  if (existing?.id) {
    labelIdCache.set(labelName, existing.id);
    return existing.id;
  }

  const createRes = await gmail.users.labels.create({
    userId: "me",
    requestBody: {
      name: labelName,
      labelListVisibility: "labelShow",
      messageListVisibility: "show"
    }
  });
  const newId = createRes.data.id;
  if (!newId) throw new Error(`Failed to create Gmail label '${labelName}'`);

  labelIdCache.set(labelName, newId);
  return newId;
}

export type EmailStub = {
  id: string;
  threadId: string;
};

export async function fetchUnprocessedEmails(
  senderEmail: string,
  subjectPattern?: string | null
): Promise<EmailStub[]> {
  const gmail = getGmailClient();

  let query = `from:${senderEmail} has:attachment filename:xlsx -label:ingested`;
  if (subjectPattern) {
    query += ` subject:(${subjectPattern})`;
  }

  const stubs: EmailStub[] = [];
  let pageToken: string | undefined;

  do {
    const res = await gmail.users.messages.list({
      userId: "me",
      q: query,
      pageToken,
      maxResults: 100
    });

    if (res.data.messages) {
      for (const msg of res.data.messages) {
        if (msg.id && msg.threadId) {
          stubs.push({ id: msg.id, threadId: msg.threadId });
        }
      }
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  return stubs;
}

export type EmailAttachment = {
  filename: string;
  buffer: Buffer;
};

export type EmailMessageData = {
  attachments: EmailAttachment[];
  emailDate: string | null;
};

export async function getAttachmentsFromMessage(
  messageId: string
): Promise<EmailMessageData> {
  const gmail = getGmailClient();

  const msg = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format: "full"
  });

  const headers = msg.data.payload?.headers ?? [];
  const dateHeader = headers.find(
    (h) => h.name?.toLowerCase() === "date"
  )?.value ?? null;

  const attachments: EmailAttachment[] = [];

  async function walkParts(parts: gmail_v1.Schema$MessagePart[] | undefined) {
    if (!parts) return;
    for (const part of parts) {
      if (part.parts) {
        await walkParts(part.parts);
      }

      const filename = part.filename;
      const attachmentId = part.body?.attachmentId;
      if (!filename || !attachmentId) continue;
      if (!filename.toLowerCase().endsWith(".xlsx")) continue;

      const attRes = await gmail.users.messages.attachments.get({
        userId: "me",
        messageId,
        id: attachmentId
      });

      const data = attRes.data.data;
      if (!data) continue;

      const buffer = Buffer.from(data, "base64url");
      attachments.push({ filename, buffer });
    }
  }

  if (msg.data.payload?.parts) {
    await walkParts(msg.data.payload.parts);
  } else if (msg.data.payload?.body?.attachmentId && msg.data.payload.filename) {
    const filename = msg.data.payload.filename;
    if (filename.toLowerCase().endsWith(".xlsx")) {
      const attRes = await gmail.users.messages.attachments.get({
        userId: "me",
        messageId,
        id: msg.data.payload.body.attachmentId
      });
      if (attRes.data.data) {
        attachments.push({
          filename,
          buffer: Buffer.from(attRes.data.data, "base64url")
        });
      }
    }
  }

  return { attachments, emailDate: dateHeader };
}

export async function markEmailAsIngested(
  messageId: string,
  labelId: string
): Promise<void> {
  const gmail = getGmailClient();

  await gmail.users.messages.modify({
    userId: "me",
    id: messageId,
    requestBody: {
      addLabelIds: [labelId],
      removeLabelIds: ["UNREAD"]
    }
  });
}
