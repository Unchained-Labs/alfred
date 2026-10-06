import { ArrowLeft, Clock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import * as React from "react";
import { CodeWorkspace } from "@/components/exercise/code-workspace";
import {
  GenerateExercise,
  RegenerateExercise,
} from "@/components/exercise/generate-exercise";
import { WrittenWorkspace } from "@/components/exercise/written-workspace";
import { KIND_ICONS } from "@/components/dashboard/up-next";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { currentUser, requireUser } from "@/lib/auth";
import { exerciseKindFor } from "@/lib/exercises";
import {
  getActionable,
  getApplication,
  getExerciseByActionable,
  listSubmissions,
} from "@/lib/queries";
import { ACTIONABLE_META } from "@/lib/stages";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const DIFFICULTY_TINT = {
  easy: "var(--good)",
  medium: "var(--warning)",
  hard: "var(--critical)",
} as const;

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const viewer = await currentUser();
  const item = viewer ? getActionable(viewer.id, id) : null;
  return { title: item ? item.title : "Prep item" };
}

/**
 * One prep item, open for work.
 *
 * Routed by the prep item rather than the exercise, because the item is what
 * the candidate clicked and what has to end up done. The exercise is an
 * implementation detail of how it gets verified — it may not exist yet, and
 * replacing it does not change the URL.
 */
export default async function ExercisePage({ params }: Params) {
  const user = await requireUser();
  const { id } = await params;

  const actionable = getActionable(user.id, id);
  if (!actionable) notFound();

  const application = actionable.applicationId
    ? getApplication(user.id, actionable.applicationId)
    : null;

  const kind = exerciseKindFor(actionable.kind);
  const exercise = getExerciseByActionable(user.id, id);
  const submissions = exercise ? listSubmissions(user.id, exercise.id) : [];
  const meta = ACTIONABLE_META[actionable.kind];
  const Icon = KIND_ICONS[meta.icon];

  return (
    <div className="mx-auto max-w-7xl p-4 lg:p-6">
      <div className="mb-5">
        {application ? (
          <Link
            href={`/pipeline/${application.id}`}
            className="text-ink-muted hover:text-ink mb-3 inline-flex items-center gap-1.5 text-xs transition-colors"
          >
            <ArrowLeft className="size-3.5" />
            {application.title} · {application.company}
          </Link>
        ) : (
          <Link
            href="/prep"
            className="text-ink-muted hover:text-ink mb-3 inline-flex items-center gap-1.5 text-xs transition-colors"
          >
            <ArrowLeft className="size-3.5" />
            All prep
          </Link>
        )}

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-ink text-xl font-semibold tracking-tight">
              {actionable.title}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Badge tint={`var(${meta.token})`}>
                {Icon ? <Icon className="size-3" /> : null}
                {meta.label}
              </Badge>
              {actionable.difficulty ? (
                <Badge tint={DIFFICULTY_TINT[actionable.difficulty]}>
                  {actionable.difficulty}
                </Badge>
              ) : null}
              {actionable.pattern ? <Badge>{actionable.pattern}</Badge> : null}
              {actionable.estMinutes ? (
                <span className="text-ink-muted inline-flex items-center gap-1 text-[10px]">
                  <Clock className="size-2.5" />
                  {actionable.estMinutes}m
                </span>
              ) : null}
              {submissions.length ? (
                <span className="text-ink-muted text-[10px]">
                  {submissions.length}{" "}
                  {submissions.length === 1 ? "attempt" : "attempts"}
                </span>
              ) : null}
            </div>
          </div>

          {exercise ? (
            <RegenerateExercise
              actionableId={actionable.id}
              verified={Boolean(actionable.verifiedAt)}
            />
          ) : null}
        </div>

        {actionable.rationale ? (
          <p className="text-ink-muted mt-3 max-w-3xl text-xs leading-relaxed italic">
            {actionable.rationale}
          </p>
        ) : null}
      </div>

      {/* Items with nothing to check never reach this page from the UI, but a
          pasted URL should explain itself rather than render an empty shell. */}
      {!kind ? (
        <Card>
          <EmptyState
            icon={Clock}
            title="Nothing to check here"
            description="Research and one-off tasks are done when you say they are done — there is no exercise behind them. Mark it off from the prep plan."
          />
        </Card>
      ) : !exercise ? (
        <GenerateExercise actionableId={actionable.id} kind={kind} />
      ) : exercise.kind === "code" ? (
        <CodeWorkspace
          exercise={exercise}
          actionable={actionable}
          lastSubmission={submissions[0] ?? null}
        />
      ) : (
        <WrittenWorkspace
          exercise={exercise}
          actionable={actionable}
          lastSubmission={submissions[0] ?? null}
        />
      )}
    </div>
  );
}
