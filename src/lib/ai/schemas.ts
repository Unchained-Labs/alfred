import { z } from "zod";
import {
  ACTIONABLE_KINDS,
  APPLICATION_STAGES,
  DIFFICULTIES,
  MAIL_CLASSES,
} from "@/db/schema";

/**
 * Structured-output contracts. These are the single source of truth: the
 * Anthropic provider turns them into JSON Schema via the SDK's zod helper,
 * and the other providers via z.toJSONSchema(). Keep them flat and
 * description-rich — the descriptions are the only instructions the model
 * gets about individual fields.
 */

export const skillMatchSchema = z.object({
  skill: z.string().describe("The skill or technology named in the posting"),
  level: z
    .enum(["have", "partial", "gap"])
    .describe("How well the candidate's background covers this skill"),
  note: z.string().describe("One short clause of evidence or what is missing"),
});

export const jobAnalysisSchema = z.object({
  fitScore: z
    .number()
    .int()
    .min(0)
    .max(100)
    .describe("Overall fit, 0-100. Be honest and calibrated, not generous."),
  verdict: z
    .string()
    .describe("A six-word-or-less verdict, e.g. 'Strong fit, light on Kubernetes'"),
  summary: z
    .string()
    .describe("2-3 sentences on what this role is and how the candidate lines up"),
  skills: z
    .array(skillMatchSchema)
    .describe("Every significant skill the posting requires, 5-12 entries"),
  strengths: z
    .array(z.string())
    .describe("3-5 specific things to lead with in this application"),
  gaps: z
    .array(z.string())
    .describe("2-5 honest weaknesses relative to the posting"),
  interviewFocus: z
    .array(z.string())
    .describe("3-6 topics this company's interviews will most likely probe"),
  salaryInsight: z
    .string()
    .describe("A realistic compensation read for this role, market, and level"),
  positioning: z
    .string()
    .describe(
      "2-3 sentences of concrete resume/cover-letter angle for this specific role",
    ),
});
export type JobAnalysis = z.infer<typeof jobAnalysisSchema>;

export const actionableSchema = z.object({
  kind: z
    .enum(ACTIONABLE_KINDS)
    .describe("Which kind of prep work this item represents"),
  title: z.string().describe("Short imperative title, e.g. 'LRU Cache'"),
  detail: z
    .string()
    .describe("What to actually do, 1-3 sentences, concrete and actionable"),
  rationale: z
    .string()
    .describe(
      "Why this specific item matters for THIS job. Reference the posting.",
    ),
  difficulty: z.enum(DIFFICULTIES).nullable().describe("Null for non-coding items"),
  pattern: z
    .string()
    .nullable()
    .describe(
      "For leetcode items, the DS&A pattern, e.g. 'sliding window'. Null otherwise.",
    ),
  estMinutes: z
    .number()
    .int()
    .min(5)
    .max(480)
    .describe("Realistic time to complete"),
  url: z
    .string()
    .nullable()
    .describe(
      "A real, canonical URL (e.g. https://leetcode.com/problems/lru-cache/). Null if you are not certain the URL exists.",
    ),
  priority: z
    .number()
    .int()
    .min(1)
    .max(3)
    .describe("3 = do this first, 2 = normal, 1 = nice to have"),
  tags: z.array(z.string()).describe("2-4 lowercase topic tags"),
});
export type GeneratedActionable = z.infer<typeof actionableSchema>;

export const actionablePlanSchema = z.object({
  overview: z
    .string()
    .describe("2-3 sentences framing the prep strategy for this role"),
  items: z
    .array(actionableSchema)
    .describe(
      "The prep plan. Cover coding, concepts, system design, and behavioral.",
    ),
});
export type ActionablePlan = z.infer<typeof actionablePlanSchema>;

export const interviewQuestionSchema = z.object({
  question: z.string().describe("The question as an interviewer would ask it"),
  category: z
    .enum(["technical", "behavioral", "system_design", "culture", "compensation"])
    .describe("Which round this question belongs to"),
  probing: z
    .string()
    .describe("One sentence on what the interviewer is really assessing"),
  suggestedAnswer: z
    .string()
    .describe(
      "A strong answer in the candidate's own voice, grounded in their real background. Use STAR for behavioral. 3-6 sentences.",
    ),
});

export const questionnaireSchema = z.object({
  questions: z
    .array(interviewQuestionSchema)
    .describe("Likely interview questions, hardest and most probable first"),
});
export type Questionnaire = z.infer<typeof questionnaireSchema>;

/* ------------------------------------------------------------------ *
 * Exercises — a task you can actually do, and that can be checked
 * ------------------------------------------------------------------ */

export const exerciseTestSchema = z.object({
  name: z
    .string()
    .describe("Short name for this case, e.g. 'evicts least recently used'"),
  call: z
    .string()
    .describe(
      "A single Python expression that exercises the candidate's code and evaluates to the value being checked. It may reference anything the starter defines. Example: 'solve([3,1,2])'. For stateful classes, use a helper expression such as '(lambda c: (c.put(1,1), c.get(1))[1])(LRUCache(2))'.",
    ),
  expect: z
    .string()
    .describe(
      "A Python literal the call must equal, e.g. '[1,2,3]', '-1', \"'ok'\". Must be a literal, never an expression that recomputes the answer.",
    ),
  hidden: z
    .boolean()
    .describe("False for the 2-3 cases shown up front; true for the rest."),
});

export const codeExerciseSchema = z.object({
  brief: z
    .string()
    .describe(
      "The problem statement as markdown: what to implement, the constraints, and the complexity target. Self-contained — the candidate should not need the original source.",
    ),
  starterCode: z
    .string()
    .describe(
      "Runnable Python skeleton with the exact names the tests call, bodies left as `pass` or a TODO. Include any imports the tests need.",
    ),
  examples: z
    .array(
      z.object({
        input: z.string(),
        output: z.string(),
        note: z
          .string()
          .describe("Why this output, in one clause. Empty if obvious."),
      }),
    )
    .describe("2-3 worked examples shown before they start."),
  tests: z
    .array(exerciseTestSchema)
    .describe(
      "8-12 cases covering the happy path, the edges (empty, single element, duplicates, negatives) and the constraint the problem is really about. 2-3 visible, the rest hidden.",
    ),
  referenceSolution: z
    .string()
    .describe(
      "Your own complete, correct Python solution — the same names the tests call. It is run against the tests before the exercise is offered, so it must actually pass.",
    ),
  hints: z
    .array(z.string())
    .describe(
      "3-4 hints, revealed one at a time, escalating from a nudge about the approach to naming the data structure. Never the full solution.",
    ),
});
export type CodeExercise = z.infer<typeof codeExerciseSchema>;

export const writtenExerciseSchema = z.object({
  brief: z
    .string()
    .describe(
      "The prompt as markdown — what to design, argue or prepare, framed as an interviewer would pose it for this specific role.",
    ),
  rubric: z
    .array(
      z.object({
        id: z.string().describe("Short slug, e.g. 'idempotency'"),
        requirement: z
          .string()
          .describe(
            "One specific thing a good answer must do. Checkable by reading the answer — not a vague quality like 'is clear'.",
          ),
        weight: z
          .number()
          .int()
          .min(1)
          .max(3)
          .describe("3 = the answer fails without it, 1 = a nice-to-have."),
      }),
    )
    .describe("4-6 criteria. Together they define a passing answer."),
  hints: z
    .array(z.string())
    .describe("2-3 nudges toward the areas the rubric cares about."),
});
export type WrittenExercise = z.infer<typeof writtenExerciseSchema>;

export const gradedAnswerSchema = z.object({
  passed: z
    .boolean()
    .describe(
      "True only if every weight-3 criterion is met and most others are. Be strict: passing a weak answer is worse than asking for another pass.",
    ),
  criteria: z
    .array(
      z.object({
        id: z.string(),
        met: z.boolean(),
        comment: z
          .string()
          .describe("One sentence: what they did, or precisely what is missing."),
      }),
    )
    .describe("One entry per rubric criterion, in order."),
  feedback: z
    .string()
    .describe(
      "2-4 sentences addressed to the candidate. If it did not pass, say exactly what to add. Never restate the rubric verbatim.",
    ),
});
export type GradedAnswer = z.infer<typeof gradedAnswerSchema>;

export const parsedJobSchema = z.object({
  company: z.string().describe("Hiring company name only, no suffixes or taglines"),
  title: z.string().describe("The job title, normalized"),
  location: z.string().nullable(),
  workMode: z.enum(["onsite", "hybrid", "remote"]).nullable(),
  seniority: z
    .enum(["intern", "junior", "mid", "senior", "staff", "principal", "lead"])
    .nullable(),
  salaryMin: z
    .number()
    .int()
    .nullable()
    .describe("Annual base minimum in whole currency units, null if not stated"),
  salaryMax: z.number().int().nullable(),
  currency: z.string().nullable().describe("ISO 4217 code, e.g. USD"),
  description: z
    .string()
    .describe("The responsibilities and requirements, cleaned up as markdown"),
  tags: z.array(z.string()).describe("3-6 lowercase tech/domain tags"),
});
export type ParsedJob = z.infer<typeof parsedJobSchema>;

export const parsedResumeSchema = z.object({
  name: z
    .string()
    .describe("The candidate's full name, or an empty string if absent"),
  headline: z
    .string()
    .describe(
      "A one-line professional headline, e.g. 'Senior backend engineer — distributed systems, Go'. Derive it from the most recent role and the dominant stack.",
    ),
  yearsExperience: z
    .number()
    .int()
    .min(0)
    .max(60)
    .nullable()
    .describe(
      "Total professional years, counted from the earliest professional role to the latest. Null if the dates do not support a confident figure.",
    ),
  skills: z
    .array(z.string())
    .describe(
      "8-20 concrete technologies and competencies the CV actually evidences. Prefer specifics ('Postgres', 'Kafka') over categories ('databases'). No soft skills.",
    ),
  targetRoles: z
    .array(z.string())
    .describe(
      "2-5 role titles this background realistically targets next, based on the trajectory — not every title they have held.",
    ),
  locations: z
    .array(z.string())
    .describe("Locations or work preferences stated in the CV. Empty if none."),
  compensationTarget: z
    .string()
    .describe("Any stated compensation expectation, else an empty string."),
  summary: z
    .string()
    .describe(
      "The background rewritten as the résumé field Alfred stores: roles with dates, and the achievements under each, preserving every metric and technology named. This is what every later analysis is measured against, so keep the substance and drop only formatting artefacts, page furniture and contact details.",
    ),
});
export type ParsedResume = z.infer<typeof parsedResumeSchema>;

export const mailTriageSchema = z.object({
  classification: z
    .enum(MAIL_CLASSES)
    .describe("What this email is, with respect to a job search"),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe("How sure you are. Below 0.5 means you are guessing."),
  isJobRelated: z
    .boolean()
    .describe("False for newsletters, marketing, and anything unrelated"),
  company: z
    .string()
    .nullable()
    .describe("The hiring company, null if not identifiable"),
  title: z.string().nullable().describe("The role title, null if not stated"),
  suggestedStage: z
    .enum(APPLICATION_STAGES)
    .nullable()
    .describe("The pipeline stage this email implies the application has reached"),
  summary: z.string().describe("One sentence on what this email says"),
  /** Drives the "needs a reply" nudge on the inbox. */
  actionRequired: z
    .string()
    .nullable()
    .describe("What the user must do, if anything. Null if purely informational."),
  deadline: z
    .string()
    .nullable()
    .describe("Any deadline stated in the email as an ISO 8601 date, else null"),
});
export type MailTriage = z.infer<typeof mailTriageSchema>;

/* ------------------------------------------------------------------ *
 * Learning handbook
 *
 * Two schemas, because it is generated in two calls. One call producing the
 * whole handbook would be a single point of truncation: a plan that dies at
 * token 31,000 loses the drills with it, and two minutes of work with it.
 *
 * Note what is NOT here: no polymorphic "block" union. Part bodies are
 * MARKDOWN, which already expresses headings, lists, tables, code and
 * emphasis, and which the renderer turns into HTML with everything escaped.
 * A union of block kinds would have to survive `tighten()` in the JSON Schema
 * converter, which marks every property required — so each block would carry
 * every other kind's fields, empty. Markdown is both smaller and more
 * expressive than the schema that would replace it.
 * ------------------------------------------------------------------ */

const NOTE_TONES = ["say", "trap", "why", "tip"] as const;

export const handbookNoteSchema = z.object({
  tone: z
    .enum(NOTE_TONES)
    .describe(
      "say = ready-made phrasing the candidate can adapt out loud. trap = a mistake people actually make. why = how a general topic connects to THIS company. tip = practical advice for preparing.",
    ),
  title: z.string().describe("Three or four words. The label on the box."),
  body: z.string().describe("One or two sentences. Markdown allowed."),
});

/** A part before its body is written: enough to navigate and to plan with. */
export const handbookPartStubSchema = z.object({
  id: z
    .string()
    .describe(
      "Short lowercase slug, letters and hyphens only, unique across parts. Used as the anchor, e.g. 'the-write-path'.",
    ),
  title: z.string().describe("The part's heading, as a reader would scan it."),
  short: z
    .string()
    .describe("Two or three words for the navigation rail, e.g. 'The ledger'."),
  minutes: z
    .number()
    .int()
    .min(3)
    .max(45)
    .describe("Honest reading time for the part, in minutes."),
  emphasis: z
    .enum(["must", "leadership", "company", "optional"])
    .describe(
      "must = cannot walk in without it. leadership = people and delivery. company = specific to this employer. optional = useful depth.",
    ),
  tldr: z
    .array(z.string())
    .describe(
      "Exactly three lines. Someone who reads only these has the gist of the part and can stop. Never 'this part covers X' — state the substance: a number, a name, a mechanism.",
    ),
  intent: z
    .string()
    .describe(
      "One sentence to the writer of this part, not to the reader: what this part must teach and what it must not repeat from the others.",
    ),
});

export const handbookOutlineSchema = z.object({
  title: z
    .string()
    .describe(
      "The handbook's own title, naming the company or the role, e.g. 'The Ledger Interview Handbook'.",
    ),
  eyebrow: z
    .string()
    .describe(
      "One line above the title: who it is for, the role, the company. Separated by middots.",
    ),
  lede: z
    .string()
    .describe(
      "Two or three sentences telling the candidate what this is and how to use it. Plain, not promotional.",
    ),
  routes: z
    .array(
      z.object({
        label: z
          .string()
          .describe("A time budget, e.g. '10 minutes', 'One evening'."),
        detail: z.string().describe("What that route covers, in one clause."),
        parts: z
          .array(z.string())
          .describe("Part ids to read on this route, in order."),
      }),
    )
    .describe(
      "Two to four reading routes, shortest first. Someone with ten minutes before a call must have somewhere to go.",
    ),
  parts: z
    .array(handbookPartStubSchema)
    .describe(
      "Five to eight parts, ordered as they should be read: the company and the role, then the substance they will be tested on, then this employer's hard problems, then the interview itself. Each part earns its place — five strong parts beat eight with filler.",
    ),
});
export type HandbookOutline = z.infer<typeof handbookOutlineSchema>;

/** One part's prose, written against its own stub. */
export const handbookPartBodySchema = z.object({
  body: z
    .string()
    .describe(
      "The part itself, as markdown: ## and ### headings, paragraphs, bullet and numbered lists, pipe tables, fenced code where code genuinely helps, **bold** and `inline code`. Three hundred to seven hundred words. Specific to this role and company — generic advice is a failure.",
    ),
  notes: z
    .array(handbookNoteSchema)
    .describe("Nought to three callouts. Use them sparingly."),
  cards: z
    .array(z.object({ title: z.string(), body: z.string() }))
    .describe(
      "Nought to six short cards, for things that are genuinely a set of peers — options, principles, people to meet. Not a dumping ground.",
    ),
});
export type HandbookPartBody = z.infer<typeof handbookPartBodySchema>;

/**
 * A part as it is stored: the stub, plus the body once it has been written.
 *
 * The body is Partial because a handbook is filled in one part at a time and
 * is readable before every part exists. A reader who opens it mid-generation
 * sees the finished parts and a note on the rest, rather than an error.
 */
export type HandbookPart = z.infer<typeof handbookPartStubSchema> &
  Partial<HandbookPartBody>;

export type HandbookPlan = Omit<HandbookOutline, "parts"> & {
  parts: HandbookPart[];
};

export const handbookDrillsSchema = z.object({
  flashcards: z
    .array(
      z.object({
        category: z
          .string()
          .describe("Two or three words, reused across cards so they group."),
        question: z
          .string()
          .describe("As an interviewer would actually ask it, out loud."),
        answer: z
          .array(z.string())
          .describe(
            "Three to five bullets a strong answer covers. Not a script — the points it must hit.",
          ),
      }),
    )
    .describe(
      "Twenty to thirty cards across the technical ground, the company and the behavioural questions.",
    ),
  glossary: z
    .array(z.object({ term: z.string(), definition: z.string() }))
    .describe(
      "Fifteen to forty terms: every acronym and piece of jargon this role's interview could use, defined in one or two lines. Include the ones that mean two different things.",
    ),
  stories: z
    .array(
      z.object({
        prompt: z
          .string()
          .describe(
            "The story to prepare, e.g. 'A system you took to production'.",
          ),
        hint: z.string().describe("One line on what a good version contains."),
        tags: z
          .array(z.string())
          .describe("One or two words each, e.g. 'ownership', 'conflict'."),
      }),
    )
    .describe(
      "Eight to twelve prompts covering the behavioural ground this specific loop will probe. The candidate writes the answers themselves.",
    ),
  asks: z
    .array(
      z.object({
        audience: z
          .string()
          .describe(
            "Who to ask, e.g. 'The hiring manager', 'Engineers on the panel'.",
          ),
        questions: z.array(z.string()),
      }),
    )
    .describe(
      "Questions for the candidate to ask, grouped by who they are for. Questions that show they already think like someone doing the job.",
    ),
  checklist: z
    .array(
      z.object({
        phase: z.enum(["before", "day", "after"]),
        items: z.array(z.string()),
      }),
    )
    .describe(
      "Practical, checkable things. The day before, the day itself, and afterwards.",
    ),
  sources: z
    .array(z.object({ label: z.string(), url: z.string() }))
    .describe(
      "Canonical URLs only — official documentation or the company's own pages — and only ones you are certain exist. An empty array is the correct answer when unsure; a plausible invented link is worse than no link.",
    ),
});
export type HandbookDrills = z.infer<typeof handbookDrillsSchema>;
