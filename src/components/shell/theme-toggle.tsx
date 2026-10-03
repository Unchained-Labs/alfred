"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import * as React from "react";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** Never notifies: the client/server split is fixed for the life of the page. */
const emptySubscribe = () => () => {};

const MODES = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Monitor },
] as const;

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  // next-themes only knows the resolved theme after hydration; rendering the
  // selected state before then would mismatch the server HTML. useSyncExternalStore
  // reports the server/client split directly, with no state to settle afterwards.
  const mounted = React.useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

  return (
    <div
      className="border-line bg-surface-2 inline-flex items-center gap-0.5 rounded-lg border p-0.5"
      role="radiogroup"
      aria-label="Color theme"
    >
      {MODES.map(({ value, label, Icon }) => {
        const active = mounted && theme === value;
        return (
          <Tooltip key={value} content={label}>
            <button
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={label}
              onClick={() => setTheme(value)}
              className={cn(
                "grid size-7 cursor-pointer place-items-center rounded-md transition-colors",
                active
                  ? "bg-surface text-ink shadow-sm"
                  : "text-ink-muted hover:text-ink",
              )}
            >
              <Icon className="size-3.5" />
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}
