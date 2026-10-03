/**
 * Seeds a realistic pipeline for trying Alfred out without an AI provider.
 * Safe to re-run: it clears only the rows it owns.
 */
import { db } from "../src/db";
import {
  actionables,
  analyses,
  applications,
  events,
  mailMessages,
  questions,
} from "../src/db/schema";
import { runMigrations } from "../src/db/migrate";
import {
  createApplication,
  saveActionables,
  saveAnalysis,
  saveQuestionnaire,
} from "../src/lib/mutations";
import { moveApplication } from "../src/lib/mutations";
import { saveSettings } from "../src/lib/settings";

const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY);
const ahead = (days: number) => new Date(Date.now() + days * DAY);

runMigrations();

for (const table of [questions, actionables, analyses, events, mailMessages, applications]) {
  db.delete(table).run();
}

saveSettings({
  profile: {
    name: "Alex Rivera",
    headline: "Senior backend engineer — distributed systems, Go, Postgres",
    yearsExperience: 7,
    resume: `Senior Backend Engineer with 7 years building high-throughput services.

Mercury Payments (2021–present) — Senior Engineer, Platform
- Owned the ledger service: Go, Postgres, Kafka. 12k writes/sec peak, p99 under 40ms.
- Led the migration off a monolithic Rails billing path; cut settlement latency from 6h to 11min.
- Built the idempotency layer that eliminated duplicate-charge incidents (was ~3/quarter, now zero).

Northwind Logistics (2018–2021) — Backend Engineer
- Route optimization service in Python, then rewrote the hot path in Go for a 9x speedup.
- Introduced Postgres partitioning for a 400M-row shipments table.

Skills: Go, Python, Postgres, Kafka, Redis, gRPC, Kubernetes, Terraform, AWS.
Weaker on: frontend work, Rust, and formal ML systems.`,
    skills: ["Go", "Postgres", "Kafka", "Kubernetes", "gRPC", "Redis", "AWS"],
    targetRoles: ["Staff Engineer", "Senior Backend Engineer", "Tech Lead"],
    locations: ["Remote EU", "Berlin", "Amsterdam"],
    compensationTarget: "170–210k EUR base",
  },
});

const seeds = [
  {
    company: "Stripe",
    title: "Staff Engineer, Payments Infrastructure",
    location: "Remote (EU)",
    workMode: "remote",
    seniority: "staff",
    salaryMin: 190000,
    salaryMax: 240000,
    currency: "EUR",
    stage: "technical" as const,
    priority: 3,
    tags: ["go", "payments", "distributed-systems"],
    appliedAt: ago(21),
    nextActionAt: ahead(3),
    nextActionLabel: "System design round",
    description: `We're hiring a Staff Engineer for Payments Infrastructure — the systems that move money for millions of businesses.

What you'll do:
- Own correctness and latency for the core ledger and settlement pipeline
- Design idempotent, exactly-once money movement across unreliable downstreams
- Lead multi-quarter technical direction; mentor senior engineers

Requirements:
- 8+ years building distributed backend systems at scale
- Deep Postgres expertise: partitioning, query planning, replication
- Strong Go or Java; experience with Kafka or equivalent log-based systems
- Track record owning systems where correctness is non-negotiable
- Experience with financial ledgers or double-entry accounting a strong plus`,
    stages: ["applied", "screening", "technical"] as const,
    analysis: {
      fitScore: 84,
      verdict: "Strong fit, light on staff scope",
      summary:
        "This is squarely in your wheelhouse: a correctness-critical ledger in Go on Postgres is what you've done at Mercury for three years. The gap is scope — they want eight-plus years and multi-quarter technical leadership, and your experience reads as strong senior rather than proven staff.",
      skills: [
        { skill: "Go", level: "have" as const, note: "Primary language for 4 years" },
        { skill: "Postgres at scale", level: "have" as const, note: "400M-row partitioning" },
        { skill: "Kafka", level: "have" as const, note: "Ledger event pipeline" },
        { skill: "Financial ledgers", level: "have" as const, note: "Direct ledger ownership" },
        { skill: "Idempotency / exactly-once", level: "have" as const, note: "Built the layer that killed duplicate charges" },
        { skill: "Staff-level scope", level: "partial" as const, note: "Led a migration, but no multi-quarter org-wide direction" },
        { skill: "Mentoring seniors", level: "partial" as const, note: "Implied but not evidenced" },
        { skill: "Double-entry accounting", level: "partial" as const, note: "Ledger work, but accounting model unstated" },
      ],
      strengths: [
        "The duplicate-charge elimination is the single best story you have — it is exactly the correctness bar they describe",
        "12k writes/sec at p99 40ms is a concrete scale number that clears their bar",
        "Rails-to-Go settlement migration shows you can land a risky multi-team change",
      ],
      gaps: [
        "Seven years against a stated eight-plus — close, but you need the scope to compensate",
        "No evidence of setting technical direction beyond a single service",
        "Nothing on your résumé speaks to mentoring other senior engineers",
      ],
      interviewFocus: [
        "Idempotency and exactly-once semantics",
        "Postgres isolation levels and locking",
        "Designing a ledger with double-entry invariants",
        "Handling partial failure across downstream providers",
        "Staff-scope leadership stories",
      ],
      salaryInsight:
        "Stripe staff in the EU typically lands 190–240k EUR base plus equity, so the posted range is real. Your 170–210k target is below their midpoint — anchor at 215k rather than naming your current target.",
      positioning:
        "Lead with correctness, not throughput. Open your résumé summary with the duplicate-charge elimination and the settlement latency cut, both with numbers. Reframe the Rails migration as technical direction you set and drove, since that is the staff signal they will be looking for.",
    },
    actionables: {
      overview:
        "This loop will test correctness reasoning far harder than raw algorithms. Weight your time toward idempotency, Postgres isolation, and a rehearsed ledger design, and prepare two staff-scope stories.",
      items: [
        { kind: "leetcode" as const, title: "LRU Cache", detail: "Implement get/put in O(1). Build it from scratch twice without looking.", rationale: "Stripe screens commonly use cache design as a warm-up before the ledger discussion.", difficulty: "medium" as const, pattern: "hash map + doubly linked list", estMinutes: 45, url: "https://leetcode.com/problems/lru-cache/", priority: 3, tags: ["design", "hashmap"] },
        { kind: "leetcode" as const, title: "Insert Delete GetRandom O(1)", detail: "Array plus index map. Pay attention to the swap-with-last deletion trick.", rationale: "Same O(1)-structure family as LRU; cheap second rep on the same muscle.", difficulty: "medium" as const, pattern: "hash map + array", estMinutes: 30, url: "https://leetcode.com/problems/insert-delete-getrandom-o1/", priority: 2, tags: ["design", "hashmap"] },
        { kind: "leetcode" as const, title: "Merge Intervals", detail: "Sort then sweep. Then do the variant where intervals arrive as a stream.", rationale: "Settlement windows and reconciliation ranges are interval problems in disguise.", difficulty: "medium" as const, pattern: "sorting + sweep line", estMinutes: 35, url: "https://leetcode.com/problems/merge-intervals/", priority: 2, tags: ["intervals", "sorting"] },
        { kind: "leetcode" as const, title: "Course Schedule", detail: "Cycle detection on a directed graph via Kahn's algorithm.", rationale: "Dependency ordering shows up in transaction settlement graphs.", difficulty: "medium" as const, pattern: "topological sort", estMinutes: 40, url: "https://leetcode.com/problems/course-schedule/", priority: 2, tags: ["graph", "toposort"] },
        { kind: "leetcode" as const, title: "Design Hit Counter", detail: "Count events in a sliding 5-minute window with bounded memory.", rationale: "Rate limiting is a near-certain Stripe infrastructure question.", difficulty: "medium" as const, pattern: "sliding window", estMinutes: 30, url: "https://leetcode.com/problems/design-hit-counter/", priority: 3, tags: ["sliding-window", "rate-limiting"] },
        { kind: "concept" as const, title: "Postgres isolation levels, precisely", detail: "Be able to state what read committed, repeatable read, and serializable each prevent, and what a serialization failure looks like to your application.", rationale: "They name Postgres depth explicitly, and a ledger discussion goes straight here.", difficulty: null, pattern: null, estMinutes: 90, url: "https://www.postgresql.org/docs/current/transaction-iso.html", priority: 3, tags: ["postgres", "transactions"] },
        { kind: "concept" as const, title: "Exactly-once is at-least-once plus idempotency", detail: "Write out why exactly-once delivery is impossible and how idempotency keys recover the property. Use your Mercury work as the worked example.", rationale: "Your strongest story lives here — make sure you can explain the theory behind it, not just the implementation.", difficulty: null, pattern: null, estMinutes: 60, url: null, priority: 3, tags: ["distributed-systems", "idempotency"] },
        { kind: "concept" as const, title: "Double-entry accounting for engineers", detail: "Debits, credits, why the ledger must always balance, and how that invariant is enforced in a database.", rationale: "Listed as a strong plus and flagged as a partial gap in your analysis.", difficulty: null, pattern: null, estMinutes: 75, url: null, priority: 2, tags: ["ledger", "accounting"] },
        { kind: "system_design" as const, title: "Design Stripe's settlement pipeline", detail: "Money in, money out, across providers that time out and double-charge. Cover the ledger schema, idempotency, reconciliation, and what happens when a provider's response is lost.", rationale: "This is the role's core problem. Rehearse it out loud, twice, on a whiteboard.", difficulty: "hard" as const, pattern: null, estMinutes: 120, url: null, priority: 3, tags: ["system-design", "payments"] },
        { kind: "system_design" as const, title: "Design a distributed rate limiter", detail: "Token bucket across N nodes. Discuss Redis vs local counters, clock skew, and the accuracy/latency trade.", rationale: "Standard Stripe infrastructure question and a natural follow-on from the hit counter problem.", difficulty: "medium" as const, pattern: null, estMinutes: 75, url: null, priority: 2, tags: ["system-design", "rate-limiting"] },
        { kind: "behavioral" as const, title: "The duplicate-charge story, staff-framed", detail: "Three-to-zero incidents per quarter. Tell it as technical direction you set — how you found the root cause, who you had to convince, and what you changed organizationally so it stayed fixed.", rationale: "Your best evidence, and the version that answers their staff-scope requirement rather than just the engineering one.", difficulty: null, pattern: null, estMinutes: 45, url: null, priority: 3, tags: ["star", "ownership"] },
        { kind: "behavioral" as const, title: "The Rails-to-Go migration, as leadership", detail: "6h to 11min settlement latency. Emphasize sequencing, risk management, and how you kept the business running during the cutover.", rationale: "Directly addresses the 'no multi-quarter direction' gap.", difficulty: null, pattern: null, estMinutes: 40, url: null, priority: 3, tags: ["star", "leadership"] },
        { kind: "behavioral" as const, title: "A time you mentored a senior engineer", detail: "Find a real example. If you genuinely have none, prepare an honest answer about what you have done and what you want to grow into.", rationale: "Explicit requirement with no supporting evidence on your résumé — do not get caught flat here.", difficulty: null, pattern: null, estMinutes: 30, url: null, priority: 2, tags: ["star", "mentoring"] },
        { kind: "research" as const, title: "Read Stripe's engineering blog on idempotency and Increment", detail: "Their public writing on API idempotency and reliability. Note two specifics you can reference by name.", rationale: "Referencing their own published reasoning back at them is the cheapest credibility you can buy.", difficulty: null, pattern: null, estMinutes: 60, url: "https://stripe.com/blog/engineering", priority: 2, tags: ["company-research"] },
        { kind: "research" as const, title: "Know the EU staff compensation band", detail: "Check levels.fyi for Stripe staff in Berlin and Amsterdam before any number is discussed.", rationale: "Your stated target is below their midpoint; going in uninformed costs real money.", difficulty: null, pattern: null, estMinutes: 25, url: "https://www.levels.fyi/companies/stripe/salaries", priority: 3, tags: ["compensation"] },
      ],
    },
    questionnaire: [
      { question: "Walk me through how you'd guarantee a payment is never processed twice.", category: "technical", probing: "Whether you understand that exactly-once delivery is impossible and idempotency is the real mechanism.", suggestedAnswer: "You can't get exactly-once delivery, so I don't try — I get at-least-once delivery plus idempotent processing. At Mercury every money-movement request carries a client-supplied idempotency key. We write that key into Postgres under a unique constraint in the same transaction as the ledger entry, so a retry either sees the constraint violation and returns the original result, or it's the first write and proceeds. The key point is that the dedupe record and the side effect commit atomically; if you store the key in Redis and the ledger in Postgres, you've just moved the race. That pattern took us from about three duplicate-charge incidents a quarter to zero." },
      { question: "What Postgres isolation level would you use for ledger writes, and why?", category: "technical", probing: "Depth on transaction semantics, and whether you know the cost of serializable.", suggestedAnswer: "Read committed by default, with explicit locking where I need more. Repeatable read and serializable both cost you retries under contention, and on a hot ledger that's a throughput problem. For the balance-check-then-debit pattern, I take a SELECT FOR UPDATE on the account row, which gives me the serialization I actually need on exactly the rows that need it. Where the invariant spans rows — the double-entry sum must be zero — I'd push that into a constraint or a trigger rather than relying on isolation. And whatever level you pick, the application has to handle serialization failures as a retry, not a 500." },
      { question: "Tell me about a time you eliminated an entire class of bug.", category: "behavioral", probing: "Whether you go after root causes or patch symptoms — and whether the fix outlasted you.", suggestedAnswer: "We were seeing roughly three duplicate-charge incidents a quarter, and each one was being handled as an individual bug. I pushed back on that framing and traced them to a common cause: retries at the API edge with no idempotency contract, so any network timeout could produce a second charge. Rather than fix the call sites, I built an idempotency layer into the ledger service and made the key mandatory at the API boundary, which meant a migration across four client teams. That was the hard part — I had to make the case that the churn was worth it. We've had zero duplicate-charge incidents since, and because the key is required rather than optional, new code can't reintroduce the bug." },
      { question: "You have seven years of experience and this role asks for eight-plus. Why are you ready?", category: "behavioral", probing: "Self-awareness, and whether you argue with the premise or answer it.", suggestedAnswer: "Fair question, and I won't pretend the number isn't what it is. What I'd point at instead is scope: for the last three years I've owned the ledger end to end — correctness, latency, on-call, and the roadmap — at 12k writes a second with money on the line. I drove the settlement migration across teams and set the idempotency contract the rest of the organization now builds against. Where I'm genuinely still growing is influence beyond my own service and mentoring other senior engineers, and that's a large part of why this role appeals to me. I'd rather be honest about the edge of my experience than oversell it." },
      { question: "Design a system that moves money between two providers that can both time out.", category: "system_design", probing: "Whether you reach for a saga and reconciliation rather than hoping for distributed transactions.", suggestedAnswer: "I'd start by refusing to treat it as one transaction, because I can't have a distributed transaction across two providers. So: a saga with an explicit state machine per transfer, persisted in Postgres — initiated, debited, credited, settled, or needs-reconciliation. Every outbound call carries an idempotency key so a timeout can be retried safely. A timeout is specifically not a failure; it's an unknown, so the state machine parks the transfer and a reconciliation job polls the provider for the real outcome. Compensation is a reversing ledger entry, never a delete, so the audit trail stays intact. The thing I'd watch most closely is the needs-reconciliation queue depth — that's the metric that tells you a provider is misbehaving before your customers do." },
    ],
  },
  {
    company: "Datadog",
    title: "Senior Software Engineer, Metrics Ingestion",
    location: "Paris, FR",
    workMode: "hybrid",
    seniority: "senior",
    salaryMin: 95000,
    salaryMax: 125000,
    currency: "EUR",
    stage: "screening" as const,
    priority: 2,
    tags: ["go", "observability", "kafka"],
    appliedAt: ago(9),
    nextActionAt: ahead(1),
    nextActionLabel: "Recruiter call",
    description: `Join the team that ingests trillions of metric points per day.

What you'll do:
- Build and operate the ingestion path: Go services, Kafka, custom time-series storage
- Push p99 latency down while throughput keeps growing
- Own capacity planning and on-call for a tier-0 system

Requirements:
- 5+ years backend engineering, strong Go
- Experience with high-volume streaming systems (Kafka, Pulsar, Kinesis)
- Comfort with performance profiling and memory optimization
- Time-series or columnar storage experience a plus`,
    stages: ["applied", "screening"] as const,
    analysis: {
      fitScore: 76,
      verdict: "Good fit, unproven at their scale",
      summary:
        "Go plus Kafka plus a throughput-sensitive hot path is a direct match, and your Python-to-Go rewrite shows the profiling instinct they want. The stretch is magnitude: they run trillions of points a day, and your strongest number is 12k writes a second. Compensation is also well below your target.",
      skills: [
        { skill: "Go", level: "have" as const, note: "Primary language" },
        { skill: "Kafka", level: "have" as const, note: "Production ledger pipeline" },
        { skill: "Performance profiling", level: "have" as const, note: "9x speedup on the route hot path" },
        { skill: "High-volume streaming", level: "partial" as const, note: "12k/sec is real but orders of magnitude below theirs" },
        { skill: "Time-series storage", level: "gap" as const, note: "No evidence of columnar or TSDB work" },
        { skill: "Tier-0 on-call", level: "partial" as const, note: "Ledger on-call, smaller blast radius" },
      ],
      strengths: [
        "The 9x Go rewrite is exactly the profiling-and-optimize story this team hires for",
        "Kafka experience is hands-on and in production, not incidental",
        "Postgres partitioning on 400M rows shows you think about data layout",
      ],
      gaps: [
        "No time-series or columnar storage background, which they list as a plus and is really a core skill here",
        "Your scale numbers are far below theirs; expect to be probed on whether your instincts transfer",
        "Hybrid in Paris conflicts with your remote-EU preference",
      ],
      interviewFocus: [
        "Go memory model and GC tuning",
        "Kafka partitioning and consumer-group rebalancing",
        "Time-series compression (delta-of-delta, Gorilla)",
        "Profiling methodology under load",
      ],
      salaryInsight:
        "The posted 95–125k EUR tops out well under your 170–210k target. Datadog Paris senior bands are real but Europe-adjusted — this is likely a genuine mismatch rather than a negotiating position.",
      positioning:
        "Lead with the 9x rewrite and describe the profiling method, not just the result — that is the transferable signal when your absolute scale is smaller than theirs. Read one paper on time-series compression so the gap reads as curiosity rather than a blind spot.",
    },
    actionables: {
      overview:
        "Close the time-series gap first — it is the one real hole. Then rehearse the profiling story in method form, since your scale numbers won't carry the argument on their own.",
      items: [
        { kind: "concept" as const, title: "Read the Gorilla paper", detail: "Facebook's in-memory TSDB. Focus on delta-of-delta timestamp encoding and XOR float compression.", rationale: "This is the single highest-leverage item: it converts your one real gap into something you can discuss fluently.", difficulty: null, pattern: null, estMinutes: 90, url: "https://www.vldb.org/pvldb/vol8/p1816-teller.pdf", priority: 3, tags: ["time-series", "compression"] },
        { kind: "concept" as const, title: "Go GC and escape analysis", detail: "Know when allocations escape to the heap, how to read a pprof alloc profile, and what GOGC actually tunes.", rationale: "They name memory optimization explicitly, and ingestion work lives or dies on allocation rate.", difficulty: null, pattern: null, estMinutes: 75, url: "https://go.dev/doc/gc-guide", priority: 3, tags: ["go", "performance"] },
        { kind: "concept" as const, title: "Kafka consumer-group rebalancing", detail: "Why rebalances stall consumption, what cooperative sticky assignment changes, and how partition count bounds throughput.", rationale: "Operating a tier-0 Kafka ingestion path means rebalance pathologies will come up.", difficulty: null, pattern: null, estMinutes: 60, url: null, priority: 2, tags: ["kafka"] },
        { kind: "leetcode" as const, title: "Sliding Window Maximum", detail: "Monotonic deque, O(n). This is the shape of a streaming rollup.", rationale: "Metric aggregation over a time window is literally this problem.", difficulty: "hard" as const, pattern: "monotonic deque", estMinutes: 50, url: "https://leetcode.com/problems/sliding-window-maximum/", priority: 3, tags: ["sliding-window", "deque"] },
        { kind: "leetcode" as const, title: "Merge k Sorted Lists", detail: "Min-heap across k streams.", rationale: "Merging sorted time-series shards is the production version of this.", difficulty: "hard" as const, pattern: "heap", estMinutes: 45, url: "https://leetcode.com/problems/merge-k-sorted-lists/", priority: 2, tags: ["heap", "merge"] },
        { kind: "leetcode" as const, title: "Top K Frequent Elements", detail: "Heap and bucket-sort approaches. Then discuss how you'd do it approximately over a stream.", rationale: "Top-k over a metric stream is a real Datadog problem, and the follow-up is count-min sketch.", difficulty: "medium" as const, pattern: "heap / bucket sort", estMinutes: 40, url: "https://leetcode.com/problems/top-k-frequent-elements/", priority: 2, tags: ["heap", "streaming"] },
        { kind: "leetcode" as const, title: "Time Based Key-Value Store", detail: "Binary search over timestamped versions.", rationale: "Closest LeetCode analogue to a time-series point lookup.", difficulty: "medium" as const, pattern: "binary search", estMinutes: 35, url: "https://leetcode.com/problems/time-based-key-value-store/", priority: 3, tags: ["binary-search", "time-series"] },
        { kind: "system_design" as const, title: "Design Datadog's metrics ingestion path", detail: "Agent to edge to Kafka to storage. Cover cardinality explosion, backpressure, out-of-order points, and what degrades first under a traffic spike.", rationale: "The role's central design question. Cardinality is the trap — make sure you raise it before they do.", difficulty: "hard" as const, pattern: null, estMinutes: 110, url: null, priority: 3, tags: ["system-design", "observability"] },
        { kind: "behavioral" as const, title: "The 9x rewrite, told as method", detail: "Lead with how you found the bottleneck — profile first, hypothesis, measure — not with the 9x. Interviewers discount results and trust method.", rationale: "Your scale is smaller than theirs, so method is what transfers.", difficulty: null, pattern: null, estMinutes: 35, url: null, priority: 3, tags: ["star", "performance"] },
        { kind: "research" as const, title: "Decide your position on Paris and the salary band", detail: "The range caps 45k below your target and the role is hybrid in Paris. Work out your actual answer before the recruiter call tomorrow.", rationale: "Two hard constraints collide here. Going into a recruiter call without a position on either wastes everyone's time.", difficulty: null, pattern: null, estMinutes: 20, url: null, priority: 3, tags: ["compensation", "logistics"] },
      ],
    },
    questionnaire: [
      { question: "How would you handle cardinality explosion in a metrics system?", category: "technical", probing: "Whether you know cardinality — not volume — is what actually kills a TSDB.", suggestedAnswer: "Cardinality is the real failure mode, not point volume — a million points a second on a thousand series is fine, and a thousand points a second across a million series will take you down, because every unique tag combination becomes its own series with its own index entry and memory footprint. So I'd attack it at the source: enforce limits per customer and per metric at the ingestion edge, reject or aggregate away unbounded tags like request IDs and user IDs, and make the rejection visible to the customer rather than silent. Operationally I'd alert on new-series creation rate, since that's the leading indicator — by the time memory is climbing you're already in trouble. I haven't run a TSDB at Datadog's scale, but I hit the same shape of problem with Postgres partitioning: the cost was never the row count, it was how many partitions the planner had to consider." },
      { question: "Your largest system did 12k writes/sec. We do orders of magnitude more. Why does your experience transfer?", category: "technical", probing: "Honesty about scale, and whether your reasoning is principled or cargo-culted.", suggestedAnswer: "It transfers as method, not as a number, and I'd rather say that plainly than pretend 12k is close to what you run. What I've actually practised is finding the bottleneck rather than guessing at it. On the route service I had a Python hot path everyone assumed was CPU-bound; the profile showed it was allocation and serialization overhead, and the Go rewrite got 9x because it attacked that, not because Go is faster. The same discipline — profile before you change anything, form one hypothesis at a time, measure under realistic load — is what I'd bring here. What I'd genuinely have to learn is which things break first at your scale, because the failure modes at 12k and at trillions-per-day are not the same set, and I don't want to claim an intuition I haven't earned." },
      { question: "Why Datadog, and why now?", category: "culture", probing: "Whether you have a real reason or you're mass-applying.", suggestedAnswer: "I've spent three years on a system where correctness mattered more than anything else, and I want to spend the next few on one where latency and throughput are the hard constraint — that's a different set of muscles and I'd like to build them. Ingestion appeals specifically because it's the part of observability where the engineering is genuinely hard and the requirements are unambiguous: points in, no loss, low latency, enormous volume. I'd also say honestly that I'm talking to a few companies, and the two open questions for me here are the Paris hybrid expectation against my remote preference, and where the compensation band actually lands relative to what I'm targeting. I'd rather put those on the table early than six rounds in." },
    ],
  },
  {
    company: "Vercel",
    title: "Senior Engineer, Edge Runtime",
    location: "Remote",
    workMode: "remote",
    seniority: "senior",
    salaryMin: 160000,
    salaryMax: 200000,
    currency: "USD",
    stage: "applied" as const,
    priority: 2,
    tags: ["rust", "edge", "v8"],
    appliedAt: ago(4),
    description: `Build the runtime that executes customer code at the edge, in milliseconds, in 30+ regions.

Requirements:
- Strong systems programming: Rust, C++, or Go
- Familiarity with V8, WASM, or another sandboxed execution environment
- Experience with cold-start optimization and process isolation
- You care about p99, not p50`,
    stages: ["applied"] as const,
  },
  {
    company: "Figma",
    title: "Staff Backend Engineer, Multiplayer",
    location: "Remote (EU)",
    workMode: "remote",
    seniority: "staff",
    salaryMin: 200000,
    salaryMax: 250000,
    currency: "USD",
    stage: "wishlist" as const,
    priority: 3,
    tags: ["crdt", "realtime", "distributed-systems"],
    description: `Own the backend that keeps millions of simultaneous collaborators in sync.

Requirements:
- Deep distributed systems background
- Experience with CRDTs, operational transforms, or consensus protocols
- Comfort with the hardest category of concurrency bug
- 8+ years engineering experience`,
    stages: [] as const,
    notes: "Reach role. Referral from Dana would help a lot — ask her in January.",
  },
  {
    company: "Northwind Logistics",
    title: "Principal Engineer, Platform",
    location: "Amsterdam, NL",
    workMode: "hybrid",
    seniority: "principal",
    salaryMin: 150000,
    salaryMax: 180000,
    currency: "EUR",
    stage: "rejected" as const,
    priority: 1,
    tags: ["go", "logistics"],
    appliedAt: ago(38),
    description:
      "Principal Engineer to own platform direction across six teams. Requires 10+ years and prior principal-level scope.",
    stages: ["applied", "screening", "rejected"] as const,
    notes: "Former employer. Rejected at screening — they wanted prior principal scope.",
  },
  {
    company: "Linear",
    title: "Senior Backend Engineer",
    location: "Remote (EU)",
    workMode: "remote",
    seniority: "senior",
    salaryMin: 150000,
    salaryMax: 185000,
    currency: "EUR",
    stage: "offer" as const,
    priority: 3,
    tags: ["typescript", "postgres", "sync"],
    appliedAt: ago(45),
    nextActionAt: ahead(5),
    nextActionLabel: "Offer decision deadline",
    description: `Work on the sync engine behind Linear's local-first architecture.

Requirements:
- Strong backend fundamentals, Postgres depth
- Interest in local-first and sync engine design
- TypeScript (we'll teach you ours if you're strong elsewhere)`,
    stages: ["applied", "screening", "technical", "onsite", "offer"] as const,
    notes: "Offer: 172k EUR base + equity. Decision needed in 5 days.",
  },
];

for (const seed of seeds) {
  const app = createApplication({
    company: seed.company,
    title: seed.title,
    description: seed.description,
    location: seed.location,
    workMode: seed.workMode,
    seniority: seed.seniority,
    salaryMin: seed.salaryMin,
    salaryMax: seed.salaryMax,
    currency: seed.currency,
    priority: seed.priority,
    tags: [...seed.tags],
    appliedAt: "appliedAt" in seed ? seed.appliedAt : null,
    nextActionAt: "nextActionAt" in seed ? seed.nextActionAt : null,
    nextActionLabel: "nextActionLabel" in seed ? seed.nextActionLabel : null,
    notes: "notes" in seed ? seed.notes : null,
    stage: "wishlist",
  });

  // Replay the stage history so the funnel reflects what each application cleared.
  for (const stage of seed.stages ?? []) {
    moveApplication(app.id, stage);
  }

  if ("analysis" in seed && seed.analysis) {
    saveAnalysis(app.id, seed.analysis, "seed", "demo-data");
  }
  if ("actionables" in seed && seed.actionables) {
    saveActionables(app.id, seed.actionables, "seed", "demo-data");
  }
  if ("questionnaire" in seed && seed.questionnaire) {
    saveQuestionnaire(
      app.id,
      { questions: seed.questionnaire as never },
      "seed",
      "demo-data",
    );
  }
}

// A couple of pending inbox items so the triage flow has something to show.
db.insert(mailMessages)
  .values([
    {
      messageId: "<seed-interview-invite@stripe.com>",
      fromAddress: "recruiting@stripe.com",
      fromName: "Stripe Recruiting",
      subject: "Your system design round — scheduling",
      snippet:
        "Great feedback from the coding round. We'd like to schedule your system design interview for next week.",
      body: "Hi Alex,\n\nGreat feedback from the coding round. We'd like to schedule your system design interview for next week. Are you free Thursday at 14:00 CET?\n\nBest,\nStripe Recruiting",
      receivedAt: ago(1),
      classification: "interview_invite",
      confidence: 0.94,
      detectedCompany: "Stripe",
      detectedTitle: "Staff Engineer, Payments Infrastructure",
      suggestedStage: "technical",
      status: "pending",
    },
    {
      messageId: "<seed-recruiter@hashicorp.com>",
      fromAddress: "talent@hashicorp.com",
      fromName: "Priya at HashiCorp",
      subject: "Senior Go role on the Consul team?",
      snippet:
        "Came across your ledger work. We're hiring senior Go engineers on Consul — worth a chat?",
      body: "Hi Alex,\n\nCame across your ledger work at Mercury. We're hiring senior Go engineers on the Consul team — distributed systems, service mesh, lots of Raft. Worth a 20-minute chat?\n\nPriya",
      receivedAt: ago(2),
      classification: "recruiter_outreach",
      confidence: 0.88,
      detectedCompany: "HashiCorp",
      detectedTitle: "Senior Go Engineer, Consul",
      suggestedStage: null,
      status: "pending",
    },
    {
      messageId: "<seed-assessment@datadog.com>",
      fromAddress: "no-reply@datadoghq.com",
      fromName: "Datadog",
      subject: "Next step: 90-minute take-home",
      snippet:
        "Please complete the attached take-home within 5 days. It covers streaming aggregation in Go.",
      body: "Hi Alex,\n\nThanks for speaking with us. Please complete the attached take-home within 5 days. It covers streaming aggregation in Go.\n\nDatadog Recruiting",
      receivedAt: ago(3),
      classification: "assessment",
      confidence: 0.91,
      detectedCompany: "Datadog",
      detectedTitle: "Senior Software Engineer, Metrics Ingestion",
      suggestedStage: "screening",
      status: "pending",
    },
  ])
  .run();

const counts = {
  applications: db.select().from(applications).all().length,
  actionables: db.select().from(actionables).all().length,
  questions: db.select().from(questions).all().length,
  analyses: db.select().from(analyses).all().length,
  mail: db.select().from(mailMessages).all().length,
};

console.log("Seeded Alfred:", counts);
