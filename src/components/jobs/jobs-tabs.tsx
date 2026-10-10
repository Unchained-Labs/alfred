"use client";

import { Compass, Table2 } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * The two halves of "jobs": the ones you have, and the ones out there.
 *
 * Two views of one idea rather than two nav items — an eighth entry would not
 * fit the phone's bottom bar, where seven equal columns already leave about
 * 50px each. Real routes rather than client-side state, so each view can be
 * linked and bookmarked.
 */
export function JobsTabs({ newCount }: { newCount: number }) {
  const pathname = usePathname();
  const tabs = [
    { href: "/jobs", label: "Tracked", Icon: Table2 },
    { href: "/jobs/discover", label: "Discover", Icon: Compass, badge: newCount },
  ];

  return (
    <div className="border-line bg-surface-2 mb-4 inline-flex items-center gap-0.5 rounded-xl border p-0.5">
      {tabs.map(({ href, label, Icon, badge }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
              active
                ? "bg-surface text-ink shadow-sm"
                : "text-ink-muted hover:text-ink",
            )}
          >
            <Icon className="size-3.5" />
            {label}
            {badge ? (
              <span
                className="tnum ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                style={{
                  background: "var(--brand)",
                  color: "var(--brand-ink)",
                }}
              >
                {badge > 99 ? "99+" : badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}
