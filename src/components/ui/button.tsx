"use client";

import { Slot } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "outline" | "danger";
type Size = "sm" | "md" | "lg" | "icon";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-brand text-brand-ink hover:bg-brand-hot shadow-sm font-semibold",
  secondary: "bg-surface-2 text-ink hover:bg-surface-3 border border-line",
  outline:
    "border border-line-strong text-ink hover:bg-surface-2 hover:border-brand/50",
  ghost: "text-ink-2 hover:bg-surface-2 hover:text-ink",
  danger: "bg-[var(--critical)] text-white hover:brightness-110 font-semibold",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-xs gap-1.5 rounded-lg",
  md: "h-9.5 px-4 text-sm gap-2 rounded-lg",
  lg: "h-11 px-5 text-sm gap-2 rounded-xl",
  icon: "size-9 rounded-lg",
};

export type ButtonProps = React.ComponentProps<"button"> & {
  variant?: Variant;
  size?: Size;
  /** Render the child element instead of a <button> — e.g. wrapping a Link. */
  asChild?: boolean;
  loading?: boolean;
};

export function Button({
  className,
  variant = "secondary",
  size = "md",
  asChild,
  loading,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const Component = asChild ? Slot.Root : "button";
  return (
    <Component
      className={cn(
        "inline-flex shrink-0 cursor-pointer items-center justify-center whitespace-nowrap transition-all duration-150",
        "disabled:pointer-events-none disabled:opacity-45",
        "active:scale-[0.985]",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <>
          <Spinner />
          {size !== "icon" ? children : null}
        </>
      ) : (
        children
      )}
    </Component>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn("size-3.5 shrink-0 animate-spin", className)}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
    >
      <circle
        cx="8"
        cy="8"
        r="6.5"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="2"
      />
      <path
        d="M14.5 8A6.5 6.5 0 0 0 8 1.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
