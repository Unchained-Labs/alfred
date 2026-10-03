import type { LucideIcon } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  compact,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "gap-2 px-4 py-8" : "gap-3 px-6 py-14",
        className,
      )}
    >
      <div
        className={cn(
          "border-line bg-surface-2 grid place-items-center rounded-2xl border",
          compact ? "size-9" : "size-12",
        )}
      >
        <Icon className={cn("text-ink-muted", compact ? "size-4" : "size-5")} />
      </div>
      <div className="max-w-sm">
        <p className={cn("text-ink font-medium", compact ? "text-xs" : "text-sm")}>
          {title}
        </p>
        {description ? (
          <p
            className={cn(
              "text-ink-muted mt-1 leading-relaxed",
              compact ? "text-[11px]" : "text-xs",
            )}
          >
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("shimmer rounded-lg", className)} />;
}

/** Placeholder shown while an AI operation is in flight. */
export function ThinkingRows({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2.5">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-3">
          <Skeleton className="size-8 shrink-0 rounded-lg" />
          <div className="flex-1 space-y-1.5">
            <Skeleton
              className="h-3"
              // Stagger widths so the block reads as text, not a table.
              // Deterministic, so it matches between server and client renders.
              {...{ style: { width: `${72 - index * 11}%` } }}
            />
            <Skeleton className="h-2.5 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}
