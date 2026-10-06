import type { ActionableKind, ExerciseKind } from "@/db/schema";

/*
 * Which prep items are work you have to actually do, and in what form.
 *
 * This file is imported by both the server and the browser, so it holds no
 * secrets and reaches no database — just the mapping and the shapes that both
 * sides of a run agree on.
 */

/**
 * The form each kind of prep item takes when you sit down to do it. `null`
 * means there is nothing to grade: reading about a company or booking a call
 * is done when you say it is done, and pretending otherwise would be theatre.
 */
export const EXERCISE_FOR_KIND: Record<ActionableKind, ExerciseKind | null> = {
  leetcode: "code",
  // A concept is proven by explaining it, not by implementing it — "know how
  // consumer groups rebalance" has no test suite, it has an answer.
  concept: "written",
  system_design: "written",
  behavioral: "written",
  research: null,
  questionnaire: null,
  task: null,
};

/**
 * True when "done" has to be earned. These are the items whose status the API
 * refuses to set to `done` without a passing submission behind it — the whole
 * point of the feature. Skipping stays available: declining a problem is
 * honest, claiming you solved it is not.
 */
export function requiresExercise(kind: ActionableKind): boolean {
  return EXERCISE_FOR_KIND[kind] !== null;
}

export function exerciseKindFor(kind: ActionableKind): ExerciseKind | null {
  return EXERCISE_FOR_KIND[kind];
}

/** What the button says. Specific beats generic when you are about to commit. */
export const DO_IT_LABEL: Record<ExerciseKind, string> = {
  code: "Solve it",
  written: "Answer it",
};

/* ------------------------------------------------------------------ *
 * What a run reports
 * ------------------------------------------------------------------ */

/** One test case's outcome. `hidden` cases are only detailed after a pass. */
export type TestOutcome = {
  name: string;
  hidden: boolean;
  passed: boolean;
  /** repr() of what the call returned. Absent when it raised. */
  got?: string;
  want?: string;
  error?: string;
  stdout?: string;
  /** True for the case the runner was killed in, and every one after it. */
  timedOut?: boolean;
};

export type RunReport = {
  /** Every test passed. The only thing that unlocks completion. */
  passed: boolean;
  /** The submission did not even execute — a syntax error, usually. */
  setupError: string | null;
  /** Anything the code printed at import time. Candidates debug with print. */
  stdout: string | null;
  outcomes: TestOutcome[];
  timedOut: boolean;
  durationMs: number;
};

/** One rubric line's verdict, for written answers. */
export type CriterionOutcome = {
  id: string;
  requirement: string;
  weight: number;
  met: boolean;
  comment: string;
};

export type GradeReport = {
  passed: boolean;
  criteria: CriterionOutcome[];
  feedback: string;
};

/** Narrows the `results` JSON column, which is stored untyped on purpose. */
export function asRunReport(value: unknown): RunReport | null {
  if (!value || typeof value !== "object") return null;
  return "outcomes" in value ? (value as RunReport) : null;
}

export function asGradeReport(value: unknown): GradeReport | null {
  if (!value || typeof value !== "object") return null;
  return "criteria" in value ? (value as GradeReport) : null;
}
