"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight, Target } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";

export type CalendarRow = {
  id: string;
  kind: "interview" | "prep" | "history";
  day: string;
  at: string;
  title: string;
  detail: string | null;
  company: string | null;
  applicationId: string | null;
  done?: boolean;
};

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const MONTH = (y: number, m: number) =>
  new Date(y, m, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });

/**
 * A month of the job hunt: interviews, prep deadlines, and what already
 * happened, on one axis.
 *
 * Weeks start on Monday. An interview on a Friday belongs to the working week
 * you are preparing during, and a Sunday-first grid puts it in the middle.
 */
export function MonthGrid({
  rows,
  year,
  month,
  today,
}: {
  rows: CalendarRow[];
  year: number;
  month: number;
  today: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [selected, setSelected] = React.useState<string | null>(null);

  const byDay = React.useMemo(() => {
    const map = new Map<string, CalendarRow[]>();
    for (const r of rows) {
      const list = map.get(r.day);
      if (list) list.push(r);
      else map.set(r.day, [r]);
    }
    return map;
  }, [rows]);

  // Monday-anchored offset: JS getDay() is Sunday-first.
  const first = new Date(year, month, 1);
  const lead = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1)),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const key = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const go = (delta: number) => {
    const d = new Date(year, month + delta, 1);
    const next = new URLSearchParams(params.toString());
    next.set("y", String(d.getFullYear()));
    next.set("m", String(d.getMonth()));
    router.push(`/calendar?${next.toString()}`);
  };

  const selectedRows = selected ? (byDay.get(selected) ?? []) : [];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-ink text-base font-semibold tracking-tight">
          {MONTH(year, month)}
        </h2>
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            aria-label="Previous month"
            onClick={() => go(-1)}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              const n = new Date();
              router.push(`/calendar?y=${n.getFullYear()}&m=${n.getMonth()}`);
            }}
          >
            Today
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-label="Next month"
            onClick={() => go(1)}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      <div className="text-ink-muted grid grid-cols-7 gap-1 text-[11px]">
        {DOW.map((d) => (
          <div key={d} className="px-1 py-0.5">
            {d}
          </div>
        ))}
      </div>

      {/* The grid scrolls inside itself; the page never grows past the screen. */}
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="grid auto-rows-fr grid-cols-7 gap-1">
          {cells.map((d, i) => {
            if (!d)
              return (
                <div key={`pad-${i}`} className="min-h-20 rounded-lg opacity-0" />
              );
            const k = key(d);
            const items = byDay.get(k) ?? [];
            const isToday = k === today;
            const isSel = k === selected;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setSelected(isSel ? null : k)}
                aria-label={`${d.getDate()} — ${items.length} item(s)`}
                aria-pressed={isSel}
                className="border-line hover:bg-surface-2 min-h-20 rounded-lg border p-1.5 text-left transition-colors"
                style={
                  isSel
                    ? {
                        borderColor: "var(--brand)",
                        background:
                          "color-mix(in oklab, var(--brand) 8%, transparent)",
                      }
                    : isToday
                      ? {
                          borderColor:
                            "color-mix(in oklab, var(--brand) 45%, transparent)",
                        }
                      : undefined
                }
              >
                <span
                  className={`text-[11px] ${isToday ? "text-ink font-semibold" : "text-ink-muted"}`}
                >
                  {d.getDate()}
                </span>
                <div className="mt-1 space-y-0.5">
                  {items.slice(0, 3).map((r) => (
                    <div
                      key={r.id}
                      className="truncate rounded px-1 py-0.5 text-[10px] leading-tight"
                      style={
                        r.kind === "interview"
                          ? {
                              background:
                                "color-mix(in oklab, var(--brand) 22%, transparent)",
                              color: "var(--ink)",
                            }
                          : r.kind === "prep"
                            ? {
                                background:
                                  "color-mix(in oklab, var(--warn, #d08700) 18%, transparent)",
                                color: "var(--ink-2)",
                                textDecoration: r.done ? "line-through" : undefined,
                                opacity: r.done ? 0.55 : 1,
                              }
                            : { color: "var(--ink-muted)" }
                      }
                      title={`${r.company ? r.company + " · " : ""}${r.title}`}
                    >
                      {r.kind === "interview" ? `${timeOf(r.at)} ` : ""}
                      {r.company ? `${r.company} · ` : ""}
                      {r.title}
                    </div>
                  ))}
                  {items.length > 3 ? (
                    <div className="text-ink-muted px-1 text-[10px]">
                      +{items.length - 3} more
                    </div>
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {selected ? (
        <Card>
          <CardBody className="space-y-2">
            <p className="text-ink text-sm font-semibold">
              {new Date(selected + "T00:00:00").toLocaleDateString(undefined, {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </p>
            {selectedRows.length === 0 ? (
              <p className="text-ink-muted text-xs">Nothing on this day.</p>
            ) : (
              <ul className="space-y-1.5">
                {selectedRows.map((r) => (
                  <li key={r.id} className="flex items-start gap-2 text-xs">
                    {r.kind === "interview" ? (
                      <CalendarDays className="text-ink-muted mt-0.5 size-3.5 shrink-0" />
                    ) : (
                      <Target className="text-ink-muted mt-0.5 size-3.5 shrink-0" />
                    )}
                    <span className="min-w-0">
                      {r.applicationId ? (
                        <Link
                          href={`/pipeline/${r.applicationId}`}
                          className="text-ink underline-offset-2 hover:underline"
                        >
                          {r.title}
                        </Link>
                      ) : (
                        <span className="text-ink">{r.title}</span>
                      )}
                      <span className="text-ink-muted">
                        {r.company ? ` · ${r.company}` : ""}
                        {r.kind === "interview" ? ` · ${timeOf(r.at)}` : ""}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
