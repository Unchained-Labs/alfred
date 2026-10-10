"use client";

import { BellRing, Check, EarOff } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import type { Application } from "@/db/schema";
import { STAGE_META } from "@/lib/stages";
import { useNow } from "@/lib/use-now";
import { initials } from "@/lib/utils";

/** Business days, roughly — a chase that lands on a Sunday gets ignored. */
const CHASE_IN_DAYS = 3;

/**
 * Applications going quiet: sent a while ago, no reply, and nothing scheduled.
 *
 * The existing "needs a nudge" panel only fires once a follow-up date has been
 * set and has passed, which means an application nobody scheduled anything for
 * never appears anywhere. Those are the ones that get lost, so they get their
 * own panel — and a single button that schedules the chase, because the whole
 * point is to make the fix cheaper than the guilt.
 */
export type QuietJob = Application & { lastMovedAt: Date };

export function GoingQuiet({
  jobs,
  afterDays,
}: {
  jobs: QuietJob[];
  afterDays: number;
}) {
  const router = useRouter();
  const toast = useToast();
  // Reading the clock during render makes the output depend on when React
  // happened to re-render, and the server and client would disagree about
  // "days ago". useNow resolves after mount and ticks on its own.
  const now = useNow();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<Set<string>>(new Set());

  async function chase(job: Application) {
    setBusy(job.id);
    try {
      const when = new Date();
      when.setDate(when.getDate() + CHASE_IN_DAYS);
      when.setHours(9, 0, 0, 0);

      const response = await fetch(`/api/applications/${job.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          nextActionAt: when.toISOString(),
          nextActionLabel: "Follow up",
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? "Could not schedule it.");
      }
      // Marked locally so the row reads as handled before the refresh lands.
      setDone((prev) => new Set(prev).add(job.id));
      toast.success("Follow-up set", `${job.company} in ${CHASE_IN_DAYS} days`);
      router.refresh();
    } catch (error) {
      toast.error(
        "Could not schedule it",
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setBusy(null);
    }
  }

  const remaining = jobs.filter((job) => !done.has(job.id));

  if (!remaining.length) {
    return (
      <EmptyState
        icon={Check}
        title={done.size ? "All chased" : "Nothing going quiet"}
        description={
          done.size
            ? "Follow-ups are on the calendar."
            : `Everything that has not moved in ${afterDays} days already has a follow-up scheduled.`
        }
        compact
      />
    );
  }

  return (
    <ul className="divide-y divide-[var(--border)]">
      {remaining.map((job) => {
        const meta = STAGE_META[job.stage];
        const quietDays = now
          ? Math.floor((now - job.lastMovedAt.getTime()) / 86_400_000)
          : null;

        return (
          <li
            key={job.id}
            className="flex items-center gap-3 px-5 py-3 transition-colors"
          >
            <span
              aria-hidden
              className="bg-surface-3 text-ink-2 grid size-8 shrink-0 place-items-center rounded-lg text-[10px] font-semibold"
            >
              {initials(job.company)}
            </span>

            <Link href={`/pipeline/${job.id}`} className="group min-w-0 flex-1">
              <p className="text-ink truncate text-xs font-medium group-hover:underline">
                {job.title}
              </p>
              <p className="text-ink-muted truncate text-[11px]">
                {job.company}
                {quietDays != null ? ` · quiet for ${quietDays} days` : ""}
                {" · nothing scheduled"}
              </p>
            </Link>

            <Badge tint={`var(${meta.token})`}>{meta.label}</Badge>

            <Button
              size="sm"
              variant="secondary"
              onClick={() => chase(job)}
              loading={busy === job.id}
              disabled={busy !== null}
            >
              <BellRing className="size-3.5" />
              Chase in {CHASE_IN_DAYS}d
            </Button>
          </li>
        );
      })}
    </ul>
  );
}

export { EarOff as GoingQuietIcon };
