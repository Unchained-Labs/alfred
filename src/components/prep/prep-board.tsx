"use client";

import {
  CheckSquare,
  Circle,
  CircleDot,
  Clock,
  ExternalLink,
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
import { ACTIONABLE_META } from "@/lib/stages";
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

const STATUS_ICON = {
  todo: { Icon: Circle, color: "var(--ink-muted)", label: "Start" },
  in_progress: { Icon: CircleDot, color: "var(--warning)", label: "Mark done" },
  done: { Icon: CheckSquare, color: "var(--good)", label: "Reopen" },
  skipped: { Icon: Circle, color: "var(--ink-muted)", label: "Reopen" },
} as const;

export function PrepBoard({ items }: { items: PrepItem[] }) {
  const router = useRouter();
  const toast = useToast();
  const [kind, setKind] = React.useState<"all" | ActionableKind>("all");
  const [showDone, setShowDone] = React.useState(false);
  const [busyId, setBusyId] = React.useState<string | null>(null);

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
    const next = NEXT_STATUS[item.status];
    try {
      const response = await fetch(`/api/actionables/${item.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!response.ok) throw new Error("Could not update the item.");
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
    <div className="space-y-4">
      {/* Per-kind progress. Each tile names its kind in text, so the tint is
          reinforcement only. */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {presentKinds.slice(0, 4).map((candidate) => {
          const meta = ACTIONABLE_META[candidate];
          const stats = byKind.get(candidate)!;
          const Icon = KIND_ICONS[meta.icon] ?? CheckSquare;
          return (
            <Card key={candidate} className="p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink">
                  <Icon
                    className="size-3.5"
                    style={{ color: `var(${meta.token})` }}
                  />
                  {meta.label}
                </span>
                <span className="tnum text-xs text-ink-muted">
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

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={kind} onValueChange={(value) => setKind(value as never)}>
          <TabsList className="flex-wrap">
            <TabsTrigger value="all">All</TabsTrigger>
            {presentKinds.map((candidate) => (
              <TabsTrigger key={candidate} value={candidate}>
                {ACTIONABLE_META[candidate].label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-ink-muted">
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
        <Card className="overflow-hidden">
          <ul className="divide-y divide-[var(--border)]">
            {visible.map((item) => {
              const meta = ACTIONABLE_META[item.kind];
              const Icon = KIND_ICONS[meta.icon] ?? CheckSquare;
              const status = STATUS_ICON[item.status];
              const done = item.status === "done";
              const overdue =
                item.dueAt != null && item.dueAt.getTime() < Date.now() && !done;

              return (
                <li
                  key={item.id}
                  className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-surface-2"
                >
                  <Tooltip content={status.label}>
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
                          className="text-ink-muted transition-colors hover:text-ink"
                        >
                          <ExternalLink className="size-3" />
                        </a>
                      ) : null}
                    </div>

                    {item.detail ? (
                      <p className="mt-1 text-[11px] leading-relaxed text-ink-2">
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
                          className="text-[10px] text-ink-muted underline-offset-2 hover:text-ink hover:underline"
                        >
                          {item.company ?? "application"}
                        </Link>
                      ) : null}
                      {item.estMinutes ? (
                        <span className="inline-flex items-center gap-1 text-[10px] text-ink-muted">
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
                    </div>
                  </div>

                  {item.priority === 3 && !done ? (
                    <Badge tint="var(--serious)">Priority</Badge>
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
