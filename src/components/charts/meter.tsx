import * as React from "react";
import { cn } from "@/lib/utils";

/** Fit-score thresholds, matching the calibration given to the model. */
export function fitTone(score: number): {
  color: string;
  label: string;
} {
  if (score >= 85) return { color: "var(--good)", label: "Strong fit" };
  if (score >= 70) return { color: "var(--good)", label: "Good fit" };
  if (score >= 50) return { color: "var(--warning)", label: "Worth a shot" };
  if (score >= 25) return { color: "var(--serious)", label: "A stretch" };
  return { color: "var(--critical)", label: "Weak fit" };
}

/**
 * The fit score as a radial gauge. The number is always rendered, so severity
 * color never carries the meaning alone.
 */
export function FitGauge({
  score,
  size = 104,
  className,
}: {
  score: number;
  size?: number;
  className?: string;
}) {
  const tone = fitTone(score);
  const stroke = 9;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const filled = (Math.min(100, Math.max(0, score)) / 100) * circumference;

  return (
    <div
      className={cn("relative shrink-0", className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`Fit score ${score} out of 100 — ${tone.label}`}
    >
      <svg width={size} height={size} className="-rotate-90">
        {/* Unfilled track: a lighter plane of the same ramp family. */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--surface-3)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={tone.color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference}`}
          className="transition-[stroke-dasharray] duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <p className="figure text-ink text-3xl">{score}</p>
          <p className="text-ink-muted mt-0.5 text-[10px]">/ 100</p>
        </div>
      </div>
    </div>
  );
}

/** A plain completion bar. Fill is the brand-neutral series hue. */
export function ProgressBar({
  value,
  total,
  tint = "var(--series-1)",
  className,
}: {
  value: number;
  total: number;
  tint?: string;
  className?: string;
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div
      className={cn(
        "bg-surface-3 h-1.5 w-full overflow-hidden rounded-full",
        className,
      )}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-label={`${value} of ${total} complete`}
    >
      <div
        className="h-full rounded-full transition-[width] duration-500"
        style={{ width: `${pct}%`, backgroundColor: tint }}
      />
    </div>
  );
}
