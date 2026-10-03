"use client";

import { Tooltip as RTooltip } from "radix-ui";
import * as React from "react";

export function TooltipProvider({ children }: { children: React.ReactNode }) {
  return (
    <RTooltip.Provider delayDuration={250} skipDelayDuration={200}>
      {children}
    </RTooltip.Provider>
  );
}

export function Tooltip({
  content,
  children,
  side = "top",
}: {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: "top" | "right" | "bottom" | "left";
}) {
  if (!content) return <>{children}</>;
  return (
    <RTooltip.Root>
      <RTooltip.Trigger asChild>{children}</RTooltip.Trigger>
      <RTooltip.Portal>
        <RTooltip.Content
          side={side}
          sideOffset={6}
          collisionPadding={8}
          className="z-50 max-w-64 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs leading-snug text-ink-2 shadow-[var(--shadow-pop)]"
        >
          {content}
        </RTooltip.Content>
      </RTooltip.Portal>
    </RTooltip.Root>
  );
}
