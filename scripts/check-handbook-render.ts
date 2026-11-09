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
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import type { HandbookLab, HandbookScene } from "@/lib/ai/schemas";
import { createRateLimit, parseAskRequest, sameSiteJson } from "@/lib/handbook/ask";
import { HARNESS, LAB_JS, WORKER } from "@/lib/handbook/lab";
import { ASK_JS, XP_JS } from "@/lib/handbook/play";
import {
  handbookComplete,
  renderHandbook,
  type HandbookContent,
} from "@/lib/handbook/render";
import { cleanScene, SCENE_JS } from "@/lib/handbook/scenes";

const XSS = `<img src=x onerror="alert(1)">`;

/** A scene step with every field empty, so fixtures only state what they use. */
const step = (patch: Partial<HandbookScene["steps"][number]>) => ({
  caption: "",
  values: [],
  highlight: [],
  visited: [],
  pointers: [],
  range: null,
  cells: [],
  entries: [],
  message: null,
  marker: null,
  ...patch,
});
const sceneBase = {
  items: [],
  nodes: [],
  edges: [],
  grid: null,
  axes: null,
  series: [],
};

/*
 * One part carries a lab: a sliding-window scene with a hostile caption, a
 * request-flow scene, a scene the schema rejects, a notebook cell whose code
 * tries to close its textarea, and a problem whose text is hostile too. The
 * other parts have no lab, which is how every handbook written before labs
 * looks — they must still render.
 */
const LAB: HandbookLab = {
  scenes: [
    {
      ...sceneBase,
      kind: "array",
      title: "Sliding window over fees",
      caption: `Keep the window's sum, never recompute it ${XSS}`,
      items: ["3", "1", "4", "1", "5"],
      steps: [
        step({
          caption: `Start with the first two ${XSS}`,
          range: { from: 0, to: 1 },
        }),
        step({
          caption: "Slide right: add 4, drop 3.",
          range: { from: 1, to: 2 },
          pointers: [{ label: "lo", index: 1 }],
        }),
        step({ caption: "Done.", highlight: ["4"] }),
      ],
    },
    {
      ...sceneBase,
      kind: "sequence",
      title: "An idempotent write",
      caption: "The key turns a retry into a read.",
      nodes: [
        { id: "c", label: "Client" },
        { id: "api", label: "API" },
        { id: "db", label: "Postgres" },
      ],
      steps: [
        step({
          caption: "POST with a key.",
          message: { from: "c", to: "api", label: "POST /charges" },
        }),
        step({
          caption: "Insert, or find the row.",
          message: { from: "api", to: "db", label: "INSERT … ON CONFLICT" },
        }),
        step({
          caption: "Nonsense edge dropped.",
          message: { from: "api", to: "ghost", label: "nowhere" },
        }),
      ],
    },
    // Not a kind the player knows: the whole scene is dropped.
    {
      ...sceneBase,
      kind: "hologram",
      title: "SHOULD-NOT-RENDER",
      caption: "",
      steps: [step({ caption: "x" })],
    } as unknown as HandbookScene,
  ],
  cells: [
    {
      title: "Count the duplicates",
      explain: "Change `n` and run again.",
      code: `n = 5\nprint("</textarea><script>alert(1)</script>")\nn * 2`,
    },
  ],
  problems: [
    {
      title: `Two sum ${XSS}`,
      difficulty: "easy",
      statement: `Return the indices of two numbers that add to target. ${XSS}`,
      functionName: "two_sum",
      starter: "def two_sum(nums, target):\n    pass\n",
      solution:
        "def two_sum(nums, target):\n    seen = {}\n    for i, x in enumerate(nums):\n        if target - x in seen:\n            return [seen[target - x], i]\n        seen[x] = i\n    return []\n",
      explanation: "Store what you have seen; look up the complement.",
      complexity: "O(n) time, O(n) space",
      hints: [
        "What would you need to have seen already?",
        "A dict from value to index.",
      ],
      tests: [
        { args: "[2, 7, 11, 15], 9", expected: "[0, 1]", hidden: false },
        { args: "[3, 2, 4], 6", expected: "[1, 2]", hidden: false },
        { args: "[3, 3], 6", expected: "[0, 1]", hidden: true },
        { args: "[1, 2], 7", expected: "[]", hidden: true },
      ],
    },
    {
      // An invalid function name: the problem is dropped, not run.
      title: "SHOULD-NOT-RENDER-PROBLEM",
      difficulty: "easy",
      statement: "x",
      functionName: "__import__('os').system",
      starter: "",
      solution: "",
      explanation: "",
      complexity: "",
      hints: [],
      tests: [{ args: "", expected: "None", hidden: false }],
    },
  ],
};

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
        covers: [],
        tldr: [
          "Stripe moves money and records every movement in a double-entry ledger.",
          "The team owns the write path at 40k writes/sec on Postgres.",
          "Idempotency is the product, not a feature.",
        ],
        body: `## What they actually do\n\nStripe's ledger records **every movement of money**. A payment debits one account and credits another as one balanced transaction.\n\n### The scale that shapes the design\n\n| Property | Figure | Why it matters |\n|---|---|---|\n| Peak writes | 40k/sec | Rules out a single balance row per account |\n| p99 target | <100ms | Rules out synchronous fan-out |\n| Durability | Postgres | System of record, not a cache |\n\nSome things to hold onto:\n\n- A duplicate must *never* double-move money.\n- A lost write must never be silent.\n- Hot merchants take thousands of writes/sec against one balance.\n\n\`\`\`sql\nINSERT INTO idempotency_keys (merchant_id, key, request_hash)\nVALUES ($1, $2, $3)\nON CONFLICT (merchant_id, key) DO NOTHING;\n\`\`\`\n\n> The posting leads on idempotency and exactly-once under retries. Worth confirming how much is enforced in the database.`,
        diagrams: [
          {
            kind: "flow",
            title: "The write path",
            caption:
              "The dashed arc is the part people forget: what the caller learns on a replay.",
            nodes: [
              { label: "Client", sub: "retries at 2s" },
              { label: "API node", sub: "idempotency key" },
              { label: "Postgres", sub: "one transaction" },
              { label: "Outbox", sub: "same commit" },
            ],
            edges: [
              { from: 0, to: 1, label: "POST" },
              { from: 1, to: 2, label: "INSERT" },
              { from: 2, to: 3, label: "event" },
              { from: 3, to: 0, label: "stored response" },
              // Deliberately out of range: must be dropped, never drawn.
              { from: 9, to: 2, label: "NONSENSE-EDGE" },
            ],
          },
        ],
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
        lab: LAB,
        title: "The write path, end to end",
        short: "The ledger",
        minutes: 14,
        emphasis: "must",
        intent: "Fixture.",
        covers: [],
        tldr: [
          "One transaction: key row plus entries.",
          "Replays return the stored response; in-flight returns 409.",
          "Balances are derived, never a single updated row.",
        ],
        body: `## The transaction\n\nOne Postgres transaction does all of it. The uniqueness is enforced by the **database**, not by a prior read.\n\n1. Insert the idempotency key, \`ON CONFLICT DO NOTHING\`.\n2. If the insert took the row, insert the balanced entries.\n3. Commit.\n\nIf the insert did not take the row, this is a replay.`,
        diagrams: [
          {
            kind: "stack",
            title: "Where each guarantee lives",
            caption:
              "Push determinism down. The layer that must be certain is the one holding the constraint.",
            nodes: [
              {
                label: "Client",
                sub: "Retries. Assumes nothing about what committed.",
              },
              {
                label: "Service",
                sub: "Scopes the key, compares the request hash.",
              },
              {
                label: "Postgres",
                sub: "The unique constraint. This is the arbiter.",
              },
            ],
            edges: [],
          },
        ],
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
        covers: [],
        tldr: [
          "Hot accounts serialise on one lock unless balances are sharded.",
          "Crash windows: commit-then-crash, and DB-then-Kafka.",
          "Retention of keys bounds how long a retry stays safe.",
        ],
        body: `## Hot accounts\n\nA large merchant taking thousands of writes/sec will **serialise on one balance row** if you \`SELECT FOR UPDATE\` it. That is what destroys the p99.\n\n- Append-only entries, balance derived from a snapshot plus the tail.\n- Or shard the balance row into N sub-rows and sum them.`,
        diagrams: [
          {
            kind: "cycle",
            title: "The retry loop",
            caption:
              "A timeout is not a failure, it is an unknown — and the loop must close on the same key.",
            nodes: [
              { label: "Send", sub: "key K1" },
              { label: "Timeout", sub: "at 2s" },
              { label: "Retry", sub: "same key" },
              { label: "Replay", sub: "stored response" },
            ],
            edges: [
              { from: 0, to: 1, label: "no answer" },
              { from: 1, to: 2, label: "" },
              { from: 2, to: 3, label: "conflict" },
              { from: 3, to: 0, label: "" },
            ],
          },
        ],
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
        covers: [],
        tldr: [
          "Four stages over about three weeks.",
          "The design round is the one that decides it.",
          "Lead with the mechanism, then the trade-off.",
        ],
        body: `## Stages\n\n| Stage | Who | What they test |\n|---|---|---|\n| Screen | Recruiter | Logistics, motivation |\n| Design | Senior engineer | The write path |\n| Coding | Two engineers | Clean, tested code |\n| Values | Hiring manager | How you work |`,
        diagrams: [],
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
  askUrl: "/api/applications/app-1/handbook/ask",
});
const downloaded = renderHandbook(content, {
  id: "hb-fixture-0001",
  company: "Stripe",
  role: "Senior Backend Engineer",
  generatedAt: new Date("2026-10-09T12:00:00Z"),
});
const script = html.slice(
  html.indexOf("<script>") + 8,
  html.lastIndexOf("</script>"),
);

/** Does this source parse as JavaScript? Parsed only, never run. */
const parses = (source: string) => {
  try {
    new Function(source);
    return true;
  } catch (error) {
    console.error(error);
    return false;
  }
};

/*
 * The Python harness, run for real against the reference solution and a wrong
 * one — if python3 is on this machine. Pyodide is CPython, so this is the
 * same code path the browser takes, minus the worker.
 */
function harness(solution: string, tests: unknown[]) {
  // A JSON string literal is also a valid Python string literal.
  const program = `${solution}\n__fn_name = "two_sum"\n__tests_json = ${JSON.stringify(JSON.stringify(tests))}\n${HARNESS}\nprint(__results_json)`;
  const run = spawnSync("python3", ["-c", program], { encoding: "utf8" });
  if (run.error) return null;
  return JSON.parse(run.stdout.trim()) as { ok: boolean; error: string }[];
}
const problem = LAB.problems[0];
const good = harness(problem.solution, problem.tests);
const wrong = harness(
  "def two_sum(nums, target):\n    return [0, 0]\n",
  problem.tests,
);
const sneaky = harness(problem.solution, [
  { args: "__import__('os').getcwd()", expected: "[]", hidden: false },
]);

const limit = createRateLimit(2, 1000);

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
  // Diagrams: drawn from data, animated, and hostile input dropped.
  ["3 diagrams framed", (html.match(/<figure class="dgm">/g) ?? []).length === 3],
  [
    "flow nodes drawn",
    html.includes(">API node<") && html.includes(">one transaction<"),
  ],
  [
    "flow travelling dots",
    (html.match(/<circle class="dgm-dot"/g) ?? []).length === 3,
  ],
  [
    "feedback arc drawn",
    (html.match(/<path class="dgm-back"/g) ?? []).length === 1,
  ],
  ["out-of-range edge dropped", !html.includes("nonsense")],
  [
    "stack drawn and interactive",
    html.includes("data-stack") && html.includes('data-layer="0"'),
  ],
  ["stack first layer selected", html.includes('aria-selected="true"')],
  [
    "cycle drawn with a sweep",
    html.includes('<circle class="dgm-ring"') &&
      html.includes('<g class="dgm-sweep"'),
  ],
  [
    "svg diagrams have accessible labels",
    (html.match(/<svg [^>]*role="img"/g) ?? []).length === 2,
  ],
  ["diagram css inlined", html.includes("@keyframes dgm-travel")],
  ["stack script inlined", html.includes("[data-stack]")],

  // Scenes: data in one escaped attribute, narration as a fallback list.
  [
    "2 valid scenes rendered",
    (html.match(/<figure class="scene"/g) ?? []).length === 2,
  ],
  [
    "unknown scene kind dropped",
    !html.includes("SHOULD-NOT-RENDER<") && !html.includes("hologram"),
  ],
  ["scene narration fallback", html.includes('<ol class="scene-steps">')],
  [
    "scene caption escaped in the list",
    html.includes("Start with the first two &lt;img src=x onerror="),
  ],
  [
    "scene JSON is attribute-escaped",
    html.includes('data-scene="{&quot;kind&quot;:&quot;array&quot;'),
  ],
  ["no raw hostile markup anywhere", !html.includes(XSS)],
  [
    "cleanScene drops edges to missing nodes",
    cleanScene({
      ...sceneBase,
      kind: "graph",
      title: "g",
      caption: "",
      nodes: [{ id: "a", label: "A" }],
      edges: [{ from: "a", to: "zz", label: "", weight: null }],
      steps: [step({ caption: "x" })],
    })?.edges.length === 0,
  ],
  [
    "cleanScene rejects a scene with no steps",
    cleanScene({
      ...sceneBase,
      kind: "array",
      title: "t",
      caption: "",
      steps: [],
    }) === null,
  ],
  [
    "cleanScene rejects junk",
    cleanScene({ kind: "array" }) === null && cleanScene("<svg>") === null,
  ],

  // Notebook and problems: code is text in a textarea, never markup.
  ["notebook rendered", html.includes('<div class="nb" data-ns="ledger">')],
  [
    "cell code escaped in its textarea",
    html.includes(
      "print(&quot;&lt;/textarea&gt;&lt;script&gt;alert(1)&lt;/script&gt;&quot;)",
    ),
  ],
  ["cell cannot close its textarea", !html.includes("</textarea><script>")],
  ["problem rendered", (html.match(/<div class="prob"/g) ?? []).length === 1],
  [
    "invalid function name drops the problem",
    !html.includes("SHOULD-NOT-RENDER-PROBLEM"),
  ],
  ["problem title escaped", html.includes("Two sum &lt;img src=x onerror=")],
  [
    "visible tests listed, hidden ones not",
    html.includes("two_sum([2, 7, 11, 15], 9)") &&
      !html.includes("two_sum([3, 3], 6)"),
  ],
  ["tests travel as escaped JSON", html.includes('data-tests="[{&quot;args&quot;')],
  ["solution behind a reveal", html.includes('<details class="prob-sol">')],
  [
    "Pyodide is pinned to the official CDN",
    html.includes("cdn.jsdelivr.net/pyodide/v0.29.3/full/"),
  ],

  // Old-format parts (no lab) still render, and count as unfinished.
  [
    "parts without a lab still render",
    (html.match(/<section class="part"/g) ?? []).length === 4,
  ],
  ["a handbook missing labs is not complete", handbookComplete(content) === false],
  [
    "a handbook with every lab is complete",
    handbookComplete({
      ...content,
      plan: {
        ...content.plan,
        parts: content.plan.parts.map((p) => ({ ...p, lab: LAB })),
      },
    }),
  ],

  // The page's scripts all parse, including the worker built from a string.
  ["inline script parses", parses(script)],
  ["scene player parses", parses(SCENE_JS)],
  ["lab script parses", parses(LAB_JS)],
  ["python worker parses", parses(WORKER)],
  ["xp script parses", parses(XP_JS)],
  ["ask script parses", parses(ASK_JS)],
  ["still one script element", (html.match(/<script/g) ?? []).length === 1],
  ["xp chip present", html.includes('id="xp"')],

  // The ask panel: live page only.
  [
    "live page points the panel at its endpoint",
    html.includes('data-ask="/api/applications/app-1/handbook/ask"'),
  ],
  ["downloaded copy has no ask endpoint", !downloaded.includes("data-ask=")],

  // The ask endpoint's checks, without a session or a model.
  ["ask: question required", !parseAskRequest({ question: "  " }).ok],
  [
    "ask: overlong question refused",
    !parseAskRequest({ question: "x".repeat(1001) }).ok,
  ],
  [
    "ask: junk body refused",
    !parseAskRequest("nope").ok && !parseAskRequest(null).ok,
  ],
  [
    "ask: selection and context are trimmed to size",
    (() => {
      const r = parseAskRequest({
        question: "why?",
        selection: "s".repeat(3000),
        context: "c".repeat(9000),
      });
      return (
        r.ok && r.value.selection.length === 2000 && r.value.context.length === 4000
      );
    })(),
  ],
  [
    "ask: JSON from the same site only",
    sameSiteJson(
      new Request("http://x/a", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "sec-fetch-site": "same-origin",
        },
      }),
    ) &&
      !sameSiteJson(
        new Request("http://x/a", {
          method: "POST",
          headers: { "content-type": "text/plain" },
        }),
      ) &&
      !sameSiteJson(
        new Request("http://x/a", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "sec-fetch-site": "cross-site",
          },
        }),
      ),
  ],
  [
    "ask: rate limit",
    limit("u", 0) &&
      limit("u", 10) &&
      !limit("u", 20) &&
      limit("u", 1500) &&
      limit("v", 20),
  ],
];

// The harness, when python3 exists to run it.
if (good && wrong && sneaky) {
  checks.push(
    ["harness: reference solution passes every test", good.every((r) => r.ok)],
    [
      "harness: a wrong solution fails",
      wrong.filter((r) => r.ok).length < wrong.length,
    ],
    [
      "harness: arguments are literals, never code",
      !sneaky[0].ok && /ValueError|malformed/i.test(sneaky[0].error),
    ],
  );
} else {
  console.log("  skip harness checks: python3 not available");
}
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
