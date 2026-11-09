import Link from "next/link";
import * as React from "react";
import { cn } from "@/lib/utils";

/*
 * Outcomes | Jobs. Two routes rather than one page with client tabs, so each
 * view has its own URL — the Jobs view keeps its filters in the query string,
 * and a link to it should open exactly that view.
 */
const TABS = [
  { href: "/analytics", label: "Outcomes", id: "outcomes" },
  { href: "/analytics/jobs", label: "Jobs", id: "jobs" },
] as const;

export function AnalyticsTabs({
  current,
}: {
  current: (typeof TABS)[number]["id"];
}) {
  return (
    <nav
      aria-label="Analytics views"
      className="border-line bg-surface-2 inline-flex items-center gap-1 rounded-xl border p-1"
    >
      {TABS.map((tab) => (
        <Link
          key={tab.id}
          href={tab.href}
          aria-current={tab.id === current ? "page" : undefined}
          className={cn(
            "inline-flex items-center rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
            tab.id === current
              ? "bg-surface text-ink shadow-sm"
              : "text-ink-muted hover:text-ink",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
