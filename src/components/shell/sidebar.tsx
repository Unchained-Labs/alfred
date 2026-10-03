"use client";

import { motion } from "framer-motion";
import {
  Inbox,
  KanbanSquare,
  LayoutDashboard,
  Settings,
  Target,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import { Logo } from "@/components/shell/logo";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Dashboard", Icon: LayoutDashboard },
  { href: "/pipeline", label: "Pipeline", Icon: KanbanSquare },
  { href: "/prep", label: "Prep", Icon: Target },
  { href: "/inbox", label: "Inbox", Icon: Inbox },
  { href: "/settings", label: "Settings", Icon: Settings },
] as const;

export type NavBadges = Partial<Record<(typeof NAV)[number]["href"], number>>;

export function Sidebar({ badges }: { badges?: NavBadges }) {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-line bg-surface/60 backdrop-blur-xl lg:flex">
      <div className="flex items-center gap-2.5 px-4 py-4">
        <Logo />
        <div className="min-w-0">
          <p className="text-sm font-semibold tracking-tight text-ink">Alfred</p>
          <p className="truncate text-[11px] text-ink-muted">Job-hunt butler</p>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 px-2.5 py-2">
        {NAV.map(({ href, label, Icon }) => {
          const active = isActive(href);
          const badge = badges?.[href];
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors",
                active
                  ? "font-medium text-ink"
                  : "text-ink-2 hover:bg-surface-2 hover:text-ink",
              )}
            >
              {active ? (
                <motion.span
                  layoutId="nav-active"
                  className="absolute inset-0 rounded-lg border"
                  style={{
                    background: "var(--brand-wash)",
                    borderColor:
                      "color-mix(in oklab, var(--brand) 28%, transparent)",
                  }}
                  transition={{ type: "spring", stiffness: 480, damping: 38 }}
                />
              ) : null}
              <Icon
                className="relative size-4 shrink-0"
                style={active ? { color: "var(--brand)" } : undefined}
              />
              <span className="relative flex-1">{label}</span>
              {badge ? (
                <span
                  className="relative tnum rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                  style={{
                    background: "color-mix(in oklab, var(--brand) 20%, transparent)",
                    color: "var(--brand)",
                  }}
                >
                  {badge > 99 ? "99+" : badge}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-line p-3">
        <ThemeToggle />
      </div>
    </aside>
  );
}

/** Bottom tab bar — the sidebar's role on small screens. */
export function MobileNav({ badges }: { badges?: NavBadges }) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-surface/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
      {NAV.map(({ href, label, Icon }) => {
        const active = isActive(href);
        const badge = badges?.[href];
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className="relative flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium"
            style={{ color: active ? "var(--brand)" : "var(--ink-muted)" }}
          >
            <Icon className="size-4.5" />
            {label}
            {badge ? (
              <span
                className="absolute top-1.5 right-[calc(50%-1.25rem)] size-1.5 rounded-full"
                style={{ background: "var(--brand)" }}
              />
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
