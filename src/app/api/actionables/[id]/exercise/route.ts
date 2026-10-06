import type { Application, ExerciseTest } from "@/db/schema";
import {
  generateCodeExercise,
  generateWrittenExercise,
  type CodeExercise,
} from "@/lib/ai";
import { badRequest, failed, notFound, ok, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { exerciseKindFor } from "@/lib/exercises";
import {
  saveCodeExercise,
  saveWrittenExercise,
  setExerciseSelfCheck,
} from "@/lib/mutations";
import {
  getActionable,
  getApplication,
  getExerciseByActionable,
} from "@/lib/queries";
import { runPythonTests } from "@/lib/runner/python";
import type { RunReport } from "@/lib/exercises";

type Params = { params: Promise<{ id: string }> };

const testsOf = (exercise: CodeExercise): ExerciseTest[] =>
  exercise.tests.map((test) => ({
    name: test.name,
    call: test.call,
    expect: test.expect,
    hidden: test.hidden,
  }));

/**
 * Generates a coding exercise and proves it is solvable before anyone is asked
 * to solve it, by running the generator's own solution against the generator's
 * own tests.
 *
 * It gets two attempts, because the failure being guarded against — one
 * expected value computed carelessly — is both common and completely
 * invisible to the candidate, who would just see a test they cannot pass and
 * reasonably conclude they were wrong. One retry turns most of those into a
 * clean exercise for the price of a second call.
 */
async function buildCodeExercise(
  userId: string,
  app: Application,
  item: Parameters<typeof generateCodeExercise>[2],
) {
  let best: { exercise: CodeExercise; report: RunReport; meta: string[] } | null =
    null;

  for (let attempt = 0; attempt < 2; attempt++) {
    const run = await generateCodeExercise(userId, app, item);
    const report = await runPythonTests(
      run.result.referenceSolution,
      testsOf(run.result),
    );
    const candidate = {
      exercise: run.result,
      report,
      meta: [run.provider, run.model],
    };
    if (report.passed) return candidate;
    // Keep whichever attempt got further, so a rejected exercise is still the
    // least broken one available.
    const passing = (r: RunReport) => r.outcomes.filter((o) => o.passed).length;
    if (!best || passing(report) > passing(best.report)) best = candidate;
  }

  return best!;
}

function selfCheckDetail(report: RunReport): string {
  if (report.setupError) {
    return `The reference solution did not run: ${report.setupError.split("\n").pop()}`;
  }
  if (report.timedOut) return "The reference solution did not finish in time.";
  const failed = report.outcomes.filter((outcome) => !outcome.passed);
  return `${failed.length} of ${report.outcomes.length} generated tests reject the generator's own solution (${failed
    .slice(0, 3)
    .map((outcome) => outcome.name)
    .join(", ")}). Treat them as a guide rather than a verdict.`;
}

export async function POST(request: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const body = await readJson<{ regenerate?: boolean }>(request);

    const actionable = getActionable(user.id, id);
    if (!actionable) return notFound("Prep item not found.");

    const kind = exerciseKindFor(actionable.kind);
    if (!kind) {
      return badRequest(
        "This kind of prep item has nothing to check — mark it done when you have done it.",
      );
    }

    // Generation is slow and costs a provider call, so an existing exercise is
    // returned as-is unless the caller explicitly asks for a new one.
    const existing = getExerciseByActionable(user.id, id);
    if (existing && !body.regenerate)
      return ok({ exercise: existing, reused: true });

    if (!actionable.applicationId) {
      return badRequest(
        "This item is not attached to an application, so there is no role to tailor an exercise to.",
      );
    }
    const application = getApplication(user.id, actionable.applicationId);
    if (!application) return notFound("Application not found.");

    const item = {
      kind: actionable.kind,
      title: actionable.title,
      detail: actionable.detail,
      rationale: actionable.rationale,
      pattern: actionable.pattern,
      difficulty: actionable.difficulty,
      estMinutes: actionable.estMinutes,
    };

    if (kind === "written") {
      const run = await generateWrittenExercise(user.id, application, item);
      const exercise = saveWrittenExercise(user.id, id, run.result, {
        provider: run.provider,
        model: run.model,
      });
      if (!exercise) return notFound("Prep item not found.");
      return ok({ exercise });
    }

    const built = await buildCodeExercise(user.id, application, item);
    const exercise = saveCodeExercise(user.id, id, built.exercise, {
      provider: built.meta[0],
      model: built.meta[1],
    });
    if (!exercise) return notFound("Prep item not found.");

    const checked = setExerciseSelfCheck(
      user.id,
      exercise.id,
      built.report.passed,
      built.report.passed ? null : selfCheckDetail(built.report),
    );

    return ok({ exercise: checked ?? exercise });
  } catch (error) {
    return failed(error);
  }
}
