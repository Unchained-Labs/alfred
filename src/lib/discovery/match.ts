import type { JobPosting, SearchCriteria } from "./types";

/*
 * Whether a posting answers a search.
 *
 * Pure and dependency-free so it can be tested offline, which matters more
 * here than anywhere else in the feature: the sources are fine, and the
 * difference between a useful daily digest and 300 rows of noise is entirely
 * this file.
 *
 * The governing rule is that an UNKNOWN never disqualifies. A board that does
 * not publish salary should not have its jobs filtered out by a salary floor,
 * and a posting with no location text should not vanish from a located search.
 * Dropping a job you would have wanted is a worse failure than showing one you
 * would not, because you never find out about the first kind.
 */

/**
 * Title matching.
 *
 * Commas separate alternatives; words within an alternative must all appear.
 * So "backend engineer, platform engineer" means
 * (backend AND engineer) OR (platform AND engineer).
 *
 * Any-word matching was the obvious first choice and is wrong: "backend
 * engineer" would then match "Engineer, Facilities". Requiring every word
 * makes a search mean what it looks like it means.
 */
export function titleMatches(title: string, query: string): boolean {
  const alternatives = query
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
  if (!alternatives.length) return true;

  const haystack = title.toLowerCase();
  return alternatives.some((alternative) =>
    alternative
      .split(/\s+/)
      .filter(Boolean)
      .every((word) => haystack.includes(word)),
  );
}

/** Substring, case-insensitive, and an absent location never disqualifies. */
export function locationMatches(
  location: string | null,
  query: string | null,
): boolean {
  const needle = query?.trim().toLowerCase();
  if (!needle) return true;
  if (!location) return true;
  return location.toLowerCase().includes(needle);
}

/**
 * Pulls an annual figure out of free text.
 *
 * Salary arrives as prose — "£90,000 - £110,000", "$150k–$190k", "Competitive"
 * — so this reads the largest plausible annual number it can find and returns
 * null when there is nothing to read. Null means "do not filter on this",
 * never "zero".
 */
export function parseSalary(text: string | null): number | null {
  if (!text) return null;
  let best: number | null = null;

  // Matches 90,000 / 90000 / 90k / 90K, with optional decimals for the k form.
  for (const match of text.matchAll(/(\d[\d,.]*)\s*([kK])?/g)) {
    const digits = match[1].replace(/,/g, "");
    if (!digits || digits === ".") continue;
    let value = Number.parseFloat(digits);
    if (!Number.isFinite(value)) continue;
    if (match[2]) value *= 1000;
    // Below this is an hourly rate, a headcount or a year, not a salary.
    if (value < 10_000) continue;
    // Above this is a phone number or an id that happened to look numeric.
    if (value > 10_000_000) continue;
    if (best === null || value > best) best = value;
  }

  return best;
}

export function salaryMatches(
  salaryText: string | null,
  minSalary: number | null,
): boolean {
  if (!minSalary) return true;
  const found = parseSalary(salaryText);
  // Unreadable or absent salary passes: see the note at the top of the file.
  if (found === null) return true;
  return found >= minSalary;
}

export function matches(posting: JobPosting, criteria: SearchCriteria): boolean {
  if (!titleMatches(posting.title, criteria.titleQuery)) return false;

  if (criteria.remoteOnly) {
    // An explicit "not remote" is the only thing that disqualifies; a source
    // that does not say is given the benefit of the doubt.
    if (posting.remote === false) return false;
  } else if (!locationMatches(posting.location, criteria.location)) {
    // Location and remoteness are different axes, so a remote-only search does
    // not also apply a place filter — "remote" and "London" together would
    // reject every genuinely location-free posting.
    return false;
  }

  return salaryMatches(posting.salaryText, criteria.minSalary);
}

/**
 * A key for catching the same job arriving from two sources.
 *
 * The unique index on (source, sourceRef) cannot see that a Greenhouse board
 * and an aggregator are both carrying one posting, so company and title are
 * normalised into a second, softer key.
 */
export function softKey(posting: JobPosting): string {
  const flatten = (value: string) =>
    value
      .toLowerCase()
      .replace(/\(.*?\)/g, " ")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  return `${flatten(posting.company)}::${flatten(posting.title)}`;
}
