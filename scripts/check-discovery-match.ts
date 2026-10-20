/*
 * The discovery filter, asserted offline.
 *
 * No network: these are the decisions that turn a daily scan into a useful
 * digest rather than 300 rows of noise, and they are worth gating on every
 * commit. The sources are fine; the filter is where this feature lives or dies.
 *
 *   npm run check:discovery
 */
import { readFileSync } from "node:fs";
import {
  locationMatches,
  matches,
  parseSalary,
  softKey,
  titleMatches,
} from "@/lib/discovery/match";
import {
  normaliseArbeitnow,
  normaliseAshby,
  normaliseGreenhouse,
  normaliseRemotive,
} from "@/lib/discovery/normalise";
import type { JobPosting, SearchCriteria } from "@/lib/discovery/types";

const checks: [string, boolean][] = [];
const ok = (label: string, pass: boolean) => checks.push([label, pass]);

/* ---- title: every word of an alternative must appear ---- */
ok(
  "exact phrase matches",
  titleMatches("Senior Backend Engineer", "backend engineer"),
);
ok(
  "word order does not matter",
  titleMatches("Engineer, Backend Platform", "backend engineer"),
);
ok(
  "a single shared word is NOT a match",
  !titleMatches("Engineer, Facilities", "backend engineer"),
);
ok(
  "commas are alternatives",
  titleMatches("Staff Platform Engineer", "backend engineer, platform engineer"),
);
ok(
  "neither alternative matches",
  !titleMatches("Account Executive", "backend engineer, platform engineer"),
);
ok("case insensitive", titleMatches("SENIOR BACKEND ENGINEER", "Backend Engineer"));
ok("an empty query matches everything", titleMatches("Anything At All", "   "));

/* ---- location: substring, and unknown never disqualifies ---- */
ok(
  "city matches within a longer string",
  locationMatches("Cardiff, London or Remote (UK)", "london"),
);
ok("different city does not match", !locationMatches("Munich", "london"));
ok("no location on the posting passes", locationMatches(null, "london"));
ok("no location in the search passes", locationMatches("Munich", null));

/* ---- salary: read what is readable, never invent a zero ---- */
ok("plain number", parseSalary("90000") === 90000);
ok("thousands separators", parseSalary("£90,000 - £110,000") === 110000);
ok("k suffix", parseSalary("$150k–$190k") === 190000);
ok("prose with no figure", parseSalary("Competitive") === null);
ok("empty", parseSalary("") === null);
ok("ignores an hourly rate", parseSalary("$45 per hour") === null);
ok("ignores a stray year", parseSalary("Posted 2026") === null);

/* ---- the whole predicate ---- */
const posting = (over: Partial<JobPosting> = {}): JobPosting => ({
  sourceRef: "1",
  title: "Senior Backend Engineer",
  company: "Monzo",
  location: "London",
  remote: false,
  url: "https://example.com/1",
  salaryText: "£95,000 - £120,000",
  postedAt: null,
  snippet: null,
  tags: [],
  ...over,
});
const criteria = (over: Partial<SearchCriteria> = {}): SearchCriteria => ({
  titleQuery: "backend engineer",
  location: "London",
  remoteOnly: false,
  minSalary: null,
  ...over,
});

ok("a straightforward hit", matches(posting(), criteria()));
ok(
  "wrong title rejected",
  !matches(posting({ title: "Account Executive" }), criteria()),
);
ok("wrong city rejected", !matches(posting({ location: "Munich" }), criteria()));
ok(
  "unknown location still passes a located search",
  matches(posting({ location: null }), criteria()),
);
ok(
  "salary floor rejects a documented lower salary",
  !matches(posting({ salaryText: "£60,000" }), criteria({ minSalary: 90_000 })),
);
ok(
  "salary floor does NOT reject an undisclosed salary",
  matches(posting({ salaryText: null }), criteria({ minSalary: 90_000 })),
);
ok(
  "remote-only rejects an explicitly on-site role",
  !matches(posting({ remote: false }), criteria({ remoteOnly: true })),
);
ok(
  "remote-only accepts a source that does not say",
  matches(posting({ remote: null }), criteria({ remoteOnly: true })),
);
ok(
  "remote-only ignores the place filter entirely",
  matches(
    posting({ remote: true, location: "Worldwide" }),
    criteria({ remoteOnly: true, location: "London" }),
  ),
);

/* ---- soft de-duplication across sources ---- */
ok(
  "same job from two sources collapses",
  softKey(
    posting({ company: "Monzo", title: "Senior Backend Engineer (Remote)" }),
  ) === softKey(posting({ company: "monzo", title: "Senior  Backend  Engineer" })),
);
ok(
  "different roles stay distinct",
  softKey(posting({ title: "Senior Backend Engineer" })) !==
    softKey(posting({ title: "Senior Frontend Engineer" })),
);

/* ---- normalisation, against payloads recorded from the live APIs ----
 *
 * These fixtures exist because of a real bug: Greenhouse and Remotive send the
 * id as a NUMBER, the mapping treated a non-string as absent, and every
 * posting from both sources was silently dropped. Types passed, lint passed,
 * and the only symptom was a board that "answered but has no open roles".
 * The id types below are part of the assertion, not an accident of the sample.
 */
const fixtures = JSON.parse(
  readFileSync(new URL("./fixtures-job-sources.json", import.meta.url), "utf8"),
) as Record<string, unknown>;

const gh = normaliseGreenhouse(fixtures.greenhouse, "Monzo");
ok("greenhouse: one posting mapped", gh.length === 1);
ok("greenhouse: NUMERIC id becomes a string ref", gh[0]?.sourceRef === "8143930");
ok(
  "greenhouse: nested location read",
  gh[0]?.location?.includes("London") === true,
);
ok("greenhouse: remote inferred from location text", gh[0]?.remote === true);
ok("greenhouse: absolute url kept", gh[0]?.url.startsWith("https://") === true);

const rm = normaliseRemotive(fixtures.remotive);
ok("remotive: one posting mapped", rm.length === 1);
ok("remotive: NUMERIC id becomes a string ref", rm[0]?.sourceRef === "2091045");
ok("remotive: always flagged remote", rm[0]?.remote === true);
ok("remotive: html description stripped", !rm[0]?.snippet?.includes("<"));

const ash = normaliseAshby(fixtures.ashby, "Notion");
ok("ashby: one posting mapped", ash.length === 1);
ok(
  "ashby: string id kept",
  typeof ash[0]?.sourceRef === "string" && ash[0].sourceRef.length > 10,
);
ok("ashby: real boolean remote", ash[0]?.remote === true);
ok("ashby: company comes from the board label", ash[0]?.company === "Notion");

const ab = normaliseArbeitnow(fixtures.arbeitnow);
ok("arbeitnow: one posting mapped", ab.length === 1);
ok("arbeitnow: slug is the ref", ab[0]?.sourceRef.includes("kulinarisch") === true);
ok('arbeitnow: the STRING "False" becomes boolean false', ab[0]?.remote === false);
ok("arbeitnow: unix-seconds timestamp parsed", ab[0]?.postedAt instanceof Date);
ok(
  "arbeitnow: timestamp is plausible, not 1970",
  (ab[0]?.postedAt?.getFullYear() ?? 0) > 2020,
);

/* ---- every source must yield a usable ref ---- */
for (const [name, postings] of Object.entries({ gh, rm, ash, ab })) {
  ok(
    `${name}: every posting has a non-empty ref, title and url`,
    postings.every((p) => p.sourceRef && p.title && p.url),
  );
}

let failed = 0;
for (const [label, pass] of checks) {
  if (!pass) failed++;
  console.log(`  ${pass ? "ok  " : "FAIL"} ${label}`);
}
console.log(
  failed
    ? `\n${failed} of ${checks.length} discovery match check(s) failed`
    : `\nall ${checks.length} discovery match checks pass`,
);
if (failed) process.exit(1);
