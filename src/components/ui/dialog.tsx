"use client";

import { Dialog as RDialog } from "radix-ui";
import { X } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

export const Dialog = RDialog.Root;
export const DialogTrigger = RDialog.Trigger;
export const DialogClose = RDialog.Close;

export function DialogContent({
  className,
  children,
  title,
  description,
  width = "lg",
}: {
  className?: string;
  children: React.ReactNode;
  title: string;
  description?: string;
  width?: "sm" | "md" | "lg" | "xl";
}) {
  const widths = {
    sm: "max-w-md",
    md: "max-w-xl",
    lg: "max-w-2xl",
    xl: "max-w-4xl",
  } as const;

  return (
    <RDialog.Portal>
      <RDialog.Overlay
        className={cn(
          "fixed inset-0 z-50 bg-black/55 backdrop-blur-sm",
          "data-[state=open]:animate-in data-[state=open]:fade-in-0",
          "data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
        )}
      />
      <RDialog.Content
        className={cn(
          "fixed top-1/2 left-1/2 z-50 w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2",
          "border-line bg-surface max-h-[90vh] overflow-hidden rounded-2xl border shadow-[var(--shadow-pop)]",
          "flex flex-col focus:outline-none",
          widths[width],
          className,
        )}
      >
        <div className="border-line flex items-start justify-between gap-4 border-b px-6 py-4">
          <div className="min-w-0">
            <RDialog.Title className="text-ink text-base font-semibold tracking-tight">
              {title}
            </RDialog.Title>
            {description ? (
              <RDialog.Description className="text-ink-muted mt-0.5 text-xs">
                {description}
              </RDialog.Description>
            ) : null}
          </div>
          <RDialog.Close
            className="text-ink-muted hover:bg-surface-2 hover:text-ink -mt-1 -mr-1.5 cursor-pointer rounded-lg p-1.5 transition-colors"
            aria-label="Close"
          >
            <X className="size-4" />
          </RDialog.Close>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </RDialog.Content>
    </RDialog.Portal>
  );
}

export function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "border-line bg-surface-2/50 flex items-center justify-end gap-2 border-t px-6 py-3.5",
        className,
      )}
      {...props}
    />
  );
}
