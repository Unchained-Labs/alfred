"use client";

import { Tabs as RTabs } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";

export const Tabs = RTabs.Root;

export function TabsList({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <RTabs.List
      className={cn(
        "border-line bg-surface-2 inline-flex items-center gap-1 rounded-xl border p-1",
        className,
      )}
      {...props}
    />
  );
}

export function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof RTabs.Trigger>) {
  return (
    <RTabs.Trigger
      className={cn(
        "inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium",
        "text-ink-muted hover:text-ink transition-colors",
        "data-[state=active]:bg-surface data-[state=active]:text-ink data-[state=active]:shadow-sm",
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof RTabs.Content>) {
  return (
    <RTabs.Content
      className={cn("focus-visible:outline-none", className)}
      {...props}
    />
  );
}
