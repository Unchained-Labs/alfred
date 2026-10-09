"use client";

import { Command, Plus, Search } from "lucide-react";
import * as React from "react";
import { ApplicationForm } from "@/components/applications/application-form";
import {
  CommandPalette,
  useCommandPalette,
} from "@/components/shell/command-palette";
import { Logo } from "@/components/shell/logo";
import { MobileNav, type NavBadges, Sidebar } from "@/components/shell/sidebar";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export type ShellUser = { name: string; email: string; role: string };

export function AppShell({
  user,
  badges,
  children,
}: {
  user: ShellUser;
  badges?: NavBadges;
  children: React.ReactNode;
}) {
  const palette = useCommandPalette();
  const [formOpen, setFormOpen] = React.useState(false);

  return (
    <div className="flex min-h-dvh">
      <Sidebar user={user} badges={badges} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-line bg-page/80 sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b px-4 backdrop-blur-xl lg:px-6">
          <div className="flex items-center gap-2 lg:hidden">
            <Logo className="size-7" />
            <span className="text-sm font-semibold tracking-tight">Alfred</span>
          </div>

          <button
            type="button"
            onClick={() => palette.setOpen(true)}
            className="border-line bg-surface-2 text-ink-muted hover:border-line-strong hover:text-ink ml-auto flex h-9 cursor-pointer items-center gap-2 rounded-lg border pr-2 pl-3 text-xs transition-colors lg:ml-0 lg:w-72"
          >
            <Search className="size-3.5 shrink-0" />
            <span className="hidden flex-1 text-left lg:block">
              Search applications…
            </span>
            <kbd className="border-line bg-surface hidden items-center gap-0.5 rounded border px-1.5 py-0.5 text-[10px] lg:flex">
              <Command className="size-2.5" />K
            </kbd>
          </button>

          <div className="ml-auto flex items-center gap-2">
            <div className="lg:hidden">
              <ThemeToggle />
            </div>
            <Button variant="primary" onClick={() => setFormOpen(true)}>
              <Plus className="size-3.5" />
              <span className="hidden sm:inline">Add application</span>
            </Button>
          </div>
        </header>

        <main className="min-w-0 flex-1 pb-20 lg:pb-0">{children}</main>
      </div>

      <MobileNav badges={badges} />

      <CommandPalette
        open={palette.open}
        onOpenChange={palette.setOpen}
        onNewApplication={() => setFormOpen(true)}
      />
      <ApplicationForm open={formOpen} onOpenChange={setFormOpen} />
    </div>
  );
}

/** Standard page header used by every route. */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  /** For pages that manage their own vertical rhythm, e.g. a full-height one. */
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mb-6 flex flex-wrap items-end justify-between gap-3",
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="font-display text-ink text-2xl font-bold tracking-tight">
          {title}
        </h1>
        {description ? (
          <p className="text-ink-muted mt-1 text-sm">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}
