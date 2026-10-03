"use client";

import { Label as RLabel, Select as RSelect, Switch as RSwitch } from "radix-ui";
import { Check, ChevronDown } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

const CONTROL =
  "w-full rounded-lg border border-line bg-surface-2 px-3 text-sm text-ink transition-colors " +
  "placeholder:text-ink-muted hover:border-line-strong focus:border-brand focus:outline-none " +
  "disabled:cursor-not-allowed disabled:opacity-50";

export function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <RLabel.Root
      className={cn("mb-1.5 block text-xs font-medium text-ink-2", className)}
      {...props}
    />
  );
}

export function Field({
  label,
  hint,
  error,
  className,
  children,
}: {
  label?: string;
  hint?: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      {label ? <Label>{label}</Label> : null}
      {children}
      {error ? (
        <p className="mt-1.5 text-xs" style={{ color: "var(--critical)" }}>
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-ink-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return <input className={cn(CONTROL, "h-9.5", className)} {...props} />;
}

export function Textarea({
  className,
  ...props
}: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(CONTROL, "min-h-24 resize-y py-2.5 leading-relaxed", className)}
      {...props}
    />
  );
}

export type SelectOption = { value: string; label: string; hint?: string };

export function Select({
  value,
  onValueChange,
  options,
  placeholder = "Select…",
  className,
  disabled,
  ariaLabel,
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: readonly SelectOption[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  return (
    <RSelect.Root value={value} onValueChange={onValueChange} disabled={disabled}>
      <RSelect.Trigger
        aria-label={ariaLabel}
        className={cn(
          CONTROL,
          "flex h-9.5 cursor-pointer items-center justify-between gap-2 text-left",
          "data-[placeholder]:text-ink-muted",
          className,
        )}
      >
        <RSelect.Value placeholder={placeholder} />
        <RSelect.Icon>
          <ChevronDown className="size-3.5 shrink-0 text-ink-muted" />
        </RSelect.Icon>
      </RSelect.Trigger>
      <RSelect.Portal>
        <RSelect.Content
          position="popper"
          sideOffset={6}
          className={cn(
            "z-50 max-h-72 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-xl",
            "border border-line bg-surface p-1 shadow-[var(--shadow-pop)]",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0",
          )}
        >
          <RSelect.Viewport>
            {options.map((option) => (
              <RSelect.Item
                key={option.value}
                value={option.value}
                className={cn(
                  "relative flex cursor-pointer select-none items-center gap-2 rounded-lg py-1.5 pr-2 pl-7 text-sm",
                  "text-ink-2 outline-none data-[highlighted]:bg-surface-2 data-[highlighted]:text-ink",
                  "data-[state=checked]:text-ink data-[state=checked]:font-medium",
                )}
              >
                <RSelect.ItemIndicator className="absolute left-2">
                  <Check className="size-3.5" style={{ color: "var(--brand)" }} />
                </RSelect.ItemIndicator>
                <RSelect.ItemText>{option.label}</RSelect.ItemText>
                {option.hint ? (
                  <span className="ml-auto pl-3 text-[11px] text-ink-muted">
                    {option.hint}
                  </span>
                ) : null}
              </RSelect.Item>
            ))}
          </RSelect.Viewport>
        </RSelect.Content>
      </RSelect.Portal>
    </RSelect.Root>
  );
}

export function Switch({
  checked,
  onCheckedChange,
  label,
  hint,
  id,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  hint?: string;
  id?: string;
}) {
  const inputId = id ?? `switch-${label.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <RLabel.Root
          htmlFor={inputId}
          className="block cursor-pointer text-sm font-medium text-ink"
        >
          {label}
        </RLabel.Root>
        {hint ? <p className="mt-0.5 text-xs text-ink-muted">{hint}</p> : null}
      </div>
      <RSwitch.Root
        id={inputId}
        checked={checked}
        onCheckedChange={onCheckedChange}
        className={cn(
          "relative mt-0.5 h-5.5 w-9.5 shrink-0 cursor-pointer rounded-full border border-line transition-colors",
          "data-[state=checked]:border-transparent data-[state=unchecked]:bg-surface-3",
        )}
        style={checked ? { backgroundColor: "var(--brand)" } : undefined}
      >
        <RSwitch.Thumb
          className={cn(
            "block size-4 rounded-full bg-white shadow-sm transition-transform duration-150",
            "translate-x-0.5 data-[state=checked]:translate-x-4.5",
          )}
        />
      </RSwitch.Root>
    </div>
  );
}
