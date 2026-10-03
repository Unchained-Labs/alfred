import {
  BookOpen,
  CheckSquare,
  Clock,
  Code2,
  ListChecks,
  type LucideIcon,
  MessageSquare,
  Network,
  Search,
} from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import type { Actionable } from "@/db/schema";
import { ACTIONABLE_META } from "@/lib/stages";
import { relativeDay } from "@/lib/utils";

export const KIND_ICONS: Record<string, LucideIcon> = {
  Code2,
  BookOpen,
  Network,
  MessageSquare,
  ListChecks,
  Search,
  CheckSquare,
};

export type UpNextItem = Actionable & {
  company: string | null;
  role: string | null;
};

export function UpNext({ items }: { items: UpNextItem[] }) {
  if (!items.length) {
    return (
      <EmptyState
        icon={CheckSquare}
        title="Nothing queued"
        description="Run a prep plan on an application and the work shows up here."
        compact
      />
    );
  }

  return (
    <ul className="divide-y divide-[var(--border)]">
      {items.map((item) => {
        const meta = ACTIONABLE_META[item.kind];
        const Icon = KIND_ICONS[meta.icon] ?? CheckSquare;
        const overdue =
          item.dueAt != null && item.dueAt.getTime() < Date.now();

        return (
          <li key={item.id}>
            <Link
              href={
                item.applicationId ? `/pipeline/${item.applicationId}` : "/prep"
              }
              className="flex items-start gap-3 px-5 py-3 transition-colors hover:bg-surface-2"
            >
              <span
                className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg"
                style={{
                  background: `color-mix(in oklab, var(${meta.token}) 16%, transparent)`,
                }}
              >
                <Icon className="size-3.5" style={{ color: `var(${meta.token})` }} />
              </span>

              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-ink">{item.title}</p>
                <p className="mt-0.5 truncate text-[11px] text-ink-muted">
                  {item.company ? `${item.company} · ` : ""}
                  {meta.label}
                  {item.estMinutes ? ` · ${item.estMinutes}m` : ""}
                </p>
              </div>

              {item.priority === 3 ? (
                <Badge tint="var(--serious)">Priority</Badge>
              ) : item.dueAt ? (
                <span
                  className="inline-flex shrink-0 items-center gap-1 text-[10px]"
                  style={{ color: overdue ? "var(--critical)" : "var(--ink-muted)" }}
                >
                  <Clock className="size-3" />
                  {relativeDay(item.dueAt)}
                </span>
              ) : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
