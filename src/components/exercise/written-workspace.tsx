"use client";

import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Send,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Hints } from "@/components/exercise/hints";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/field";
import { Prose } from "@/components/ui/prose";
import { useToast } from "@/components/ui/toast";
import type { Actionable, Exercise, Submission } from "@/db/schema";
import { asGradeReport, type GradeReport } from "@/lib/exercises";
import { useStoredValue } from "@/lib/use-stored";

/** Enough to be gradeable. Below this the server refuses, so say so early. */
const MIN_CHARACTERS = 40;

function wordCount(text: string) {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

/**
 * Where a design, concept or behavioural item is actually done: you write the
 * answer, and it is graded against the rubric that shipped with the question.
 *
 * The rubric is available but folded away. Reading it first turns the exercise
 * into filling in a form, and an interview will not come with one — but being
 * stuck with no idea what is being looked for teaches nothing either, so it is
 * one click away rather than hidden.
 */
export function WrittenWorkspace({
  exercise,
  actionable,
  lastSubmission,
}: {
  exercise: Exercise;
  actionable: Actionable;
  lastSubmission: Submission | null;
}) {
  const router = useRouter();
  const toast = useToast();

  const [answer, setAnswer] = useStoredValue(
    `alfred:answer:${exercise.id}`,
    lastSubmission?.body ?? "",
  );
  const [busy, setBusy] = React.useState(false);
  const [grade, setGrade] = React.useState<GradeReport | null>(() =>
    asGradeReport(lastSubmission?.results),
  );
  const [showRubric, setShowRubric] = React.useState(false);

  const verified = Boolean(actionable.verifiedAt);
  const words = wordCount(answer);
  const tooShort = answer.trim().length < MIN_CHARACTERS;

  async function submit() {
    setBusy(true);
    try {
      const response = await fetch(`/api/exercises/${exercise.id}/submit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ answer }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Grading failed.");

      setGrade(data.report as GradeReport);
      if (data.passed) {
        toast.success("Good answer", `"${actionable.title}" is done.`);
        router.refresh();
      } else {
        toast.error("Not there yet", "The notes below say what is missing.");
      }
    } catch (error) {
      toast.error(
        "Could not grade",
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <div className="space-y-4 lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle>The question</CardTitle>
          </CardHeader>
          <CardBody>
            <Prose>{exercise.brief}</Prose>
          </CardBody>
        </Card>

        {exercise.rubric?.length ? (
          <Card>
            <button
              type="button"
              onClick={() => setShowRubric((value) => !value)}
              className="hover:bg-surface-2 flex w-full cursor-pointer items-center gap-2 px-5 py-3.5 text-left transition-colors"
              aria-expanded={showRubric}
            >
              {showRubric ? (
                <ChevronDown className="text-ink-muted size-3.5" />
              ) : (
                <ChevronRight className="text-ink-muted size-3.5" />
              )}
              <span className="text-ink text-sm font-semibold">
                What a strong answer covers
              </span>
              <span className="text-ink-muted ml-auto text-[10px]">
                {exercise.rubric.length} points
              </span>
            </button>
            {showRubric ? (
              <CardBody className="pt-0">
                <ul className="space-y-2">
                  {exercise.rubric.map((criterion) => (
                    <li key={criterion.id} className="flex items-start gap-2">
                      <Circle className="text-ink-muted mt-1 size-2.5 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-ink-2 text-[11px] leading-relaxed">
                          {criterion.requirement}
                        </p>
                        {criterion.weight === 3 ? (
                          <span
                            className="text-[10px] font-medium"
                            style={{ color: "var(--serious)" }}
                          >
                            Essential
                          </span>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </CardBody>
            ) : null}
          </Card>
        ) : null}

        {exercise.hints?.length ? (
          <Card>
            <CardHeader>
              <CardTitle>Stuck?</CardTitle>
            </CardHeader>
            <CardBody>
              <Hints hints={exercise.hints} exerciseId={exercise.id} />
            </CardBody>
          </Card>
        ) : null}
      </div>

      <div className="space-y-4 lg:col-span-3">
        {verified ? (
          <div
            className="flex items-center gap-2 rounded-xl border px-4 py-3"
            style={{
              borderColor: "color-mix(in oklab, var(--good) 30%, transparent)",
              backgroundColor: "color-mix(in oklab, var(--good) 10%, transparent)",
            }}
          >
            <CheckCircle2 className="size-4" style={{ color: "var(--good)" }} />
            <p className="text-ink text-xs font-medium">
              Answered. This one met every essential point.
            </p>
          </div>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Your answer</CardTitle>
            <span className="tnum text-ink-muted text-[10px]">
              {words} {words === 1 ? "word" : "words"}
            </span>
          </CardHeader>
          <CardBody>
            <Textarea
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              rows={18}
              placeholder="Write it as you would say it out loud in the room. Structure beats length."
              className="font-sans text-xs leading-relaxed"
            />
          </CardBody>
          <div className="border-line flex flex-wrap items-center gap-2 border-t px-5 py-3">
            <Button
              variant="primary"
              onClick={submit}
              loading={busy}
              disabled={tooShort}
            >
              <Send className="size-3.5" />
              Submit for grading
            </Button>
            {tooShort ? (
              <span className="text-ink-muted text-[11px]">
                Write a little more first.
              </span>
            ) : null}
          </div>
        </Card>

        {grade ? (
          <div className="border-line overflow-hidden rounded-xl border">
            <div className="border-line bg-surface-2 flex items-center justify-between gap-2 border-b px-4 py-2.5">
              <span className="text-ink text-xs font-semibold">Grade</span>
              <Badge tint={grade.passed ? "var(--good)" : "var(--critical)"}>
                {grade.passed ? "Passed" : "Needs another pass"}
              </Badge>
            </div>

            <ul className="divide-y divide-[var(--border)]">
              {grade.criteria.map((criterion) => (
                <li
                  key={criterion.id}
                  className="flex items-start gap-2.5 px-4 py-2.5"
                >
                  {criterion.met ? (
                    <CheckCircle2
                      className="mt-0.5 size-3.5 shrink-0"
                      style={{ color: "var(--good)" }}
                    />
                  ) : (
                    <X
                      className="mt-0.5 size-3.5 shrink-0"
                      style={{ color: "var(--critical)" }}
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-ink text-xs font-medium">
                      {criterion.requirement}
                    </p>
                    <p className="text-ink-2 mt-0.5 text-[11px] leading-relaxed">
                      {criterion.comment}
                    </p>
                  </div>
                  {criterion.weight === 3 && !criterion.met ? (
                    <Badge tint="var(--serious)">Essential</Badge>
                  ) : null}
                </li>
              ))}
            </ul>

            {grade.feedback ? (
              <div className="border-line bg-surface-2 border-t px-4 py-3">
                <Prose>{grade.feedback}</Prose>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
