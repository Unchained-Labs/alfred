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
    .describe("Why this specific item matters for THIS job. Reference the posting."),
  difficulty: z.enum(DIFFICULTIES).nullable().describe("Null for non-coding items"),
  pattern: z
    .string()
    .nullable()
    .describe(
      "For leetcode items, the DS&A pattern, e.g. 'sliding window'. Null otherwise.",
    ),
  estMinutes: z.number().int().min(5).max(480).describe("Realistic time to complete"),
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
    .describe("The prep plan. Cover coding, concepts, system design, and behavioral."),
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
