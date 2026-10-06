"use client";

import {
  BadgeCheck,
  CheckSquare,
  Circle,
  CircleDot,
  Clock,
  ExternalLink,
  ListTodo,
  PenLine,
  RefreshCw,
  Sparkles,
  SquareCode,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { ProgressBar } from "@/components/charts/meter";
import { KIND_ICONS } from "@/components/dashboard/up-next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, ThinkingRows } from "@/components/ui/states";
import { Tooltip } from "@/components/ui/tooltip";
import { useToast } from "@/components/ui/toast";
import type { Actionable, ActionableStatus } from "@/db/schema";
import { DO_IT_LABEL, exerciseKindFor, requiresExercise } from "@/lib/exercises";
import { ACTIONABLE_META } from "@/lib/stages";
import { cn } from "@/lib/utils";

const DIFFICULTY_TINT = {
  easy: "var(--good)",
  medium: "var(--warning)",
  hard: "var(--critical)",
} as const;

/** todo → in_progress → done → todo, so one control cycles the whole state. */
const NEXT_STATUS: Record<ActionableStatus, ActionableStatus> = {
  todo: "in_progress",
  in_progress: "done",
  done: "todo",
  skipped: "todo",
};

/**
 * The same cycle with `done` removed, for items that have an exercise behind
 * them. The server would refuse the write anyway; offering it and then showing
 * an error would just be a worse way of saying the same thing.
 */
const NEXT_STATUS_EARNED: Record<ActionableStatus, ActionableStatus> = {
  todo: "in_progress",
  in_progress: "todo",
  done: "todo",
  skipped: "todo",
};

function StatusButton({
  status,
  onClick,
  busy,
  earned,
}: {
  status: ActionableStatus;
  onClick: () => void;
  busy: boolean;
  /** True when completion has to come from a passing submission. */
  earned: boolean;
}) {
  const config = {
    todo: { Icon: Circle, color: "var(--ink-muted)", label: "Mark in progress" },
    in_progress: {
      Icon: CircleDot,
      color: "var(--warning)",
      label: earned ? "Back to to-do" : "Mark done",
    },
    done: { Icon: CheckSquare, color: "var(--good)", label: "Reopen" },
    skipped: { Icon: Circle, color: "var(--ink-muted)", label: "Reopen" },
  }[status];

  return (
    <Tooltip content={config.label}>
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        aria-label={config.label}
        className="mt-0.5 shrink-0 cursor-pointer rounded transition-opacity disabled:opacity-40"
      >
        <config.Icon className="size-4" style={{ color: config.color }} />
      </button>
    </Tooltip>
  );
}

function ActionableRow({
  item,
  onStatus,
  onDelete,
  busy,
}: {
  item: Actionable;
  onStatus: (id: string, status: ActionableStatus) => void;
  onDelete: (id: string) => void;
  busy: boolean;
}) {
  const meta = ACTIONABLE_META[item.kind];
  const Icon = KIND_ICONS[meta.icon] ?? CheckSquare;
  const done = item.status === "done";
  const exerciseKind = exerciseKindFor(item.kind);
  // Completion is earned until there is a passing submission on record.
  const earned = Boolean(exerciseKind) && !item.verifiedAt;
  const cycle = earned ? NEXT_STATUS_EARNED : NEXT_STATUS;

  return (
    <li className="group hover:bg-surface-2 flex items-start gap-3 px-5 py-3 transition-colors">
      <StatusButton
        status={item.status}
        onClick={() => onStatus(item.id, cycle[item.status])}
        busy={busy}
        earned={earned}
      />

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

        {item.rationale ? (
          <p className="text-ink-muted mt-1 text-[11px] leading-relaxed italic">
            {item.rationale}
          </p>
        ) : null}

        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {/* The kind label is always text — the tint only reinforces it. */}
          <Badge tint={`var(${meta.token})`}>{meta.label}</Badge>
          {item.difficulty ? (
            <Badge tint={DIFFICULTY_TINT[item.difficulty]}>{item.difficulty}</Badge>
          ) : null}
          {item.pattern ? <Badge>{item.pattern}</Badge> : null}
          {item.estMinutes ? (
            <span className="text-ink-muted inline-flex items-center gap-1 text-[10px]">
              <Clock className="size-2.5" />
              {item.estMinutes}m
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

        {/* The way the item actually gets done. A link rather than a button:
            it is a place you go to work, and it should be openable in a tab. */}
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

      <button
        type="button"
        onClick={() => onDelete(item.id)}
        disabled={busy}
        aria-label={`Delete ${item.title}`}
        className="text-ink-muted shrink-0 cursor-pointer rounded p-1 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
      >
        <Trash2 className="size-3" />
      </button>
    </li>
  );
}

export function ActionablesPanel({
  applicationId,
  actionables,
  hasAnalysis,
}: {
  applicationId: string;
  actionables: Actionable[];
  hasAnalysis: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [generating, setGenerating] = React.useState(false);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [overview, setOverview] = React.useState<string | null>(null);

  const done = actionables.filter((item) => item.status === "done").length;
  const totalMinutes = actionables
    .filter((item) => item.status !== "done")
    .reduce((sum, item) => sum + (item.estMinutes ?? 0), 0);

  // How much of this plan is work that has to be earned, and how much of that
  // is actually earned. Worth stating plainly: it is the difference between a
  // plan you have read and a plan you have done.
  const gated = actionables.filter((item) => requiresExercise(item.kind));
  const verified = gated.filter((item) => item.verifiedAt).length;

  async function generate() {
    setGenerating(true);
    try {
      const response = await fetch(
        `/api/applications/${applicationId}/actionables`,
        { method: "POST" },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not build the plan.");
      setOverview(data.overview ?? null);
      toast.success(`${data.actionables.length} prep items ready`);
      router.refresh();
    } catch (error) {
      toast.error(
        "Prep plan failed",
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setGenerating(false);
    }
  }

  async function setStatus(id: string, status: ActionableStatus) {
    setBusyId(id);
    try {
      const response = await fetch(`/api/actionables/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? "Could not update the item.");
      }
      router.refresh();
    } catch (error) {
      toast.error("Update failed", error instanceof Error ? error.message : "");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: string) {
    setBusyId(id);
    try {
      const response = await fetch(`/api/actionables/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Could not delete the item.");
      router.refresh();
    } catch (error) {
      toast.error("Delete failed", error instanceof Error ? error.message : "");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2">
            <ListTodo className="size-4" style={{ color: "var(--brand)" }} />
            Prep plan
          </CardTitle>
          <p className="text-ink-muted mt-0.5 text-xs">
            {actionables.length
              ? `${done} of ${actionables.length} done${gated.length ? ` · ${verified} of ${gated.length} verified` : ""}${totalMinutes ? ` · ~${Math.round(totalMinutes / 60)}h remaining` : ""}`
              : "Coding problems, concepts, system design, and behavioral prep"}
          </p>
        </div>
        {actionables.length ? (
          <Button size="sm" variant="ghost" onClick={generate} loading={generating}>
            <RefreshCw className="size-3.5" />
            Regenerate
          </Button>
        ) : null}
      </CardHeader>

      {actionables.length ? (
        <div className="px-5 pb-3">
          <ProgressBar value={done} total={actionables.length} />
        </div>
      ) : null}

      {overview ? (
        <p className="border-line bg-surface-2 text-ink-2 mx-5 mb-3 rounded-lg border p-3 text-xs leading-relaxed">
          {overview}
        </p>
      ) : null}

      {generating && !actionables.length ? (
        <CardBody>
          <ThinkingRows rows={5} />
        </CardBody>
      ) : !actionables.length ? (
        <EmptyState
          icon={ListTodo}
          title="No prep plan yet"
          description={
            hasAnalysis
              ? "Alfred will pick coding problems, concepts, and stories tailored to this role."
              : "Run the fit analysis first — the plan targets the gaps it finds."
          }
          action={
            <Button variant="primary" onClick={generate} loading={generating}>
              <Sparkles className="size-3.5" />
              Build my prep plan
            </Button>
          }
          compact
        />
      ) : (
        <ul className="border-line divide-y divide-[var(--border)] border-t">
          {actionables.map((item) => (
            <ActionableRow
              key={item.id}
              item={item}
              onStatus={setStatus}
              onDelete={remove}
              busy={busyId === item.id}
            />
          ))}
        </ul>
      )}
    </Card>
  );
}
