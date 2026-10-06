import { AiError, AiNotConfiguredError, gradeWrittenAnswer } from "@/lib/ai";
import { badRequest, failed, notFound, ok, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import type { CriterionOutcome, GradeReport } from "@/lib/exercises";
import { markActionableVerified, recordSubmission } from "@/lib/mutations";
import { getActionable, getApplication, getExercise } from "@/lib/queries";
import { runPythonTests } from "@/lib/runner/python";

type Params = { params: Promise<{ id: string }> };

/**
 * The real check. Runs every test — including the hidden ones — or grades the
 * written answer against its rubric, records the attempt either way, and only
 * then decides whether the prep item is done.
 *
 * Note what is NOT in this handler: anything the browser said about whether it
 * passed. The client runs tests for feedback; this is where it is adjudicated,
 * because a verdict the client can assert is a verdict worth nothing.
 */
export async function POST(request: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const body = await readJson<{ code?: string; answer?: string }>(request);

    const exercise = getExercise(user.id, id);
    if (!exercise) return notFound("Exercise not found.");

    const actionable = getActionable(user.id, exercise.actionableId);
    if (!actionable) return notFound("Prep item not found.");

    if (exercise.kind === "code") {
      const code = body.code;
      if (typeof code !== "string" || !code.trim()) {
        return badRequest("There is no code to submit.");
      }

      const report = await runPythonTests(code, exercise.tests ?? []);
      recordSubmission(user.id, {
        exerciseId: exercise.id,
        body: code,
        passed: report.passed,
        results: report,
        durationMs: report.durationMs,
      });

      if (report.passed) {
        markActionableVerified(
          user.id,
          actionable.id,
          actionable.applicationId,
          actionable.title,
        );
      }

      return ok({
        passed: report.passed,
        report,
        // Revealed only once it is no longer an answer key.
        referenceSolution: report.passed ? exercise.referenceSolution : null,
      });
    }

    const answer = body.answer;
    if (typeof answer !== "string" || answer.trim().length < 40) {
      return badRequest(
        "Write a real answer first — a couple of sentences is not something anyone can grade.",
      );
    }
    if (!actionable.applicationId) {
      return badRequest("This item is not attached to an application.");
    }
    const application = getApplication(user.id, actionable.applicationId);
    if (!application) return notFound("Application not found.");

    const rubric = exercise.rubric ?? [];

    // One retry, and only for a provider that failed to answer in the shape it
    // was asked for — not for a grade the candidate dislikes. A model returning
    // unparseable JSON is rare but it does happen, and losing a long written
    // answer to it is a far worse experience than waiting another ten seconds.
    let graded: Awaited<ReturnType<typeof gradeWrittenAnswer>>;
    try {
      graded = await gradeWrittenAnswer(
        user.id,
        application,
        exercise.brief,
        rubric,
        answer,
      );
    } catch (first) {
      if (!(first instanceof AiError) || first instanceof AiNotConfiguredError) {
        throw first;
      }
      graded = await gradeWrittenAnswer(
        user.id,
        application,
        exercise.brief,
        rubric,
        answer,
      );
    }

    // The grader returns ids; the requirements live here. Joining them server
    // side means the UI never has to guess which criterion a verdict is about,
    // and a hallucinated id simply does not appear.
    const criteria: CriterionOutcome[] = rubric.map((criterion) => {
      const verdict = graded.result.criteria.find(
        (entry) => entry.id === criterion.id,
      );
      return {
        id: criterion.id,
        requirement: criterion.requirement,
        weight: criterion.weight,
        met: verdict?.met ?? false,
        comment:
          verdict?.comment ?? "The grader did not return a verdict for this.",
      };
    });

    // Trust the rubric arithmetic over the grader's own summary: every heavily
    // weighted criterion has to be met, whatever the model concluded.
    const passed =
      graded.result.passed &&
      criteria.every((criterion) => criterion.weight < 3 || criterion.met);

    const report: GradeReport = {
      passed,
      criteria,
      feedback: graded.result.feedback,
    };

    recordSubmission(user.id, {
      exerciseId: exercise.id,
      body: answer,
      passed,
      results: report,
      feedback: graded.result.feedback,
    });

    if (passed) {
      markActionableVerified(
        user.id,
        actionable.id,
        actionable.applicationId,
        actionable.title,
      );
    }

    return ok({ passed, report });
  } catch (error) {
    return failed(error);
  }
}
