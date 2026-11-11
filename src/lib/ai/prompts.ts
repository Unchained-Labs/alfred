import type { Analysis, Application } from "@/db/schema";
import type { UserProfile } from "@/lib/settings";

const BUTLER = `You are Alfred, a sharp, unsentimental job-search strategist.
You advise one candidate on one application at a time.

Rules you never break:
- Be concrete and specific to the posting in front of you. Generic advice is a failure.
- Be honest about fit. Inflated scores and flattery cost the candidate interviews.
- Never invent experience the candidate does not have. Work only from their stated background.
- When you cite a URL, cite only canonical ones you are confident exist. Otherwise return null.
- No preamble, no sign-off, no restating the question. Deliver the substance.`;

function list(label: string, values: string[] | null | undefined): string {
  if (!values?.length) return "";
  return `${label}: ${values.join(", ")}\n`;
}

function field(label: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  return `${label}: ${value}\n`;
}

/** Renders the candidate. Kept stable so it stays prompt-cache friendly. */
export function profileBlock(profile: UserProfile): string {
  const header = [
    field("Name", profile.name),
    field("Headline", profile.headline),
    field("Years of experience", profile.yearsExperience),
    list("Core skills", profile.skills),
    list("Target roles", profile.targetRoles),
    list("Preferred locations", profile.locations),
    field("Compensation target", profile.compensationTarget),
  ].join("");

  const resume = profile.resume.trim()
    ? `\nBackground in their own words:\n"""\n${profile.resume.trim()}\n"""\n`
    : "\nNo résumé on file — infer only from the fields above and say so where it limits you.\n";

  return `<candidate>\n${header}${resume}</candidate>`;
}

function salaryLine(app: Application): string {
  if (app.salaryMin == null && app.salaryMax == null) return "";
  const currency = app.currency ?? "USD";
  const range =
    app.salaryMin != null && app.salaryMax != null
      ? `${app.salaryMin.toLocaleString()}–${app.salaryMax.toLocaleString()}`
      : (app.salaryMin ?? app.salaryMax)!.toLocaleString();
  return `Posted compensation: ${range} ${currency}\n`;
}

/** Renders the job under consideration. */
export function jobBlock(app: Application): string {
  const header = [
    field("Company", app.company),
    field("Title", app.title),
    field("Location", app.location),
    field("Work mode", app.workMode),
    field("Seniority", app.seniority),
    salaryLine(app),
    field("Posting URL", app.jobUrl),
    field("Current pipeline stage", app.stage),
    list("Tags", app.tags),
  ].join("");

  const description = app.description?.trim()
    ? `\nPosting text:\n"""\n${app.description.trim()}\n"""\n`
    : "\nNo posting text was captured. Reason from the title, company, and seniority, and flag the uncertainty.\n";

  const notes = app.notes?.trim()
    ? `\nCandidate's own notes on this role:\n"""\n${app.notes.trim()}\n"""\n`
    : "";

  return `<job>\n${header}${description}${notes}</job>`;
}

function analysisBlock(analysis: Analysis | null): string {
  if (!analysis) return "";
  return `<prior_analysis>
Fit score: ${analysis.fitScore}/100 — ${analysis.verdict}
${analysis.summary}
Strengths to lead with: ${(analysis.strengths ?? []).join("; ")}
Known gaps: ${(analysis.gaps ?? []).join("; ")}
Likely interview focus: ${(analysis.interviewFocus ?? []).join("; ")}
</prior_analysis>`;
}

/* ------------------------------------------------------------------ *
 * Operation prompts
 * ------------------------------------------------------------------ */

export function analyzeJobPrompt(app: Application, profile: UserProfile) {
  return {
    system: `${BUTLER}

Your task: assess how well this candidate fits this specific role.

Calibrate fitScore like a hiring manager, not a cheerleader:
- 85-100: would be shortlisted immediately; clears every hard requirement.
- 70-84: strong candidate with one or two soft gaps.
- 50-69: plausible but needs the gaps addressed to get past screening.
- 25-49: a stretch; would need an internal referral or a hiring manager willing to train.
- 0-24: not a credible match.

Every item in \`skills\` must be something the posting actually asks for.`,
    prompt: `${profileBlock(profile)}\n\n${jobBlock(app)}\n\nAssess the fit.`,
  };
}

export function actionablesPrompt(
  app: Application,
  profile: UserProfile,
  analysis: Analysis | null,
) {
  return {
    system: `${BUTLER}

Your task: build a prep plan that maximizes this candidate's odds in THIS interview loop.

Compose the plan deliberately — do not produce a uniform list:
- 4-6 \`leetcode\` items. Pick real, well-known problems whose pattern this company's
  stack and the posting's domain make likely. Name the pattern. Weight difficulty to
  the seniority of the role. Prefer canonical leetcode.com URLs you are certain of.
- 2-4 \`concept\` items targeting the candidate's identified gaps, not their strengths.
- 1-3 \`system_design\` items framed as a prompt the interviewer might actually pose
  for this product (e.g. "Design <company>'s rate limiter"), not a textbook topic.
- 2-3 \`behavioral\` items naming the specific story the candidate should prepare.
- 1-2 \`research\` items on the company, its product, or its engineering culture.

Order matters: set priority 3 on the items with the highest expected payoff. Total
the estimates to something a candidate could finish in one to two weeks, not a month.`,
    prompt: `${profileBlock(profile)}\n\n${jobBlock(app)}\n\n${analysisBlock(analysis)}\n\nBuild the prep plan.`,
  };
}

export function questionnairePrompt(
  app: Application,
  profile: UserProfile,
  analysis: Analysis | null,
  count = 12,
) {
  return {
    system: `${BUTLER}

Your task: predict the interview questions and draft answers the candidate can rehearse.

Produce ${count} questions, ordered by a combination of likelihood and how badly a
weak answer would hurt. Cover technical, behavioral, and system design; include
culture, and include compensation only if the posting or stage makes it imminent.

Each \`suggestedAnswer\` must:
- be written in the first person, as the candidate would actually say it;
- draw on the candidate's real stated background — never fabricate projects, employers,
  metrics, or numbers;
- follow STAR for behavioral questions;
- stay under roughly 150 words, because this is a rehearsal script, not an essay.

At least two questions must target the gaps in the prior analysis — those are the
ones that will sink the loop if unprepared.`,
    prompt: `${profileBlock(profile)}\n\n${jobBlock(app)}\n\n${analysisBlock(analysis)}\n\nWrite the questionnaire.`,
  };
}

export function parseJobPrompt(raw: string) {
  return {
    system: `${BUTLER}

Your task: extract structured fields from a raw job posting that the user pasted in.

Extract only what the text actually states — use null for anything absent rather than
guessing. Normalize the title (drop req IDs, locations, and "(m/f/d)"-style suffixes).
For \`description\`, preserve the responsibilities and requirements as clean markdown,
dropping boilerplate: EEO statements, benefits lists, "about us" marketing, and
application instructions.

Salary must be annual base in whole currency units. Convert "150k" to 150000. If the
posting gives an hourly or monthly figure, leave both salary fields null.`,
    prompt: `Raw posting:\n"""\n${raw.trim()}\n"""\n\nExtract the fields.`,
  };
}

export function parseResumePrompt(raw: string) {
  return {
    system: `${BUTLER}

Your task: turn the raw text of a CV into the profile Alfred stores about the candidate.

This text came out of a PDF, so it may carry artefacts — columns interleaved, headers and footers repeated on every page, bullet glyphs as stray characters, ligatures run together. Read through them.

Rules:
- Extract only what the CV supports. Never invent an employer, a date, a metric or a technology.
- \`summary\` is the highest-value field: it becomes the résumé every future fit analysis is measured against. Preserve the specifics — numbers, scale, stack, what they actually owned. Drop page furniture, contact details and formatting noise.
- Leave a field empty (or null) rather than guessing at it.`,
    prompt: `Raw CV text:\n"""\n${raw.trim().slice(0, 60000)}\n"""\n\nExtract the profile.`,
  };
}

export function mailTriagePrompt(
  mail: {
    fromName: string | null;
    fromAddress: string | null;
    subject: string | null;
    body: string | null;
    receivedAt: Date;
  },
  knownCompanies: string[],
) {
  const known = knownCompanies.length
    ? `\nCompanies already in the candidate's pipeline — prefer an exact match from this list when the email refers to one of them:\n${knownCompanies.join(", ")}\n`
    : "";

  return {
    system: `${BUTLER}

Your task: triage one email against the candidate's job search.

Set \`isJobRelated\` false for newsletters, job-board digests, marketing, and anything
that is not about a specific application or a specific recruiter approach. A job alert
listing many roles is NOT job-related for this purpose — it is a digest.

\`suggestedStage\` is the stage the application has reached according to this email:
an interview invitation implies "screening" or "technical" depending on what round it
describes; a rejection implies "rejected"; an offer implies "offer". Use null when the
email does not move the application.

Be conservative with \`confidence\`. Below 0.5 means Alfred will ask the user rather
than acting on your answer, which is the right outcome when you are unsure.`,
    prompt: `<email>
From: ${mail.fromName ?? ""} <${mail.fromAddress ?? "unknown"}>
Subject: ${mail.subject ?? "(no subject)"}
Received: ${mail.receivedAt.toISOString()}

${(mail.body ?? "").slice(0, 6000)}
</email>${known}

Triage this email.`,
  };
}

export function chatPrompt(
  app: Application | null,
  profile: UserProfile,
  analysis: Analysis | null,
  history: { role: "user" | "assistant"; content: string }[],
  question: string,
) {
  const context = app
    ? `${jobBlock(app)}\n\n${analysisBlock(analysis)}`
    : "<job>No specific application selected — answer about the search in general.</job>";

  const transcript = history
    .slice(-8)
    .map(
      (turn) => `${turn.role === "user" ? "Candidate" : "Alfred"}: ${turn.content}`,
    )
    .join("\n\n");

  return {
    system: `${BUTLER}

You are in conversation with the candidate about the application below. Answer the
question directly and briefly — a few sentences or a short list. Use markdown only
when structure genuinely helps. If the answer depends on something you were not given,
say which detail you need instead of guessing.`,
    prompt: `${profileBlock(profile)}\n\n${context}\n\n${
      transcript ? `Conversation so far:\n${transcript}\n\n` : ""
    }Candidate: ${question}`,
  };
}

/* ------------------------------------------------------------------ *
 * Exercises
 * ------------------------------------------------------------------ */

/** The prep item an exercise is being built for. */
function taskBlock(item: {
  kind: string;
  title: string;
  detail?: string | null;
  rationale?: string | null;
  pattern?: string | null;
  difficulty?: string | null;
  estMinutes?: number | null;
}): string {
  return `<prep_item>
${field("Kind", item.kind)}${field("Title", item.title)}${field("Detail", item.detail)}${field(
    "Why it was assigned",
    item.rationale,
  )}${field("Pattern", item.pattern)}${field("Difficulty", item.difficulty)}${field(
    "Time budget",
    item.estMinutes ? `${item.estMinutes} minutes` : null,
  )}</prep_item>`;
}

/**
 * Turns a prep item into a coding problem the candidate solves in the app.
 *
 * The hard constraint is that the tests are MACHINE-CHECKED against the
 * generator's own solution before the exercise is ever shown. A prompt that
 * produces a beautiful problem with one sloppy expected value produces an
 * exercise nobody can pass, so most of this prompt is about the tests.
 */
export function codeExercisePrompt(
  app: Application,
  profile: UserProfile,
  item: Parameters<typeof taskBlock>[0],
) {
  return {
    system: `${BUTLER}

Your task: turn the prep item below into a self-contained Python coding problem the
candidate will solve in an editor, checked by running your tests against their code.

Shape the problem to the role. The pattern named on the item is the point — if it says
sliding window, the problem must genuinely require a sliding window, and a brute-force
answer must blow the stated complexity target. Keep it to the time budget: a 30-minute
item is one function, not a framework.

The tests are executed, so they are the part you cannot be loose about:
- \`call\` is ONE Python expression, evaluated against the candidate's module. \`expect\`
  is a Python LITERAL compared with \`==\`. Never put the computation in \`expect\`.
- The comparison is exact. If the natural answer is order-independent (a set of pairs,
  a grouping), make the problem REQUIRE a canonical form — "return the groups sorted by
  first element" — and say so in the brief. Do not emit a test whose correctness depends
  on dict or set iteration order.
- Everything must be deterministic: no randomness, no clock, no input(), no file or
  network access, no printing as the answer. The return value is the answer.
- For a class or stateful API, each case gets a fresh object inside the expression, e.g.
  \`(lambda c: [c.put(1,1), c.put(2,2), c.get(1)][-1])(LRUCache(2))\`. Cases never share state.
- \`starterCode\` must define every name the tests call, with the exact signatures, and
  include any import the tests rely on. It must parse and import cleanly as given.
- Cover the happy path, the edges that actually bite (empty, single element, duplicates,
  negatives, the boundary of the constraint) and at least one case large enough that a
  quadratic solution would be visibly wrong.

\`referenceSolution\` is run against your own tests before the candidate sees any of
this. If it fails, the exercise is rejected and your work is wasted — so write the
solution, then read each expected value back against it rather than from the problem
statement in your head.

Write the brief as if the candidate cannot see the job posting: state the problem, the
constraints, and the target complexity. No preamble about why it matters.`,
    prompt: `${profileBlock(profile)}\n\n${jobBlock(app)}\n\n${taskBlock(item)}\n\nBuild the coding exercise.`,
  };
}

/**
 * Turns a prep item into something the candidate writes an answer to, with a
 * rubric specific enough that grading it later is a reading task rather than a
 * judgement call.
 */
export function writtenExercisePrompt(
  app: Application,
  profile: UserProfile,
  item: Parameters<typeof taskBlock>[0],
) {
  return {
    system: `${BUTLER}

Your task: turn the prep item below into a prompt the candidate answers in writing, and
a rubric that decides whether the answer is good enough.

Pose it the way an interviewer at THIS company would — name their product, their scale,
their constraints. "Design a URL shortener" is a failure; "Design the fan-out that puts
a new post in forty million feeds" is the job.

The rubric is the contract, so write it for a reader:
- Each requirement names ONE specific thing the answer must contain — a mechanism, a
  trade-off acknowledged, a number estimated, a failure mode handled. A grader must be
  able to point at the sentence that satisfies it.
- Never grade style. "Clear and well-structured" is not checkable and not the skill.
- Weight 3 is for the things whose absence means the candidate failed the question.
- 4 to 6 criteria. Together they describe a strong answer and nothing more.

For a behavioral item, the rubric checks the STAR structure has real content: the stakes,
the candidate's own action rather than the team's, and a concrete outcome. Draw the
situation from the candidate's stated background — never invent an employer or a project
for them.

Set the brief's expectations about length: a few hundred words, not an essay.`,
    prompt: `${profileBlock(profile)}\n\n${jobBlock(app)}\n\n${taskBlock(item)}\n\nBuild the written exercise.`,
  };
}

/** Grades a written answer against the rubric that shipped with the exercise. */
export function gradeAnswerPrompt(
  app: Application,
  brief: string,
  rubric: { id: string; requirement: string; weight: number }[],
  answer: string,
) {
  const criteria = rubric
    .map((c) => `- ${c.id} (weight ${c.weight}): ${c.requirement}`)
    .join("\n");

  return {
    system: `${BUTLER}

Your task: grade one answer against a fixed rubric, and nothing else.

Judge only what is written. Do not credit something the candidate plainly knows but did
not say, and do not penalise anything the rubric does not ask for — not length, not
style, not a different-but-valid approach that still meets the requirement.

Return one verdict per criterion, in the order given, using the ids exactly as given.
A criterion is met when the answer actually contains it; "gestures at it" is not met.

\`passed\` is true only when every weight-3 criterion is met and most of the rest are.
Be strict. Passing a thin answer tells the candidate they are ready for an interview
they will fail, which is the one outcome worse than being told to try again.

The feedback is addressed to the candidate, in the second person. If it did not pass,
name the specific thing to add. Do not restate the rubric back at them.`,
    prompt: `${jobBlock(app)}

<question>
${brief}
</question>

<rubric>
${criteria}
</rubric>

<answer>
${answer.trim() || "(the candidate submitted nothing)"}
</answer>

Grade it.`,
  };
}

/* ------------------------------------------------------------------ *
 * Learning handbook
 * ------------------------------------------------------------------ */

type PrepItem = {
  kind: string;
  title: string;
  detail?: string | null;
  rationale?: string | null;
  pattern?: string | null;
  difficulty?: string | null;
};

/**
 * The prep plan, in full, because the handbook has to TEACH it.
 *
 * Titles alone are not enough: "Design the ledger write path" tells the writer
 * nothing about why it was assigned, and a handbook built from titles produces
 * a reading list instead of an explanation.
 */
function prepBlock(items: PrepItem[]): string {
  if (!items.length) return "";
  const lines = items
    .slice(0, 30)
    .map((item) => {
      const bits = [
        item.pattern ? `pattern: ${item.pattern}` : "",
        item.difficulty ? `difficulty: ${item.difficulty}` : "",
        item.detail ? `detail: ${item.detail}` : "",
        item.rationale ? `assigned because: ${item.rationale}` : "",
      ].filter(Boolean);
      return `- [${item.kind}] ${item.title}${bits.length ? `\n    ${bits.join("\n    ")}` : ""}`;
    })
    .join("\n");

  return `\n<prep_plan>
These are the prep items the candidate has been given. The handbook must TEACH
the substance behind every one of them — the pattern behind a coding problem,
the concept itself, how to approach a design prompt, how to structure a story.
The handbook is where the knowledge lives; the prep plan is only the to-do list.
${lines}
</prep_plan>\n`;
}

/**
 * The handbook's spine: title, reading routes, and a stub per part.
 *
 * Deliberately small. Each part's prose is a separate call, because a single
 * response holding six taught parts is a single point of truncation — and the
 * first version of this was exactly that, and it truncated. Providers cap
 * output in different places and some of them say nothing when they do.
 */
export function handbookOutlinePrompt(
  app: Application,
  profile: UserProfile,
  analysis: Analysis | null,
  actionables: PrepItem[],
) {
  return {
    system: `${BUTLER}

Your task: plan a study handbook this candidate will actually read before this
interview. You are writing the SPINE only — titles, the three-line summaries,
a note to yourself about what each part must teach, and which prep items it is
responsible for. The prose comes later.

THE HANDBOOK IS THE KNOWLEDGE, NOT A READING LIST

Everything the candidate needs to know goes inside it. A part that says "revise
consistent hashing" or "read their engineering blog" has failed — the part is
where consistent hashing gets explained. Plan parts that can be TAUGHT in prose:
mechanisms, trade-offs, worked examples, the vocabulary.

COVER THE PREP PLAN

If a prep plan is given below, every item in it must appear in exactly one
part's \`covers\`, copied verbatim. Group them where they share substance — four
sliding-window problems are one part about sliding windows, not four parts.
A part may cover several items; an item may not be covered twice or left out.

ONE STORY, BROAD TO DEEP

The handbook is read front to back as one story, not dipped into as a set of
articles. Start with the widest picture and zoom in, each part standing on
what the one before it set up:
- The big picture: what this company does and makes money from, in plain
  words, and the one system or idea at the heart of this role. Someone who
  reads only this part should know what the job is FOR.
- Then the substance they will be TESTED on, zooming in one concept at a time,
  in the order a teacher would introduce them — the idea a later part relies
  on comes first. This is the bulk of the handbook, and it is where the prep
  plan's technical items get taught.
- Then this employer's hard problems, which by now the reader has the
  vocabulary for.
- Last, the interview itself and what to say.

Each part will be written as a short sequence of animated pictures with a few
sentences of narration each, then exercises. So plan parts around ideas that
can be SHOWN — a mechanism, a flow, a trade-off on a graph — rather than
around lists of facts.

Five to eight parts. Each \`intent\` is instructions to whoever writes that part:
what it must explain, and what it must leave to the others, so the finished
handbook does not say the same thing four times.

The three TL;DR lines are the part in miniature, for someone who stops there.
Make them specific — a number, a name, a mechanism.

Do not invent facts about the company.`,
    prompt: `${profileBlock(profile)}\n\n${jobBlock(app)}\n\n${analysisBlock(analysis)}${prepBlock(actionables)}\n\nPlan the handbook.`,
  };
}

/** How to choose a scene primitive. Shared by the part, lab and ask prompts. */
const SCENE_GUIDE = `SCENES ARE MOTION GRAPHICS, DESCRIBED AS DATA

A scene is a short animated explainer, like the visual in a good explainer
video: it plays step by step, and each step's caption is the narration. You
describe the data and what changes at each step; the drawing and animation are
done for you. Pick the primitive that matches the idea's real shape:

- array — two pointers, sliding window (use \`range\`), binary search (\`range\`
  for the live half, pointers lo/mid/hi), in-place sorting (\`values\` per step).
- stack / queue — balanced brackets, monotonic stack, undo, a BFS frontier.
- linked_list — reversal, fast/slow pointers, merging.
- heap — push and pop with sift up/down, top-k (values in level order).
- hashmap — hashing to buckets, collisions, counting frequencies.
- tree — BST insert/search, traversal order (\`visited\` as nodes finish).
- graph — BFS/DFS (\`highlight\` = current, \`visited\` = done), Dijkstra with
  weights, topological order, connected components.
- grid — a DP table filling in, a matrix walk, flood fill.
- sequence — a request travelling through a system: client, gateway, service,
  cache hit and miss, database, queue, replica. One \`message\` per step.
- state_machine — lifecycles, protocols, retry and backoff, consensus roles.
- plot — gradient descent on a loss curve (one \`marker\` per step), a
  distribution, a learning-rate comparison, O(n) against O(n log n).
- bars — a comparison that changes: frequencies, latency percentiles.

Rules: three to ten steps; each step changes ONE thing and the caption says
what changed and why, as a teacher would while pointing. Keep labels short.
Every id you reference must exist in \`nodes\`. Use the real example from the
text rather than a toy when you can. Fill fields that do not apply to the
chosen kind with empty arrays or null.`;

/** One part, told as beats, written against the outline so parts do not repeat. */
export function handbookPartPrompt(
  app: Application,
  profile: UserProfile,
  analysis: Analysis | null,
  part: {
    title: string;
    tldr: string[];
    intent: string;
    emphasis: string;
    minutes: number;
  },
  siblings: string[],
  covers: PrepItem[],
) {
  const assignment = covers.length
    ? `\n<prep_items_this_part_must_teach>
Each of these was assigned to the candidate. Teach the substance behind it in
your beats — not a pointer to it, not a summary of the task. If it is a coding
problem, explain the pattern, when it applies, how to recognise it, and the
complexity. If it is a concept, explain the concept. If it is a design prompt,
work through how to approach it. If it is a story, explain what a strong one
contains and why.
${covers
  .map((item) => {
    const bits = [
      item.pattern ? `pattern: ${item.pattern}` : "",
      item.difficulty ? `difficulty: ${item.difficulty}` : "",
      item.detail ? `detail: ${item.detail}` : "",
      item.rationale ? `assigned because: ${item.rationale}` : "",
    ].filter(Boolean);
    return `- [${item.kind}] ${item.title}${bits.length ? `\n    ${bits.join("\n    ")}` : ""}`;
  })
  .join("\n")}
</prep_items_this_part_must_teach>\n`
    : "";

  return {
    system: `${BUTLER}

Your task: write ONE part of a study handbook. The handbook's other parts are
listed so you do not cover their ground — stay inside yours.

SHOW IT, THEN SAY IT

This part is read like a good explainer video, not a textbook chapter. It is a
short story told in BEATS. Each beat is:
- a hook: the one question this beat answers, as the reader would ask it;
- a picture that answers it — an animated scene or a diagram. The picture IS
  the explanation: the steps of a scene carry the mechanism, one change at a
  time, each narrated;
- two to four sentences under it saying what the reader just watched and the
  one thing to take from it. Do not walk through the picture again in words.

Three to six beats, from the broad idea down to the detail. The first beat is
the whole idea at a glance, so a reader who stops there still has it. Each
later beat zooms in on something the previous one showed, so the part reads
as one line of thought, not a list. Every beat has a picture; a point that
cannot be pictured belongs in another beat's narration or nowhere.

Start with the goal: one sentence, "By the end you can …", naming what the
reader will be able to explain or do — something they could be asked to do in
the interview.

EXPLAIN. DO NOT POINT.

The part is still where the knowledge lives: the reader should be able to
close the handbook and answer questions on this topic from what they watched.
- Banned: "read up on X", "research their blog", "familiarise yourself with Y",
  "practise Z". If X is worth knowing, show X here.
- Teach mechanisms: why it works, what it costs, when it breaks. Use the real
  numbers and the real example — a scene of this company's write path beats a
  toy.
- Define jargon on first use, in the narration. Short sentences. Write to
  someone intelligent who has not done this exact job.
- The whole part is under three hundred words of narration. The pictures do
  the rest.

No exercises, no code to run, no quizzes: a second pass writes those from
your beats and puts them after the story, so give it something concrete —
real numbers, the exact steps, the state that changes. At most three notes
(how to say it in the room, the trap people fall into); they sit under the
story, not in it.

${SCENE_GUIDE}

DIAGRAMS, FOR SHAPES THAT DO NOT MOVE

A diagram instead of a scene when the idea is a shape: \`flow\` for stages
something passes through, \`stack\` for layers, \`cycle\` for a loop back to
the start. Three to six short nodes, edges labelled with what crosses them.
Exactly one of \`scene\` and \`diagram\` per beat; the other is null.

The three TL;DR lines are already written and shown above your part. Deliver on
them; do not restate them.

Where you are reasoning from the posting rather than from knowledge, say so in
the narration — "the posting implies", "worth confirming". A confident invented
detail is the one failure that costs the candidate the room.`,
    prompt: `${profileBlock(profile)}

${jobBlock(app)}

${analysisBlock(analysis)}

<other_parts_do_not_cover_these>
${siblings.map((t) => `- ${t}`).join("\n")}
</other_parts_do_not_cover_these>

<your_part>
Title: ${part.title}
Emphasis: ${part.emphasis}
Reading time to aim for: ${part.minutes} minutes
What this part must teach: ${part.intent}
Its TL;DR, already written:
${part.tldr.map((l) => `- ${l}`).join("\n")}
</your_part>
${assignment}
Write this part as beats.`,
  };
}

/** A part's scenes, runnable cells and practice problems, after its prose. */
export function handbookLabPrompt(
  app: Application,
  part: { title: string; intent: string; emphasis: string },
  body: string,
) {
  return {
    system: `${BUTLER}

Your task: the visual and hands-on half of one part of a study handbook. The
handbook works like hybrid university notes: the prose (already written, below)
explains; your scenes SHOW it moving, like an explainer video; your Python cells
let the reader run and poke it, like a notebook; your problems make them do it
under interview conditions, like LeetCode.

${SCENE_GUIDE}

PYTHON CELLS

Plain Python 3 running in the reader's browser (Pyodide): standard library
only, no files, no network, no input(). Short, and each one prints something
worth reading — a simulation, a measurement, a before/after. Cells run in order
and share variables. Say in \`explain\` what to change to see something new.

PRACTICE PROBLEMS

Only when the part teaches a coding pattern. A LeetCode-style function with a
statement, starter code, a reference solution, hints that escalate, and tests
whose \`args\` and \`expected\` are Python LITERALS — they are parsed with
ast.literal_eval, so no expressions, names or calls. Your solution must pass
every test; check it mentally before you answer.

Match the part. Company and behavioural parts usually get one scene (a
lifecycle, a timeline as a state machine, a bar comparison) and nothing else.
Coding parts get scenes, a cell and a problem. System design parts get sequence
and state-machine scenes and maybe a simulation cell.`,
    prompt: `${jobBlock(app)}

<part>
Title: ${part.title}
Emphasis: ${part.emphasis}
What it teaches: ${part.intent}
</part>

<part_text>
${body.slice(0, 9000)}
</part_text>

Write this part's scenes, cells and problems.`,
  };
}

/**
 * The exercises behind a part told as beats: notebook cells and problems only.
 * The story already has its pictures, so this call writes none.
 */
export function handbookDeeperPrompt(
  app: Application,
  part: { title: string; intent: string; emphasis: string },
  story: string,
) {
  return {
    system: `${BUTLER}

Your task: the "Go deeper" section of one part of a study handbook. The reader
has just watched the part's story — a sequence of animated pictures, each
answering one question (below). Now they practise what they saw. Nothing here
introduces a new idea: every cell and problem works an idea a beat already
showed, and its explanation says which one.

PYTHON CELLS

Plain Python 3 running in the reader's browser (Pyodide): standard library
only, no files, no network, no input(). Short, and each one prints something
worth reading — a simulation, a measurement, a before/after. Cells run in order
and share variables. Say in \`explain\` which beat it works and what to change
to see something new. Order them easiest first.

PRACTICE PROBLEMS

Only when the part teaches a coding pattern. A LeetCode-style function with a
statement, starter code, a reference solution, hints that escalate, and tests
whose \`args\` and \`expected\` are Python LITERALS — they are parsed with
ast.literal_eval, so no expressions, names or calls. Your solution must pass
every test; check it mentally before you answer.

Match the part. Company and behavioural parts usually get nothing — empty
lists are a correct answer. Coding parts get a cell and a problem. System
design parts get maybe a simulation cell.`,
    prompt: `${jobBlock(app)}

<part>
Title: ${part.title}
Emphasis: ${part.emphasis}
What it teaches: ${part.intent}
</part>

<part_story>
${story.slice(0, 9000)}
</part_story>

Write this part's exercises.`,
  };
}

/** A reader asking about a passage of their handbook. */
export function handbookAskPrompt(input: {
  handbookTitle: string;
  partTitle: string;
  selection: string;
  question: string;
  context: string;
}) {
  return {
    system: `${BUTLER}

A candidate is studying a handbook you wrote for an interview and has selected
a passage to ask about. Answer like a patient tutor: the direct answer first,
then why, then a tiny example if it helps. Stay on the passage and the
interview it prepares for.

${SCENE_GUIDE}

Include a scene whenever a picture answers better than words, and ALWAYS when
the reader asks for a graph, chart, diagram, animation or visual. Otherwise
\`scene\` is null.`,
    prompt: `<handbook>${input.handbookTitle}</handbook>
<part>${input.partTitle}</part>
<part_excerpt>
${input.context.slice(0, 4000)}
</part_excerpt>
<selected_passage>
${input.selection.slice(0, 2000)}
</selected_passage>
<question>
${input.question.slice(0, 1000)}
</question>`,
  };
}

/** The practice material: cards, glossary, stories, questions, checklist. */
export function handbookDrillsPrompt(
  app: Application,
  profile: UserProfile,
  analysis: Analysis | null,
  partTitles: string[],
) {
  const outline = partTitles.map((t, i) => `${i + 1}. ${t}`).join("\n");
  return {
    system: `${BUTLER}

Your task: the practice material that sits behind a study handbook you have
already written. The handbook's parts are listed below — cover the same ground,
at the level of individual recall rather than explanation.

- **Flashcards** are for active recall. The question is what an interviewer says;
  the answer is the three to five points a strong reply hits. Never a one-word
  answer, never an essay. Spread them across the parts rather than clustering on
  the first topic.
- **Glossary** is for the moment a term appears and the candidate blanks. One or
  two lines each. Include terms that collide — where the same acronym means two
  different things in two fields, say both, because that confusion is the one
  that shows.
- **Stories** are prompts only. Do not write the candidate's experience for them;
  name the story to prepare and what a good version must contain.
- **Questions to ask** should make the candidate sound like someone already doing
  the job: about constraints, bottlenecks, what breaks, what they would own.
  Nothing a careful reading of the careers page would answer.
- **Checklist** is logistics and nerves, not revision.
- **Sources** must be canonical and real, or absent. Empty is a correct answer.`,
    prompt: `${profileBlock(profile)}\n\n${jobBlock(app)}\n\n${analysisBlock(analysis)}\n\n<handbook_parts>\n${outline}\n</handbook_parts>\n\nWrite the practice material.`,
  };
}
