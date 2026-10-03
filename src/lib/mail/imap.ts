import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { ConfigError } from "@/lib/errors";
import type { MailSettings } from "@/lib/settings";

export type FetchedMail = {
  messageId: string;
  subject: string | null;
  fromAddress: string | null;
  fromName: string | null;
  body: string;
  snippet: string;
  receivedAt: Date;
};

function client(config: MailSettings) {
  return new ImapFlow({
    host: config.host.trim(),
    port: config.port,
    secure: config.secure,
    auth: { user: config.user.trim(), pass: config.password },
    // imapflow logs every command at info level; far too chatty for a dev server.
    logger: false,
    // Fail fast rather than hanging a request on an unreachable host.
    socketTimeout: 30_000,
    greetingTimeout: 15_000,
  });
}

function assertConfigured(config: MailSettings) {
  const missing = (["host", "user", "password"] as const).filter(
    (key) => !String(config[key] ?? "").trim(),
  );
  if (missing.length) {
    throw new ConfigError(
      `Mailbox is not configured — missing ${missing.join(", ")}. Add it in Settings.`,
    );
  }
}

/** imapflow types envelope dates as `string | Date` depending on the server. */
function coerceDate(value: string | Date | undefined | null): Date {
  if (value instanceof Date) return value;
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

/** Strips quoted replies, signatures, and tracking cruft before the AI sees it. */
function cleanBody(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .split(/\n-{2,}\s*\n|\nOn .{1,80} wrote:\n|\n>+ ?/)[0]
    .replace(/https?:\/\/\S{80,}/g, "[link]")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 8000);
}

/** Verifies credentials and reports what the mailbox holds. */
export async function testMailbox(config: MailSettings) {
  assertConfigured(config);
  const connection = client(config);
  await connection.connect();
  try {
    const mailbox = await connection.mailboxOpen(config.folder || "INBOX", {
      readOnly: true,
    });
    return {
      ok: true,
      folder: mailbox.path,
      messages: mailbox.exists,
    };
  } finally {
    await connection.logout().catch(() => connection.close());
  }
}

/**
 * Pulls messages newer than `lookbackDays` from the configured folder.
 * Read-only — Alfred never marks, moves, or deletes anything in the mailbox.
 */
export async function fetchRecentMail(
  config: MailSettings,
  options?: { limit?: number },
): Promise<FetchedMail[]> {
  assertConfigured(config);
  const limit = options?.limit ?? 120;
  const since = new Date(Date.now() - config.lookbackDays * 86_400_000);

  const connection = client(config);
  await connection.connect();

  const collected: FetchedMail[] = [];
  try {
    const lock = await connection.getMailboxLock(config.folder || "INBOX", {
      readOnly: true,
    });
    try {
      for await (const message of connection.fetch(
        { since },
        { uid: true, envelope: true, source: true },
      )) {
        if (!message.source) continue;

        const parsed = await simpleParser(message.source);
        const from = parsed.from?.value?.[0];
        const text =
          parsed.text ??
          (typeof parsed.html === "string"
            ? parsed.html.replace(/<[^>]+>/g, " ")
            : "");
        const body = cleanBody(text);

        collected.push({
          // Fall back to a UID-derived key so a message without a Message-ID
          // header still dedupes across syncs.
          messageId: parsed.messageId ?? `uid-${config.user}-${message.uid}`,
          subject: parsed.subject ?? message.envelope?.subject ?? null,
          fromAddress: from?.address ?? null,
          fromName: from?.name || null,
          body,
          snippet: body.replace(/\s+/g, " ").slice(0, 240),
          receivedAt: coerceDate(parsed.date ?? message.envelope?.date),
        });

        // Newest mail matters most, but IMAP returns oldest-first — so cap
        // generously and sort after, rather than stopping early.
        if (collected.length >= limit * 2) break;
      }
    } finally {
      lock.release();
    }
  } finally {
    await connection.logout().catch(() => connection.close());
  }

  return collected
    .sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime())
    .slice(0, limit);
}
