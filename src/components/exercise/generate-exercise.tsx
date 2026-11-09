"use client";

import { RefreshCw, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState, ThinkingRows } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { jobPhase, useQueuedJob } from "@/components/jobs/use-queued-job";
import type { AiJob } from "@/db/schema";

const urlFor = (actionableId: string) =>
  `/api/actionables/${actionableId}/exercise`;

/** The empty state: no exercise has been generated for this item yet. */
export function GenerateExercise({
  actionableId,
  kind,
  activeJob,
}: {
  actionableId: string;
  kind: "code" | "written";
  /** An exercise already queued or running for this item — say, by the automatic pipeline. */
  activeJob?: AiJob | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const { job, busy, start } = useQueuedJob(activeJob, {
    onFailed: (failed) => toast.error("Could not build it", failed.error ?? ""),
  });

  async function run() {
    try {
      const data = await start(urlFor(actionableId), { regenerate: false });
      // An exercise that already existed comes straight back.
      if (!data.job) router.refresh();
    } catch (error) {
      toast.error(
        "Could not build it",
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  if (busy) {
    return (
      <Card>
        <CardBody className="space-y-4 pt-5">
          <p className="text-ink-muted text-xs">
            {jobPhase(job)}
            {job?.status === "queued" ? " — other generations are ahead of it" : ""}
            . It carries on if you leave this page.
          </p>
          <p className="text-ink text-sm font-medium">
            {kind === "code"
              ? "Writing the problem, then solving it to check the tests are right."
              : "Writing the question and the rubric it will be graded against."}
          </p>
          <p className="text-ink-muted text-xs">
            {kind === "code"
              ? "Alfred runs its own solution against its own tests before handing you anything. This takes a moment, and it is the reason the tests can be trusted."
              : "The rubric decides whether your answer passes, so it is written before you see the question."}
          </p>
          <ThinkingRows rows={4} />
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <EmptyState
        icon={Sparkles}
        title={
          kind === "code" ? "No problem written yet" : "No question written yet"
        }
        description={
          kind === "code"
            ? "Alfred will turn this into a Python problem with a test suite, tailored to the role — and verify the suite before you see it."
            : "Alfred will pose this as an interviewer at this company would, with a rubric that decides whether your answer holds up."
        }
        action={
          <Button variant="primary" onClick={run}>
            <Sparkles className="size-3.5" />
            Build it
          </Button>
        }
      />
    </Card>
  );
}

/**
 * Replaces the exercise. Destructive on purpose: the attempts on record were
 * attempts at the old problem, so they go with it — and with them any
 * completion they earned.
 */
export function RegenerateExercise({
  actionableId,
  verified,
}: {
  actionableId: string;
  verified: boolean;
}) {
  const toast = useToast();
  const [confirming, setConfirming] = React.useState(false);
  const { busy, start } = useQueuedJob(null, {
    onSucceeded: () => {
      toast.success("New exercise", "The previous attempts went with the old one.");
      setConfirming(false);
    },
    onFailed: (failed) => toast.error("Could not rebuild it", failed.error ?? ""),
  });

  async function run() {
    try {
      await start(urlFor(actionableId), { regenerate: true });
    } catch (error) {
      toast.error(
        "Could not rebuild it",
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  if (!confirming) {
    return (
      <Button size="sm" variant="ghost" onClick={() => setConfirming(true)}>
        <RefreshCw className="size-3.5" />
        New exercise
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-ink-muted text-[11px]">
        {verified
          ? "This discards your passing attempt too."
          : "Discards your attempts so far."}
      </span>
      <Button size="sm" variant="danger" onClick={run} loading={busy}>
        Replace
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => setConfirming(false)}
        disabled={busy}
      >
        Keep
      </Button>
    </div>
  );
}
