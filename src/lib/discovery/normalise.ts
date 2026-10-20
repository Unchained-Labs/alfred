import type { JobPosting } from "./types";

/*
 * Raw source payloads → normalised postings.
 *
 * Pure and free of `server-only`, so the mapping can be asserted offline
 * against recorded payloads. That matters because these APIs disagree with
 * their own documentation in small, silent ways: Greenhouse and Remotive send
 * the id as a NUMBER, Arbeitnow sends booleans as the strings "True"/"False",
 * Greenhouse nests the location one level down, Ashby splits the description
 * across two fields.
 *
 * Getting one of those wrong does not raise anything. It produces a source
 * that answers successfully and yields nothing, which is the hardest kind of
 * bug to notice in a feature whose normal output is sometimes zero.
 */

const text = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

/**
 * An external id, which arrives as a NUMBER from Greenhouse and Remotive and
 * as a string from Ashby and Arbeitnow.
 *
 * This is deliberately separate from `text`. Treating a numeric id as absent
 * dropped every posting from two of the three sources, and it did so silently:
 * types passed, lint passed, and the only symptom was a board that "answered
 * but has no open roles". Anything that becomes a de-duplication key is worth
 * its own coercion.
 */
const idOf = (value: unknown): string | null => {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return text(value);
};

/** Strips tags and collapses whitespace. Descriptions arrive as HTML. */
function plain(html: unknown, limit = 400): string | null {
  const raw = text(html);
  if (!raw) return null;
  const stripped = raw
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
  if (!stripped) return null;
  return stripped.length > limit ? `${stripped.slice(0, limit)}…` : stripped;
}

const asDate = (value: unknown): Date | null => {
  if (typeof value === "number") {
    // Arbeitnow sends seconds; everything else that is numeric here would be ms.
    const ms = value < 10_000_000_000 ? value * 1000 : value;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const raw = text(value);
  if (!raw) return null;
  // A bare integer arrives as a string from Arbeitnow's JSON.
  if (/^\d+$/.test(raw)) return asDate(Number(raw));
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
};

/** Arbeitnow sends booleans as the strings "True"/"False". */
const asBool = (value: unknown): boolean | null => {
  if (typeof value === "boolean") return value;
  const raw = text(value)?.toLowerCase();
  if (raw === "true") return true;
  if (raw === "false") return false;
  return null;
};

const asTags = (value: unknown): string[] =>
  Array.isArray(value)
    ? value
        .map((t) => text(t))
        .filter((t): t is string => Boolean(t))
        .slice(0, 8)
    : [];

/* ------------------------------------------------------------------ *
 * Per-source mapping
 * ------------------------------------------------------------------ */

export function normaliseRemotive(payload: unknown): JobPosting[] {
  const data = payload as { jobs?: unknown[] };
  return (data?.jobs ?? []).flatMap((raw): JobPosting[] => {
    const job = raw as Record<string, unknown>;
    const ref = idOf(job.id);
    const title = text(job.title);
    const link = text(job.url);
    if (!ref || !title || !link) return [];
    return [
      {
        sourceRef: ref,
        title,
        company: text(job.company_name) ?? "Unknown",
        location: text(job.candidate_required_location),
        // Every posting on Remotive is remote; that is the whole site.
        remote: true,
        url: link,
        salaryText: text(job.salary),
        postedAt: asDate(job.publication_date),
        snippet: plain(job.description),
        tags: asTags(job.tags),
      },
    ];
  });
}

export function normaliseArbeitnow(payload: unknown, limit = 400): JobPosting[] {
  const data = payload as { data?: unknown[] };
  return (data?.data ?? []).slice(0, limit).flatMap((raw): JobPosting[] => {
    const job = raw as Record<string, unknown>;
    const ref = idOf(job.slug);
    const title = text(job.title);
    const link = text(job.url);
    if (!ref || !title || !link) return [];
    return [
      {
        sourceRef: ref,
        title,
        company: text(job.company_name) ?? "Unknown",
        location: text(job.location),
        remote: asBool(job.remote),
        url: link,
        salaryText: null,
        postedAt: asDate(job.created_at),
        snippet: plain(job.description),
        tags: asTags(job.tags),
      },
    ];
  });
}

export function normaliseGreenhouse(
  payload: unknown,
  fallbackCompany: string,
  limit = 400,
): JobPosting[] {
  const data = payload as { jobs?: unknown[] };
  return (data?.jobs ?? []).slice(0, limit).flatMap((raw): JobPosting[] => {
    const job = raw as Record<string, unknown>;
    const ref = idOf(job.id);
    const title = text(job.title);
    const link = text(job.absolute_url);
    if (!ref || !title || !link) return [];
    const location = text((job.location as { name?: unknown } | null)?.name);
    return [
      {
        sourceRef: ref,
        title,
        company: text(job.company_name) ?? fallbackCompany,
        location,
        // Greenhouse has no remote flag; the location text is all there is.
        remote: location ? /remote/i.test(location) : null,
        url: link,
        salaryText: null,
        postedAt: asDate(job.first_published) ?? asDate(job.updated_at),
        snippet: null,
        tags: [],
      },
    ];
  });
}

export function normaliseAshby(
  payload: unknown,
  company: string,
  limit = 400,
): JobPosting[] {
  const data = payload as { jobs?: unknown[] };
  return (data?.jobs ?? []).slice(0, limit).flatMap((raw): JobPosting[] => {
    const job = raw as Record<string, unknown>;
    const ref = idOf(job.id);
    const title = text(job.title);
    const link = text(job.jobUrl) ?? text(job.applyUrl);
    if (!ref || !title || !link) return [];
    // An unlisted posting is still in the payload but is not open.
    if (asBool(job.isListed) === false) return [];

    const compensation = job.compensation as
      | {
          compensationTierSummary?: unknown;
          scrapeableCompensationSalarySummary?: unknown;
        }
      | null
      | undefined;

    return [
      {
        sourceRef: ref,
        title,
        company,
        location: text(job.location),
        remote: asBool(job.isRemote),
        url: link,
        salaryText:
          text(compensation?.compensationTierSummary) ??
          text(compensation?.scrapeableCompensationSalarySummary),
        postedAt: asDate(job.publishedAt),
        snippet: plain(job.descriptionPlain ?? job.descriptionHtml),
        tags: [text(job.department), text(job.workplaceType)].filter(
          (t): t is string => Boolean(t),
        ),
      },
    ];
  });
}
