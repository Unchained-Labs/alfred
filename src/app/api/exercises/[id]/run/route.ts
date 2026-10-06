import { badRequest, failed, notFound, ok, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { getExercise } from "@/lib/queries";
import { runPythonTests } from "@/lib/runner/python";

type Params = { params: Promise<{ id: string }> };

/**
 * Runs the candidate's code against the VISIBLE tests only, and records
 * nothing. This is the iterate loop — the equivalent of hitting run locally.
 *
 * Hidden tests are deliberately not available here. They are what makes a
 * submission mean something; a run that probed them would turn them into
 * visible tests one call at a time, and the exercise into a guessing game
 * against the grader instead of the problem.
 */
export async function POST(request: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const { code } = await readJson<{ code?: string }>(request);

    const exercise = getExercise(user.id, id);
    if (!exercise) return notFound("Exercise not found.");
    if (exercise.kind !== "code") {
      return badRequest("This exercise is answered in writing, not run.");
    }
    if (typeof code !== "string" || !code.trim()) {
      return badRequest("There is no code to run.");
    }

    const visible = (exercise.tests ?? []).filter((test) => !test.hidden);
    if (!visible.length) {
      return badRequest("This exercise has no sample tests to run.");
    }

    const report = await runPythonTests(code, visible);
    return ok({ report });
  } catch (error) {
    return failed(error);
  }
}
