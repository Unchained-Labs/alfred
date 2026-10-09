/*
 * Renders a fixture handbook and asserts the result.
 *
 * Deterministic and offline: it never calls a provider, so it can gate every
 * commit. What it guards is the half of this feature that cannot be checked by
 * types — that markdown becomes the right elements, and that NOTHING from the
 * content reaches the page as markup. The fixture deliberately contains a
 * script tag, a `javascript:` URL and an unbalanced quote.
 *
 *   npm run check:handbook
 */
import { writeFileSync } from "node:fs";
import { renderHandbook, type HandbookContent } from "@/lib/handbook/render";

const content: HandbookContent = {
  plan: {
    title: "The Ledger Interview Handbook",
    eyebrow: "Personal prep · Senior Backend Engineer · Stripe · Remote",
    lede: "Everything for this loop, cut into parts. Each opens with three lines, so you can stop anywhere and still have the gist.",
    routes: [
      {
        label: "10 minutes",
        detail: "The company and what to say.",
        parts: ["company", "interview"],
      },
      {
        label: "One evening",
        detail: "Company, the ledger, their hard problems.",
        parts: ["company", "ledger", "hard"],
      },
      {
        label: "Full prep",
        detail: "All parts in order.",
        parts: ["company", "ledger", "hard", "interview"],
      },
    ],
    parts: [
      {
        id: "company",
        title: "Stripe, in plain words",
        short: "The company",
        minutes: 8,
        emphasis: "company",
        intent: "Fixture.",
        tldr: [
          "Stripe moves money and records every movement in a double-entry ledger.",
          "The team owns the write path at 40k writes/sec on Postgres.",
          "Idempotency is the product, not a feature.",
        ],
        body: `## What they actually do\n\nStripe's ledger records **every movement of money**. A payment debits one account and credits another as one balanced transaction.\n\n### The scale that shapes the design\n\n| Property | Figure | Why it matters |\n|---|---|---|\n| Peak writes | 40k/sec | Rules out a single balance row per account |\n| p99 target | <100ms | Rules out synchronous fan-out |\n| Durability | Postgres | System of record, not a cache |\n\nSome things to hold onto:\n\n- A duplicate must *never* double-move money.\n- A lost write must never be silent.\n- Hot merchants take thousands of writes/sec against one balance.\n\n\`\`\`sql\nINSERT INTO idempotency_keys (merchant_id, key, request_hash)\nVALUES ($1, $2, $3)\nON CONFLICT (merchant_id, key) DO NOTHING;\n\`\`\`\n\n> The posting leads on idempotency and exactly-once under retries. Worth confirming how much is enforced in the database.`,
        notes: [
          {
            tone: "say",
            title: "Say it like this",
            body: "“The key insert and the ledger entries commit in the same transaction, so there is no window where money moved but the key is absent.”",
          },
          {
            tone: "trap",
            title: "Trap",
            body: "Describing a `SELECT` before the `INSERT`. Two nodes racing both pass that check.",
          },
          {
            tone: "why",
            title: "Why it matters here",
            body: "They own the write path. Everything else is downstream of getting this right.",
          },
        ],
        cards: [
          {
            title: "Double-entry",
            body: "Every transaction has balanced debits and credits. Non-negotiable.",
          },
          {
            title: "Outbox",
            body: "Events written in the same transaction, relayed separately. No dual writes.",
          },
        ],
      },
      {
        id: "ledger",
        title: "The write path, end to end",
        short: "The ledger",
        minutes: 14,
        emphasis: "must",
        intent: "Fixture.",
        tldr: [
          "One transaction: key row plus entries.",
          "Replays return the stored response; in-flight returns 409.",
          "Balances are derived, never a single updated row.",
        ],
        body: `## The transaction\n\nOne Postgres transaction does all of it. The uniqueness is enforced by the **database**, not by a prior read.\n\n1. Insert the idempotency key, \`ON CONFLICT DO NOTHING\`.\n2. If the insert took the row, insert the balanced entries.\n3. Commit.\n\nIf the insert did not take the row, this is a replay.`,
        notes: [],
        cards: [],
      },
      {
        id: "hard",
        title: "Their hard problems",
        short: "Hard problems",
        minutes: 12,
        emphasis: "leadership",
        intent: "Fixture.",
        tldr: [
          "Hot accounts serialise on one lock unless balances are sharded.",
          "Crash windows: commit-then-crash, and DB-then-Kafka.",
          "Retention of keys bounds how long a retry stays safe.",
        ],
        body: `## Hot accounts\n\nA large merchant taking thousands of writes/sec will **serialise on one balance row** if you \`SELECT FOR UPDATE\` it. That is what destroys the p99.\n\n- Append-only entries, balance derived from a snapshot plus the tail.\n- Or shard the balance row into N sub-rows and sum them.`,
        notes: [
          {
            tone: "tip",
            title: "Tip",
            body: "Name the number. “Every writer queues behind one lock” is the sentence that lands.",
          },
        ],
        cards: [],
      },
      {
        id: "interview",
        title: "The loop, and what to say",
        short: "The loop",
        minutes: 9,
        emphasis: "must",
        intent: "Fixture.",
        tldr: [
          "Four stages over about three weeks.",
          "The design round is the one that decides it.",
          "Lead with the mechanism, then the trade-off.",
        ],
        body: `## Stages\n\n| Stage | Who | What they test |\n|---|---|---|\n| Screen | Recruiter | Logistics, motivation |\n| Design | Senior engineer | The write path |\n| Coding | Two engineers | Clean, tested code |\n| Values | Hiring manager | How you work |`,
        notes: [],
        cards: [],
      },
    ],
  },
  drills: {
    flashcards: [
      {
        category: "Idempotency",
        question: "How do you make concurrent duplicates safe?",
        answer: [
          "A unique constraint on (scope, key)",
          "INSERT ... ON CONFLICT DO NOTHING",
          "Key and entries in ONE transaction",
          "Never check-then-act",
        ],
      },
      {
        category: "Idempotency",
        question: "Same key, different payload — what happens?",
        answer: [
          "Store a hash of the canonical request",
          "Mismatch is a client bug, not a retry",
          "Return 422, do not touch the ledger",
        ],
      },
      {
        category: "Postgres",
        question: "Why not SELECT FOR UPDATE on the balance?",
        answer: [
          "Every writer serialises on one lock",
          "Destroys the p99 under a hot merchant",
          "Derive the balance, or shard the row",
        ],
      },
      {
        category: "Behavioural",
        question: "Tell me about a system you took to production.",
        answer: [
          "What existed before",
          "The decision you owned",
          "The number that moved",
        ],
      },
    ],
    glossary: [
      {
        term: "Idempotency key",
        definition: "A caller-supplied token that makes a retry safe to replay.",
      },
      {
        term: "Outbox",
        definition:
          "A table written in the same transaction as the data, relayed to a broker separately.",
      },
      {
        term: "SIL",
        definition:
          "Software-in-the-loop. In safety contexts it means Safety Integrity Level — a different thing entirely.",
      },
      {
        term: "p99",
        definition:
          "The latency 99% of requests come in under. The number that gets you paged.",
      },
    ],
    stories: [
      {
        prompt: "A system you took to production",
        hint: "What existed before, the decision you owned, the result with a number.",
        tags: ["ownership"],
      },
      {
        prompt: "A time you disagreed with a senior engineer",
        hint: "How it got decided, and the relationship after.",
        tags: ["conflict", "judgement"],
      },
    ],
    asks: [
      {
        audience: "The hiring manager",
        questions: [
          "Where does work pile up today — review, integration, or decisions?",
          "What is on the critical path this quarter?",
        ],
      },
      {
        audience: "Engineers on the panel",
        questions: [
          "What is the most annoying part of your workflow?",
          "How do you test the write path before it ships?",
        ],
      },
    ],
    checklist: [
      {
        phase: "before",
        items: [
          "Re-read the TL;DR of every part.",
          "Say the two-minute intro out loud twice.",
        ],
      },
      {
        phase: "day",
        items: [
          "Paper and pen out — write keywords before answering.",
          "Ask your two questions and write down the answers.",
        ],
      },
      {
        phase: "after",
        items: [
          "Write down every question they asked.",
          "Send a short thank-you within 24 hours.",
        ],
      },
    ],
    sources: [
      {
        label: "PostgreSQL: INSERT ... ON CONFLICT",
        url: "https://www.postgresql.org/docs/current/sql-insert.html",
      },
      {
        label: "A link with a nasty label <script>alert(1)</script>",
        url: "javascript:alert(1)",
      },
    ],
  },
};

const html = renderHandbook(content, {
  id: "hb-fixture-0001",
  company: "Stripe",
  role: "Senior Backend Engineer",
  generatedAt: new Date("2026-10-09T12:00:00Z"),
  provider: "claude-code",
  model: "claude-sonnet-5-5",
});

console.log(`rendered ${(html.length / 1024).toFixed(1)} KB`);

// Writing the page out is for eyeballing it by hand, not for the check.
if (process.env.HANDBOOK_OUT) {
  writeFileSync(process.env.HANDBOOK_OUT, html);
  console.log(`wrote ${process.env.HANDBOOK_OUT}`);
}

const checks: [string, boolean][] = [
  ["doctype", html.startsWith("<!doctype html>")],
  ["title present", html.includes("<title>The Ledger Interview Handbook</title>")],
  ["4 parts rendered", (html.match(/<section class="part"/g) ?? []).length === 4],
  ["rail links", (html.match(/data-target="/g) ?? []).length === 4],
  ["routes rendered", html.includes('class="routes"')],
  ["tldr boxes", (html.match(/class="tldr"/g) ?? []).length === 4],
  ["markdown table -> html table", html.includes("<th>Property</th>")],
  ["second table too", html.includes("<th>Stage</th>")],
  [
    "fenced code escaped",
    html.includes("ON CONFLICT (merchant_id, key) DO NOTHING;"),
  ],
  ["blockquote", html.includes("<blockquote>")],
  ["ordered list", html.includes("<ol>")],
  ["notes rendered", (html.match(/class="note /g) ?? []).length === 4],
  ["cards rendered", (html.match(/class="card"/g) ?? []).length >= 2],
  ["flashcards section", html.includes('id="cards"')],
  ["flashcard data rows", (html.match(/data-q="/g) ?? []).length === 4],
  ["glossary", (html.match(/<dt>/g) ?? []).length === 4],
  ["stories", (html.match(/data-story-input="/g) ?? []).length === 2],
  ["asks", html.includes("The hiring manager")],
  [
    "checklist 3 phases",
    html.includes("The day before") &&
      html.includes("On the day") &&
      html.includes("Afterwards"),
  ],
  [
    "good source linked",
    html.includes("https://www.postgresql.org/docs/current/sql-insert.html"),
  ],
  ["js source link refused", !html.includes('href="javascript:')],
  ["nasty label escaped", html.includes("&lt;script&gt;alert(1)&lt;/script&gt;")],
  ["no live script tag from content", (html.match(/<script/g) ?? []).length === 1],
  ["css inlined", html.includes("--brand:#7a2e35")],
  ["js inlined", html.includes("alfred:hb:")],
  ["handbook id namespaced", html.includes('data-handbook="hb-fixture-0001"')],
  ["noindex", html.includes('name="robots" content="noindex"')],
];
let bad = 0;
for (const [name, pass] of checks) {
  if (!pass) bad++;
  console.log(`  ${pass ? "ok  " : "FAIL"} ${name}`);
}
if (bad) {
  console.error(`\n${bad} handbook render check(s) failed`);
  process.exit(1);
}
console.log("\nall handbook render checks pass");
