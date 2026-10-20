import type { BoardProvider, JobSourceKind } from "@/db/schema";

/*
 * One normalised posting, whatever it came from.
 *
 * Every adapter returns this shape, so filtering, de-duplication and rendering
 * are written once. The same discipline as the AI providers: the variety lives
 * at the edge, and nothing downstream knows which board a job came from.
 */
export type JobPosting = {
  /** The source's own id. Stable across runs — that is what stops duplicates. */
  sourceRef: string;
  title: string;
  company: string;
  location: string | null;
  /** Null when the source does not say, which is different from "no". */
  remote: boolean | null;
  url: string;
  salaryText: string | null;
  postedAt: Date | null;
  snippet: string | null;
  tags: string[];
};

/** What a saved search is asking for. */
export type SearchCriteria = {
  titleQuery: string;
  location: string | null;
  remoteOnly: boolean;
  minSalary: number | null;
};

export type SourceResult = {
  /** Identifies the source in storage, e.g. "remotive" or "greenhouse:monzo". */
  source: string;
  label: string;
  postings: JobPosting[];
  /** Set when the source could not be reached; the run continues regardless. */
  error?: string;
};

export type BoardRef = {
  provider: BoardProvider;
  slug: string;
  label: string;
};

export type { JobSourceKind };
