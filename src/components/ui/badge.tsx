import * as React from "react";
import { cn } from "@/lib/utils";

export type BadgeProps = React.ComponentProps<"span"> & {
  /** Any CSS color — usually a design token like `var(--series-1)`. */
  tint?: string;
  size?: "sm" | "md";
  /** Solid fills read as emphasis; use sparingly. */
  solid?: boolean;
};

/**
 * A tinted chip. The text label always carries the meaning — the tint only
 * reinforces it, which is what keeps light-mode's low-contrast hues legal.
 */
export function Badge({
  className,
  tint,
  size = "sm",
  solid,
  style,
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border font-medium whitespace-nowrap",
        size === "sm" ? "h-5.5 px-2 text-[11px]" : "h-7 px-2.5 text-xs",
        className,
      )}
      style={{
        color: solid ? "var(--brand-ink)" : (tint ?? "var(--ink-2)"),
        backgroundColor: solid
          ? (tint ?? "var(--surface-3)")
          : tint
            ? `color-mix(in oklab, ${tint} 14%, transparent)`
            : "var(--surface-2)",
        borderColor: tint
          ? `color-mix(in oklab, ${tint} 30%, transparent)`
          : "var(--border)",
        ...style,
      }}
      {...props}
    >
      {children}
    </span>
  );
}

/** A 8px color key, for pairing identity with text per the legend rules. */
export function Dot({ tint, className }: { tint: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("size-2 shrink-0 rounded-full", className)}
      style={{ backgroundColor: tint }}
    />
  );
}
