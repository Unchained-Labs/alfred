"use client";

import {
  CheckSquare,
  Circle,
  CircleDot,
  Clock,
  ExternalLink,
  ListTodo,
  RefreshCw,
  Sparkles,
  Trash2,
} from "lucide-react";
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

function StatusButton({
  status,
  onClick,
  busy,
}: {
  status: ActionableStatus;
  onClick: () => void;
  busy: boolean;
}) {
  const config = {
    todo: { Icon: Circle, color: "var(--ink-muted)", label: "Mark in progress" },
    in_progress: { Icon: CircleDot, color: "var(--warning)", label: "Mark done" },
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

  return (
    <li className="group flex items-start gap-3 px-5 py-3 transition-colors hover:bg-surface-2">
      <StatusButton
        status={item.status}
        onClick={() => onStatus(item.id, NEXT_STATUS[item.status])}
        busy={busy}
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

        {item.rationale ? (
          <p className="mt-1 text-[11px] leading-relaxed text-ink-muted italic">
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
            <span className="inline-flex items-center gap-1 text-[10px] text-ink-muted">
              <Clock className="size-2.5" />
              {item.estMinutes}m
            </span>
          ) : null}
        </div>
      </div>

      <button
        type="button"
        onClick={() => onDelete(item.id)}
        disabled={busy}
        aria-label={`Delete ${item.title}`}
        className="shrink-0 cursor-pointer rounded p-1 text-ink-muted opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
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
      if (!response.ok) throw new Error("Could not update the item.");
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
          <p className="mt-0.5 text-xs text-ink-muted">
            {actionables.length
              ? `${done} of ${actionables.length} done${totalMinutes ? ` · ~${Math.round(totalMinutes / 60)}h remaining` : ""}`
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
        <p className="mx-5 mb-3 rounded-lg border border-line bg-surface-2 p-3 text-xs leading-relaxed text-ink-2">
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
        <ul className="divide-y divide-[var(--border)] border-t border-line">
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
