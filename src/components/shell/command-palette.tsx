"use client";

import { Dialog as RDialog } from "radix-ui";
import {
  Inbox,
  KanbanSquare,
  LayoutDashboard,
  Plus,
  Search,
  Settings,
  Target,
} from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import type { Application } from "@/db/schema";
import { STAGE_META } from "@/lib/stages";
import { cn, initials } from "@/lib/utils";

type Item = {
  id: string;
  label: string;
  sublabel?: string;
  group: string;
  Icon?: typeof Search;
  stage?: Application["stage"];
  run: () => void;
};

export function CommandPalette({
  open,
  onOpenChange,
  onNewApplication,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNewApplication: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [apps, setApps] = React.useState<Application[]>([]);
  const [rawCursor, setCursor] = React.useState(0);
  const listRef = React.useRef<HTMLDivElement>(null);

  // Clear the previous search on the opening transition, during render so the
  // palette never flashes the last query.
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setQuery("");
      setCursor(0);
    }
  }

  // Load the pipeline lazily — the palette is the only consumer and it is
  // cheap enough to refetch each time it opens, which keeps it current.
  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch("/api/applications")
      .then((response) => (response.ok ? response.json() : { applications: [] }))
      .then((data) => {
        if (!cancelled) setApps(data.applications ?? []);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [open]);

  const items = React.useMemo<Item[]>(() => {
    const go = (href: string) => () => {
      onOpenChange(false);
      router.push(href);
    };

    const actions: Item[] = [
      {
        id: "new",
        label: "Add an application",
        group: "Actions",
        Icon: Plus,
        run: () => {
          onOpenChange(false);
          onNewApplication();
        },
      },
      {
        id: "nav-dash",
        label: "Dashboard",
        group: "Go to",
        Icon: LayoutDashboard,
        run: go("/"),
      },
      {
        id: "nav-pipe",
        label: "Pipeline",
        group: "Go to",
        Icon: KanbanSquare,
        run: go("/pipeline"),
      },
      {
        id: "nav-prep",
        label: "Prep",
        group: "Go to",
        Icon: Target,
        run: go("/prep"),
      },
      {
        id: "nav-inbox",
        label: "Inbox",
        group: "Go to",
        Icon: Inbox,
        run: go("/inbox"),
      },
      {
        id: "nav-set",
        label: "Settings",
        group: "Go to",
        Icon: Settings,
        run: go("/settings"),
      },
    ];

    const applications: Item[] = apps.map((app) => ({
      id: app.id,
      label: `${app.title}`,
      sublabel: app.company,
      group: "Applications",
      stage: app.stage,
      run: go(`/pipeline/${app.id}`),
    }));

    const needle = query.trim().toLowerCase();
    const all = [...actions, ...applications];
    if (!needle) return all;

    return all.filter((item) =>
      `${item.label} ${item.sublabel ?? ""} ${item.group}`
        .toLowerCase()
        .includes(needle),
    );
  }, [apps, query, router, onOpenChange, onNewApplication]);

  // Derive the visible selection rather than correcting state after the list
  // narrows — the highlight is then always inside the rendered list.
  const cursor = Math.min(rawCursor, Math.max(0, items.length - 1));

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setCursor((current) => (current + 1) % Math.max(1, items.length));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setCursor(
        (current) => (current - 1 + items.length) % Math.max(1, items.length),
      );
    } else if (event.key === "Enter") {
      event.preventDefault();
      items[cursor]?.run();
    }
  };

  // Scroll the highlighted row into view when arrowing past the fold.
  React.useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${cursor}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  let lastGroup = "";

  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm" />
        <RDialog.Content
          onKeyDown={onKeyDown}
          className="border-line bg-surface fixed top-[12vh] left-1/2 z-50 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-2xl border shadow-[var(--shadow-pop)] focus:outline-none"
        >
          <RDialog.Title className="sr-only">Command palette</RDialog.Title>
          <div className="border-line flex items-center gap-2.5 border-b px-4">
            <Search className="text-ink-muted size-4 shrink-0" />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search applications or jump to a page…"
              aria-label="Search"
              className="text-ink placeholder:text-ink-muted h-12 w-full bg-transparent text-sm focus:outline-none"
            />
            <kbd className="border-line bg-surface-2 text-ink-muted hidden rounded border px-1.5 py-0.5 text-[10px] sm:block">
              esc
            </kbd>
          </div>

          <div ref={listRef} className="max-h-80 overflow-y-auto p-1.5">
            {items.length === 0 ? (
              <p className="text-ink-muted px-3 py-8 text-center text-xs">
                Nothing matches “{query}”.
              </p>
            ) : (
              items.map((item, index) => {
                const showGroup = item.group !== lastGroup;
                lastGroup = item.group;
                const active = index === cursor;
                const stage = item.stage ? STAGE_META[item.stage] : null;

                return (
                  <React.Fragment key={item.id}>
                    {showGroup ? (
                      <p className="label-eyebrow px-2.5 pt-2.5 pb-1">
                        {item.group}
                      </p>
                    ) : null}
                    <button
                      type="button"
                      data-index={index}
                      onMouseMove={() => setCursor(index)}
                      onClick={item.run}
                      className={cn(
                        "flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
                        active ? "bg-surface-2 text-ink" : "text-ink-2",
                      )}
                    >
                      {item.Icon ? (
                        <item.Icon className="text-ink-muted size-4 shrink-0" />
                      ) : (
                        <span className="bg-surface-3 text-ink-2 grid size-5 shrink-0 place-items-center rounded text-[9px] font-semibold">
                          {initials(item.sublabel ?? item.label)}
                        </span>
                      )}
                      <span className="min-w-0 flex-1 truncate">
                        {item.label}
                        {item.sublabel ? (
                          <span className="text-ink-muted"> · {item.sublabel}</span>
                        ) : null}
                      </span>
                      {stage ? (
                        <Badge tint={`var(${stage.token})`}>{stage.label}</Badge>
                      ) : null}
                    </button>
                  </React.Fragment>
                );
              })
            )}
          </div>
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}

/** Registers ⌘K / Ctrl+K and returns the palette's open state. */
export function useCommandPalette() {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((current) => !current);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return { open, setOpen };
}
