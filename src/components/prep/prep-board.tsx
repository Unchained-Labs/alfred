"use client";

import {
  BadgeCheck,
  CheckSquare,
  Circle,
  CircleDot,
  Clock,
  ExternalLink,
  PenLine,
  SquareCode,
  Target,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { ProgressBar } from "@/components/charts/meter";
import { KIND_ICONS } from "@/components/dashboard/up-next";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip } from "@/components/ui/tooltip";
import { useToast } from "@/components/ui/toast";
import {
  ACTIONABLE_KINDS,
  type Actionable,
  type ActionableKind,
  type ActionableStatus,
} from "@/db/schema";
import { DO_IT_LABEL, exerciseKindFor } from "@/lib/exercises";
import { actionableMeta } from "@/lib/stages";
import { isOverdue, useNow } from "@/lib/use-now";
import { cn, relativeDay } from "@/lib/utils";

export type PrepItem = Actionable & {
  company: string | null;
  role: string | null;
};

const DIFFICULTY_TINT = {
  easy: "var(--good)",
  medium: "var(--warning)",
  hard: "var(--critical)",
} as const;

const NEXT_STATUS: Record<ActionableStatus, ActionableStatus> = {
  todo: "in_progress",
  in_progress: "done",
  done: "todo",
  skipped: "todo",
};

/** Without `done`, for items whose completion has to be earned. */
const NEXT_STATUS_EARNED: Record<ActionableStatus, ActionableStatus> = {
  todo: "in_progress",
  in_progress: "todo",
  done: "todo",
  skipped: "todo",
};

const STATUS_ICON = {
  todo: { Icon: Circle, color: "var(--ink-muted)", label: "Start" },
  in_progress: { Icon: CircleDot, color: "var(--warning)", label: "Mark done" },
  done: { Icon: CheckSquare, color: "var(--good)", label: "Reopen" },
  skipped: { Icon: Circle, color: "var(--ink-muted)", label: "Reopen" },
} as const;

/**
 * What the badge should say.
 *
 * "Priority" on every row was the old behaviour and it told you nothing — the
 * generator sets priority 3 on most of what it writes, so 25 of 25 items wore
 * the same badge. A date is the thing that actually sorts the work: an
 * interview on Friday makes Thursday's item urgent and next month's item
 * irrelevant, and no amount of priority ranking says that.
 */
function DueBadge({
  dueAt,
  priority,
  now,
}: {
  dueAt: Date | string | null;
  priority: number;
  /** Timestamp from useNow(): null until mount, so nothing time-relative
   *  renders on the server and hydration cannot disagree with itself. */
  now: number | null;
}) {
  if (!dueAt || now === null) {
    // No date: fall back to the old signal, but only for the top rank, so it
    // stays rare enough to mean something.
    return priority === 3 ? <Badge tint="var(--serious)">Priority</Badge> : null;
  }
  const due = typeof dueAt === "string" ? new Date(dueAt) : dueAt;
  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round(
    (startOfDay(due) - startOfDay(new Date(now))) / 86_400_000,
  );

  if (days < 0) return <Badge tint="var(--critical)">Overdue</Badge>;
  if (days === 0) return <Badge tint="var(--critical)">Due today</Badge>;
  if (days === 1) return <Badge tint="var(--serious)">Due tomorrow</Badge>;
  if (days <= 7)
    return (
      <Badge tint="var(--serious)">
        {due.toLocaleDateString(undefined, { weekday: "short" })}
      </Badge>
    );
  return (
    <Badge tint="var(--ink-muted)">
      {due.toLocaleDateString(undefined, { day: "numeric", month: "short" })}
    </Badge>
  );
}

export function PrepBoard({ items }: { items: PrepItem[] }) {
  const router = useRouter();
  const toast = useToast();
  const [kind, setKind] = React.useState<"all" | ActionableKind>("all");
  const [showDone, setShowDone] = React.useState(false);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const now = useNow();

  const byKind = React.useMemo(() => {
    const map = new Map<ActionableKind, { done: number; total: number }>();
    for (const item of items) {
      const entry = map.get(item.kind) ?? { done: 0, total: 0 };
      entry.total++;
      if (item.status === "done") entry.done++;
      map.set(item.kind, entry);
    }
    return map;
  }, [items]);

  const visible = React.useMemo(
    () =>
      items.filter(
        (item) =>
          (kind === "all" || item.kind === kind) &&
          (showDone || item.status !== "done"),
      ),
    [items, kind, showDone],
  );

  async function cycle(item: PrepItem) {
    setBusyId(item.id);
    const earned = Boolean(exerciseKindFor(item.kind)) && !item.verifiedAt;
    const next = (earned ? NEXT_STATUS_EARNED : NEXT_STATUS)[item.status];
    try {
      const response = await fetch(`/api/actionables/${item.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? "Could not update the item.");
      }
      if (next === "done") toast.success("Done", item.title);
      router.refresh();
    } catch (error) {
      toast.error("Update failed", error instanceof Error ? error.message : "");
    } finally {
      setBusyId(null);
    }
  }

  if (!items.length) {
    return (
      <Card>
        <EmptyState
          icon={Target}
          title="No prep work yet"
          description="Open an application and build its prep plan — everything Alfred generates lands here."
        />
      </Card>
    );
  }

  const presentKinds = ACTIONABLE_KINDS.filter((candidate) =>
    byKind.has(candidate),
  );

  return (
    /*
     * A flex column that fills the page's remaining height, because the list
     * below scrolls inside itself rather than growing the document.
     *
     * This root used to be `space-y-4` — a block. The page is `h-dvh
     * flex-col` and the list Card asks for `flex-1 min-h-0`, but with a block
     * in between there was no flex parent for that to resolve against, so the
     * list grew to its content and pushed the page past the viewport. The
     * chain has to be flex the whole way down or none of it works.
     */
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {/* Per-kind progress. Each tile names its kind in text, so the tint is
          reinforcement only. */}
      <div className="grid shrink-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {presentKinds.slice(0, 4).map((candidate) => {
          const meta = actionableMeta(candidate);
          const stats = byKind.get(candidate)!;
          const Icon = KIND_ICONS[meta.icon] ?? CheckSquare;
          return (
            <Card key={candidate} className="p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-ink inline-flex items-center gap-1.5 text-xs font-medium">
                  <Icon
                    className="size-3.5"
                    style={{ color: `var(${meta.token})` }}
                  />
                  {meta.label}
                </span>
                <span className="tnum text-ink-muted text-xs">
                  {stats.done}/{stats.total}
                </span>
              </div>
              <ProgressBar
                value={stats.done}
                total={stats.total}
                tint={`var(${meta.token})`}
                className="mt-3"
              />
            </Card>
          );
        })}
      </div>

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <Tabs value={kind} onValueChange={(value) => setKind(value as never)}>
          <TabsList className="flex-wrap">
            <TabsTrigger value="all">All</TabsTrigger>
            {presentKinds.map((candidate) => (
              <TabsTrigger key={candidate} value={candidate}>
                {actionableMeta(candidate).label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <label className="text-ink-muted inline-flex cursor-pointer items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={showDone}
            onChange={(event) => setShowDone(event.target.checked)}
            className="size-3.5 cursor-pointer accent-[var(--brand)]"
          />
          Show completed
        </label>
      </div>

      {visible.length === 0 ? (
        <Card>
          <EmptyState
            icon={CheckSquare}
            title="All clear here"
            description="Nothing open in this category. Toggle completed items to review what you've done."
            compact
          />
        </Card>
      ) : (
        /* min-h-48 is a floor, not decoration: on a short viewport a tall
           filter row would otherwise squeeze this to nothing. With a floor the
           page scrolls instead, which is the lesser evil. */
        <Card className="flex min-h-48 flex-1 flex-col overflow-hidden">
          {/* Scrolls here, not on the page. Twenty-five open items made the
              document 3,100px tall, so the filters you need in order to make
              the list shorter scrolled away as soon as you started reading. */}
          <ul className="min-h-0 flex-1 divide-y divide-[var(--border)] overflow-auto">
            {visible.map((item) => {
              const meta = actionableMeta(item.kind);
              const Icon = KIND_ICONS[meta.icon] ?? CheckSquare;
              const status = STATUS_ICON[item.status];
              const done = item.status === "done";
              const overdue = !done && isOverdue(item.dueAt, now);
              const exerciseKind = exerciseKindFor(item.kind);
              const earned = Boolean(exerciseKind) && !item.verifiedAt;

              return (
                <li
                  key={item.id}
                  className="hover:bg-surface-2 flex items-start gap-3 px-4 py-3 transition-colors"
                >
                  <Tooltip
                    content={
                      earned && item.status === "in_progress"
                        ? "Back to to-do"
                        : status.label
                    }
                  >
                    <button
                      type="button"
                      onClick={() => cycle(item)}
                      disabled={busyId === item.id}
                      aria-label={`${status.label}: ${item.title}`}
                      className="mt-0.5 shrink-0 cursor-pointer disabled:opacity-40"
                    >
                      <status.Icon
                        className="size-4"
                        style={{ color: status.color }}
                      />
                    </button>
                  </Tooltip>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <Icon
                        className="size-3.5 shrink-0"
                        style={{ color: `var(${meta.token})` }}
                        aria-hidden
                      />
                      <span
                        className={cn(
                          "text-xs font-medium",
                          done ? "text-ink-muted line-through" : "text-ink",
                        )}
                      >
                        {item.title}
                      </span>
                      {item.url ? (
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noreferrer noopener"
                          aria-label={`Open ${item.title}`}
                          className="text-ink-muted hover:text-ink transition-colors"
                        >
                          <ExternalLink className="size-3" />
                        </a>
                      ) : null}
                    </div>

                    {item.detail ? (
                      <p className="text-ink-2 mt-1 text-[11px] leading-relaxed">
                        {item.detail}
                      </p>
                    ) : null}

                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <Badge tint={`var(${meta.token})`}>{meta.label}</Badge>
                      {item.difficulty ? (
                        <Badge tint={DIFFICULTY_TINT[item.difficulty]}>
                          {item.difficulty}
                        </Badge>
                      ) : null}
                      {item.pattern ? <Badge>{item.pattern}</Badge> : null}
                      {item.applicationId ? (
                        <Link
                          href={`/pipeline/${item.applicationId}`}
                          className="text-ink-muted hover:text-ink text-[10px] underline-offset-2 hover:underline"
                        >
                          {item.company ?? "application"}
                        </Link>
                      ) : null}
                      {item.estMinutes ? (
                        <span className="text-ink-muted inline-flex items-center gap-1 text-[10px]">
                          <Clock className="size-2.5" />
                          {item.estMinutes}m
                        </span>
                      ) : null}
                      {item.dueAt ? (
                        <span
                          className="text-[10px]"
                          style={{
                            color: overdue ? "var(--critical)" : "var(--ink-muted)",
                          }}
                        >
                          due {relativeDay(item.dueAt)}
                        </span>
                      ) : null}
                      {item.verifiedAt ? (
                        <span
                          className="inline-flex items-center gap-1 text-[10px] font-medium"
                          style={{ color: "var(--good)" }}
                        >
                          <BadgeCheck className="size-3" />
                          verified
                        </span>
                      ) : null}
                    </div>

                    {exerciseKind ? (
                      <Link
                        href={`/prep/${item.id}`}
                        className="text-brand mt-2 inline-flex items-center gap-1.5 text-[11px] font-medium underline-offset-2 hover:underline"
                      >
                        {exerciseKind === "code" ? (
                          <SquareCode className="size-3.5" />
                        ) : (
                          <PenLine className="size-3.5" />
                        )}
                        {item.verifiedAt ? "Review it" : DO_IT_LABEL[exerciseKind]}
                      </Link>
                    ) : null}
                  </div>

                  {!done ? (
                    <DueBadge
                      dueAt={item.dueAt}
                      priority={item.priority}
                      now={now}
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
