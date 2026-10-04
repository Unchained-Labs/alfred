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
import { SignedInAs } from "@/components/shell/signed-in-as";
import type { ShellUser } from "@/components/shell/app-shell";
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

export function Sidebar({ user, badges }: { user: ShellUser; badges?: NavBadges }) {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <aside className="border-line bg-surface/60 sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r backdrop-blur-xl lg:flex">
      <div className="flex items-center gap-2.5 px-4 py-4">
        <Logo />
        <div className="min-w-0">
          <p className="text-ink text-sm font-semibold tracking-tight">Alfred</p>
          <p className="text-ink-muted truncate text-[11px]">Job-hunt butler</p>
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
                  ? "text-ink font-medium"
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
                  className="tnum relative rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                  style={{
                    background:
                      "color-mix(in oklab, var(--brand) 20%, transparent)",
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

      <div className="border-line space-y-2 border-t p-3">
        <SignedInAs user={user} />
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
    <nav className="border-line bg-surface/85 fixed inset-x-0 bottom-0 z-40 flex border-t pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
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
