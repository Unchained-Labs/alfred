import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { applications, mailMessages } from "@/db/schema";
import { triageEmail } from "@/lib/ai";
import { AiError } from "@/lib/ai/types";
import { fetchRecentMail } from "@/lib/mail/imap";
import { linkMailToApplication } from "@/lib/mutations";
import { listKnownCompanies } from "@/lib/queries";
import { getSettings } from "@/lib/settings";

export type SyncReport = {
  fetched: number;
  inserted: number;
  triaged: number;
  autoLinked: number;
  skipped: number;
  /** Non-fatal problems — a failed triage does not fail the whole sync. */
  warnings: string[];
};

/** Loose company match: ignores case, punctuation, and legal suffixes. */
function normalizeCompany(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(inc|llc|ltd|limited|gmbh|corp|corporation|co|sa|ag|bv|plc)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function findApplicationByCompany(company: string): string | null {
  const needle = normalizeCompany(company);
  if (!needle) return null;

  const rows = db
    .select({ id: applications.id, company: applications.company })
    .from(applications)
    .all();

  // Prefer an exact normalized match; fall back to containment either way,
  // which catches "Acme" vs "Acme Technologies".
  const exact = rows.find((row) => normalizeCompany(row.company) === needle);
  if (exact) return exact.id;

  const partial = rows.find((row) => {
    const candidate = normalizeCompany(row.company);
    return (
      candidate.length > 3 &&
      needle.length > 3 &&
      (candidate.includes(needle) || needle.includes(candidate))
    );
  });
  return partial?.id ?? null;
}

/**
 * Fetches new mail, optionally triages it, and links what it can match with
 * high confidence. Anything uncertain lands in the inbox as `pending` for the
 * user to resolve — Alfred never silently advances an application on a guess.
 */
export async function syncMailbox(options?: {
  triage?: boolean;
}): Promise<SyncReport> {
  const settings = getSettings();
  const report: SyncReport = {
    fetched: 0,
    inserted: 0,
    triaged: 0,
    autoLinked: 0,
    skipped: 0,
    warnings: [],
  };

  const fetched = await fetchRecentMail(settings.mail);
  report.fetched = fetched.length;
  if (!fetched.length) return report;

  // One query instead of one per message.
  const seen = new Set(
    db
      .select({ messageId: mailMessages.messageId })
      .from(mailMessages)
      .where(
        inArray(
          mailMessages.messageId,
          fetched.map((mail) => mail.messageId),
        ),
      )
      .all()
      .map((row) => row.messageId),
  );

  const fresh = fetched.filter((mail) => !seen.has(mail.messageId));
  report.skipped = fetched.length - fresh.length;
  if (!fresh.length) return report;

  const inserted = db
    .insert(mailMessages)
    .values(
      fresh.map((mail) => ({
        messageId: mail.messageId,
        folder: settings.mail.folder || "INBOX",
        fromAddress: mail.fromAddress,
        fromName: mail.fromName,
        subject: mail.subject,
        snippet: mail.snippet,
        body: mail.body,
        receivedAt: mail.receivedAt,
      })),
    )
    .returning()
    .all();
  report.inserted = inserted.length;

  const shouldTriage = options?.triage ?? settings.mail.autoTriage;
  if (!shouldTriage) return report;

  const knownCompanies = listKnownCompanies();

  for (const row of inserted) {
    try {
      const { result } = await triageEmail(
        {
          fromName: row.fromName,
          fromAddress: row.fromAddress,
          subject: row.subject,
          body: row.body,
          receivedAt: row.receivedAt,
        },
        knownCompanies,
      );
      report.triaged++;

      if (!result.isJobRelated) {
        db.update(mailMessages)
          .set({
            classification: "other",
            confidence: result.confidence,
            status: "ignored",
          })
          .where(eq(mailMessages.id, row.id))
          .run();
        continue;
      }

      db.update(mailMessages)
        .set({
          classification: result.classification,
          confidence: result.confidence,
          detectedCompany: result.company,
          detectedTitle: result.title,
          suggestedStage: result.suggestedStage,
          snippet: result.summary || row.snippet,
        })
        .where(eq(mailMessages.id, row.id))
        .run();

      // Link only when the model is confident AND the company resolves to
      // something already tracked. Stage changes stay manual.
      if (result.confidence >= 0.75 && result.company) {
        const applicationId = findApplicationByCompany(result.company);
        if (applicationId) {
          linkMailToApplication(row.id, applicationId);
          report.autoLinked++;
        }
      }
    } catch (error) {
      const message =
        error instanceof AiError
          ? error.message
          : error instanceof Error
            ? error.message
            : String(error);
      report.warnings.push(`${row.subject ?? "(no subject)"}: ${message}`);

      // A provider outage shouldn't produce dozens of identical warnings.
      if (report.warnings.length >= 3) {
        report.warnings.push("Stopped triaging after repeated provider failures.");
        break;
      }
    }
  }

  return report;
}
