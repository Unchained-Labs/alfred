import type { AiJob, Application } from "@/db/schema";
import { asHandbookContent, handbookComplete } from "@/lib/handbook/render";
import { logEvent } from "@/lib/mutations";
import { getHandbook, listActionables, listQuestions } from "@/lib/queries";
import { getSettings, providerIsConfigured } from "@/lib/settings";
import { submit } from "./worker";

/*
 * Everything Alfred can write about an application, queued the moment it
 * exists, in the order each step needs the last:
 *
 *   analysis ─┬─▶ prep plan ─┬─▶ handbook outline ─▶ parts ─▶ drills
 *             │              └─▶ exercises (the top N prep items)
 *             └─▶ questionnaire
 *
 * The prep plan reads the analysis's gaps; the handbook's outline teaches the
 * prep plan; exercises are per prep item. So each step depends on the one it
 * reads, and the worker will not start it until that has succeeded. Steps a
 * person switched off in Settings are left out and their dependents attach to
 * whatever came before.
 */

export type PipelineReason = "created" | "posting_added";

/** Shorter than this is a snippet or a title, not a job description. */
export const MIN_POSTING_CHARS = 300;

export function hasPosting(app: Pick<Application, "description">): boolean {
  return (app.description?.trim().length ?? 0) >= MIN_POSTING_CHARS;
}

export type PipelinePlan = {
  queued: AiJob[];
  skipped: { step: string; reason: string }[];
};

export function queueApplicationPipeline(
  userId: string,
  app: Application,
  reason: PipelineReason,
): PipelinePlan {
  const settings = getSettings(userId);
  const auto = settings.automation;
  const plan: PipelinePlan = { queued: [], skipped: [] };

  if (!auto.autoGenerate) {
    plan.skipped.push({
      step: "all",
      reason: "Automatic generation is off in Settings.",
    });
    return plan;
  }
  if (!providerIsConfigured(settings.ai)) {
    plan.skipped.push({ step: "all", reason: "No AI provider is configured yet." });
    return plan;
  }
  // Every step reads the posting. Without it the analysis is guesswork and the
  // rest is generic advice, so nothing is queued — and the timeline says why,
  // because "nothing happened" is otherwise indistinguishable from "broken".
  // A discovered job arrives with a board's two-line snippet as its
  // description; that is not a posting, and a handbook built on it is filler.
  if (!hasPosting(app)) {
    plan.skipped.push({
      step: "all",
      reason:
        "No posting text yet. Alfred will start as soon as you paste the job description.",
    });
    logEvent({
      userId,
      applicationId: app.id,
      type: "ai",
      title: "Prep is waiting for the job description",
      body: "Paste the posting text and Alfred will analyze it and write the prep plan, questions, handbook and exercises.",
    });
    return plan;
  }

  const job = (input: Parameters<typeof submit>[0]) => {
    const queued = submit(input);
    plan.queued.push(queued);
    return queued;
  };
  const base = { userId, applicationId: app.id };

  // A new posting deserves a fresh read even if an analysis exists — that one
  // was written without it.
  const analysis = auto.analysis
    ? job({
        ...base,
        kind: "analysis",
        dedupeKey: `analysis:${app.id}`,
        label: "Fit analysis",
        priority: 3,
      })
    : null;
  const afterAnalysis = analysis ? [analysis.id] : [];

  // The rest only fill what is missing: a posting added later should not wipe
  // a prep plan someone already started on.
  const hasPlan = listActionables(userId, app.id).length > 0;
  let prep: AiJob | null = null;
  if (auto.actionables && !hasPlan) {
    prep = job({
      ...base,
      kind: "actionables",
      payload: { exercises: auto.exercises ? auto.maxExercises : 0 },
      dependsOn: afterAnalysis,
      dedupeKey: `actionables:${app.id}`,
      label: "Prep plan",
      priority: 4,
    });
  } else if (auto.actionables) {
    plan.skipped.push({
      step: "actionables",
      reason: "A prep plan already exists.",
    });
  }
  const afterPrep = prep ? [prep.id] : afterAnalysis;

  if (auto.questionnaire && listQuestions(userId, app.id).length === 0) {
    job({
      ...base,
      kind: "questionnaire",
      payload: { count: auto.questionnaireCount },
      dependsOn: afterAnalysis,
      dedupeKey: `questionnaire:${app.id}`,
      label: "Interview questions",
      priority: 5,
    });
  } else if (auto.questionnaire) {
    plan.skipped.push({
      step: "questionnaire",
      reason: "Questions already exist.",
    });
  }

  const handbook = getHandbook(userId, app.id);
  if (auto.handbook && !(handbook && handbookComplete(handbook.content))) {
    job({
      ...base,
      kind: "handbook_outline",
      // An outline left by an earlier, interrupted build is finished, not redone.
      payload: { regenerate: !(handbook && asHandbookContent(handbook.content)) },
      dependsOn: afterPrep,
      dedupeKey: `handbook:${app.id}`,
      label: "Handbook outline",
      priority: 6,
    });
  } else if (auto.handbook) {
    plan.skipped.push({
      step: "handbook",
      reason: "The handbook is already written.",
    });
  }

  // With a prep plan being generated, its handler queues the exercises once
  // the items exist. Without one, there is nothing to tailor them to yet.
  if (auto.exercises && !prep && hasPlan) {
    plan.skipped.push({
      step: "exercises",
      reason: "Build exercises from the Prep page for the existing plan.",
    });
  }

  if (plan.queued.length) {
    logEvent({
      userId,
      applicationId: app.id,
      type: "ai",
      title:
        reason === "created"
          ? `Queued ${plan.queued.length} generation steps`
          : `Posting added — queued ${plan.queued.length} generation steps`,
      body: plan.queued.map((j) => j.label ?? j.kind).join(" → "),
    });
  }
  return plan;
}
