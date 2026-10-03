"use client";

import { CalendarClock, GripVertical, MapPin, Sparkles } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import type { Application } from "@/db/schema";
import { cn, formatSalary, hueFromString, initials, relativeDay } from "@/lib/utils";

export type BoardCardData = Application & { fitScore: number | null };

/**
 * A pipeline card. Rendered both in the board (draggable) and inside the drag
 * overlay, so all drag wiring is injected rather than owned here.
 */
export function ApplicationCard({
  app,
  dragHandleProps,
  dragging,
  overlay,
}: {
  app: BoardCardData;
  dragHandleProps?: React.HTMLAttributes<HTMLButtonElement>;
  dragging?: boolean;
  overlay?: boolean;
}) {
  const salary = formatSalary(app.salaryMin, app.salaryMax, app.currency ?? "USD");
  const hue = hueFromString(app.company);
  const overdue =
    app.nextActionAt != null && app.nextActionAt.getTime() < Date.now();

  return (
    <div
      className={cn(
        "card group relative p-3 transition-shadow",
        overlay && "rotate-1 shadow-[var(--shadow-pop)]",
        dragging && "opacity-40",
        !overlay && "hover:shadow-[var(--shadow-pop)]",
      )}
    >
      {/* Company on its own compact row so the title gets the card's full
          width — board columns are narrow and a shared row clipped it. */}
      <div className="flex items-center gap-2">
        {/* Company tint is decorative identity, not an encoding — derived from
            the name so the same company always looks the same. */}
        <span
          className="grid size-6 shrink-0 place-items-center rounded-md text-[9px] font-semibold"
          style={{
            background: `oklch(0.62 0.12 ${hue} / 0.18)`,
            color: `oklch(0.72 0.11 ${hue})`,
          }}
          aria-hidden
        >
          {initials(app.company)}
        </span>
        <p className="min-w-0 flex-1 truncate text-[11px] font-medium text-ink-2">
          {app.company}
        </p>

        {dragHandleProps ? (
          <button
            type="button"
            aria-label={`Reorder ${app.title}`}
            className="-mr-1 cursor-grab rounded p-0.5 text-ink-muted opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 active:cursor-grabbing"
            {...dragHandleProps}
          >
            <GripVertical className="size-3.5" />
          </button>
        ) : null}
      </div>

      <Link
        href={`/pipeline/${app.id}`}
        className="mt-1.5 block text-xs leading-snug font-semibold text-ink hover:underline"
        title={app.title}
      >
        <span className="line-clamp-2">{app.title}</span>
      </Link>

      {(app.location || salary || app.fitScore != null) ? (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {app.fitScore != null ? (
            <Badge
              tint={
                app.fitScore >= 70
                  ? "var(--good)"
                  : app.fitScore >= 50
                    ? "var(--warning)"
                    : "var(--serious)"
              }
            >
              <Sparkles className="size-2.5" />
              {app.fitScore}
            </Badge>
          ) : null}
          {salary ? <Badge>{salary}</Badge> : null}
          {app.location ? (
            <span className="inline-flex min-w-0 items-center gap-1 text-[10px] text-ink-muted">
              <MapPin className="size-2.5 shrink-0" />
              <span className="truncate">{app.location}</span>
            </span>
          ) : null}
        </div>
      ) : null}

      {app.nextActionAt ? (
        <p
          className="mt-2 inline-flex items-center gap-1 text-[10px]"
          style={{ color: overdue ? "var(--critical)" : "var(--ink-muted)" }}
        >
          <CalendarClock className="size-2.5" />
          {app.nextActionLabel ?? "Follow up"} {relativeDay(app.nextActionAt)}
        </p>
      ) : null}

      {app.priority === 3 ? (
        <span
          aria-label="High priority"
          title="High priority"
          className="absolute top-3 bottom-3 left-0 w-0.5 rounded-r-full"
          style={{ background: "var(--serious)" }}
        />
      ) : null}
    </div>
  );
}
