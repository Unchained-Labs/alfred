import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

/** Auto-compacts a count the way the stat-tile contract specifies. */
function compact(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 10_000) return `${Math.round(value / 1000)}K`;
  if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return value.toLocaleString();
}

export type StatTileProps = {
  label: string;
  value: number | string;
  /** Optional suffix rendered small beside the value, e.g. "%". */
  unit?: string;
  icon?: LucideIcon;
  /** Signed change vs the named period. */
  delta?: { value: number; period: string; higherIsBetter?: boolean };
  /** 12-point series for the sparkline. */
  trend?: number[];
  hint?: string;
  className?: string;
};

export function StatTile({
  label,
  value,
  unit,
  icon: Icon,
  delta,
  trend,
  hint,
  className,
}: StatTileProps) {
  const display = typeof value === "number" ? compact(value) : value;

  // Direction × whether up is good — a falling rejection count is good news.
  const higherIsBetter = delta?.higherIsBetter ?? true;
  const flat = delta?.value === 0;
  const good = delta ? delta.value > 0 === higherIsBetter : false;
  const deltaColor = flat
    ? "var(--ink-muted)"
    : good
      ? "var(--good-ink)"
      : "var(--critical)";
  const DeltaIcon = flat
    ? ArrowRight
    : delta && delta.value > 0
      ? ArrowUpRight
      : ArrowDownRight;

  return (
    <div className={cn("card card-lit flex flex-col gap-3 p-4", className)}>
      <div className="flex items-start justify-between gap-2">
        <p className="label-eyebrow">{label}</p>
        {Icon ? <Icon className="text-ink-muted size-3.5 shrink-0" /> : null}
      </div>

      <div className="flex items-end gap-1.5">
        {/* Proportional figures — tabular-nums would look loose at this size. */}
        <span className="text-ink text-[1.75rem] leading-none font-semibold tracking-tight">
          {display}
        </span>
        {unit ? (
          <span className="text-ink-muted pb-0.5 text-sm font-medium">{unit}</span>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-3">
        {delta ? (
          <span
            className="inline-flex items-center gap-0.5 text-xs font-medium"
            style={{ color: deltaColor }}
          >
            <DeltaIcon className="size-3" />
            {Math.abs(delta.value)}
            <span className="text-ink-muted font-normal"> {delta.period}</span>
          </span>
        ) : hint ? (
          <span className="text-ink-muted text-xs">{hint}</span>
        ) : (
          <span />
        )}

        {trend?.length ? <Sparkline points={trend} /> : null}
      </div>
    </div>
  );
}

/**
 * A 12-point sparkline: the de-emphasis hue for history, the series accent for
 * the current point. No axis, no labels — the stat tile's value is the label.
 */
export function Sparkline({
  points,
  width = 72,
  height = 22,
}: {
  points: number[];
  width?: number;
  height?: number;
}) {
  if (points.length < 2) return null;

  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const span = max - min || 1;
  const stepX = width / (points.length - 1);

  const coords = points.map((point, index) => ({
    x: index * stepX,
    // Inset by 2px top and bottom so the 2px stroke never clips.
    y: height - 2 - ((point - min) / span) * (height - 4),
  }));

  const line = coords
    .map(
      (coord, index) =>
        `${index === 0 ? "M" : "L"}${coord.x.toFixed(1)} ${coord.y.toFixed(1)}`,
    )
    .join(" ");
  const area = `${line} L${width} ${height} L0 ${height} Z`;
  const last = coords[coords.length - 1];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="shrink-0 overflow-visible"
      aria-hidden
    >
      <path d={area} fill="var(--series-1)" fillOpacity="0.1" />
      <path
        d={line}
        fill="none"
        stroke="var(--series-1)"
        strokeOpacity="0.5"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* ≥8px marker with a 2px surface ring, per the mark specs. */}
      <circle cx={last.x} cy={last.y} r="4" fill="var(--series-1)" />
      <circle
        cx={last.x}
        cy={last.y}
        r="4"
        fill="none"
        stroke="var(--surface)"
        strokeWidth="2"
      />
    </svg>
  );
}
