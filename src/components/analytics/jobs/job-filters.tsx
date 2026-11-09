"use client";

import { RotateCcw, SlidersHorizontal } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input, Select, Switch } from "@/components/ui/field";
import type { ApplicationStage } from "@/db/schema";
import {
  DEFAULT_FILTERS,
  filtersToParams,
  type JobFilters,
  STAGE_GROUPS,
} from "@/lib/analytics/jobs";
import { DISPLAY_CURRENCIES } from "@/lib/fx/convert";
import { PRIORITY_LABELS, STAGE_META } from "@/lib/stages";
import { cn } from "@/lib/utils";

/*
 * The filter bar. Every change rewrites the URL and the server re-renders the
 * page from it, so a filtered view is a link you can keep or send — and the
 * back button undoes a filter, which is what people expect it to do.
 *
 * The common filters sit in the bar; the rest fold away under "More", because
 * nine rows of chips above the table would push the answer off the screen.
 */

export type Facets = {
  workModes: string[];
  seniorities: string[];
  sources: string[];
  currencies: string[];
  tags: string[];
  priorities: number[];
  stages: ApplicationStage[];
};

const GROUP_OPTIONS = [
  { value: "all", label: "Every stage" },
  { value: "active", label: "Still in play" },
  { value: "applied", label: "Sent" },
  { value: "interviewing", label: "Interviewing" },
  { value: "closed", label: "Closed" },
] satisfies { value: JobFilters["group"]; label: string }[];

function Chips<T extends string | number>({
  label,
  values,
  selected,
  render = (v) => String(v),
  onChange,
}: {
  label: string;
  values: readonly T[];
  selected: readonly T[];
  render?: (v: T) => string;
  onChange: (next: T[]) => void;
}) {
  if (!values.length) return null;
  return (
    <div className="min-w-0">
      <p className="text-ink-muted mb-1.5 text-[11px] font-medium tracking-wide uppercase">
        {label}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {values.map((value) => {
          const on = selected.includes(value);
          return (
            <button
              key={String(value)}
              type="button"
              aria-pressed={on}
              onClick={() =>
                onChange(
                  on ? selected.filter((s) => s !== value) : [...selected, value],
                )
              }
              className={cn(
                "cursor-pointer rounded-full border px-2.5 py-1 text-xs capitalize transition-colors",
                on
                  ? "border-transparent text-white"
                  : "border-line text-ink-2 hover:border-line-strong hover:text-ink",
              )}
              style={on ? { background: "var(--brand)" } : undefined}
            >
              {render(value)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function JobFiltersBar({
  filters,
  facets,
  defaultCurrency,
}: {
  filters: JobFilters;
  facets: Facets;
  defaultCurrency: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = React.useTransition();
  const [open, setOpen] = React.useState(false);

  const apply = (patch: Partial<JobFilters>) => {
    const qs = filtersToParams(
      { ...filters, ...patch },
      defaultCurrency,
    ).toString();
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  };

  // Number inputs commit on blur or Enter, not per keystroke: typing "120000"
  // should not run six re-renders of the page for 1, 12, 120…
  const numberInput = (
    key: "minFit" | "minPay",
    placeholder: string,
    ariaLabel: string,
  ) => (
    <Input
      key={`${key}-${filters[key] ?? ""}`}
      type="number"
      inputMode="numeric"
      min={0}
      defaultValue={filters[key] ?? ""}
      placeholder={placeholder}
      aria-label={ariaLabel}
      className="w-full sm:w-32"
      onBlur={(e) => {
        const v = e.currentTarget.value.trim();
        const n = v === "" ? null : Number(v);
        if (n !== filters[key] && (n == null || Number.isFinite(n)))
          apply({ [key]: n });
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
    />
  );

  const extra =
    filters.stages.length +
    filters.workModes.length +
    filters.seniorities.length +
    filters.sources.length +
    filters.currencies.length +
    filters.tags.length +
    filters.priorities.length +
    (filters.from ? 1 : 0) +
    (filters.to ? 1 : 0) +
    (filters.includeArchived ? 1 : 0);

  const group = filters.group;
  const stagesInGroup =
    group === "all"
      ? facets.stages
      : facets.stages.filter((s) =>
          (STAGE_GROUPS[group] as readonly string[]).includes(s),
        );

  const isDefault =
    filtersToParams(
      { ...filters, sort: DEFAULT_FILTERS.sort, dir: DEFAULT_FILTERS.dir },
      defaultCurrency,
    ).toString() === "";

  return (
    <div
      className={cn(
        "border-line bg-surface space-y-4 rounded-2xl border p-4 transition-opacity",
        pending && "opacity-60",
      )}
    >
      <div className="grid grid-cols-2 items-end gap-3 sm:flex sm:flex-wrap">
        <div className="col-span-2 sm:w-44">
          <p className="text-ink-muted mb-1.5 text-[11px] font-medium tracking-wide uppercase">
            Stage
          </p>
          <Select
            ariaLabel="Stage group"
            value={filters.group}
            onValueChange={(v) =>
              apply({ group: v as JobFilters["group"], stages: [] })
            }
            options={GROUP_OPTIONS}
          />
        </div>
        <div>
          <p className="text-ink-muted mb-1.5 text-[11px] font-medium tracking-wide uppercase">
            Min fit
          </p>
          {numberInput("minFit", "0–100", "Minimum fit score")}
        </div>
        <div>
          <p className="text-ink-muted mb-1.5 text-[11px] font-medium tracking-wide uppercase">
            Min pay ({filters.currency})
          </p>
          {numberInput(
            "minPay",
            "e.g. 100000",
            `Minimum pay in ${filters.currency}`,
          )}
        </div>
        <div className="sm:w-28">
          <p className="text-ink-muted mb-1.5 text-[11px] font-medium tracking-wide uppercase">
            Show pay in
          </p>
          <Select
            ariaLabel="Display currency"
            value={filters.currency}
            onValueChange={(v) => apply({ currency: v, minPay: null })}
            options={[
              ...new Set([
                ...DISPLAY_CURRENCIES,
                ...facets.currencies,
                filters.currency,
              ]),
            ].map((c) => ({ value: c, label: c }))}
          />
        </div>
        <div className="col-span-2 sm:w-56">
          <p className="text-ink-muted mb-1.5 text-[11px] font-medium tracking-wide uppercase">
            Combined score: pay {filters.payWeight}% · fit {100 - filters.payWeight}
            %
          </p>
          <input
            type="range"
            min={0}
            max={100}
            step={10}
            defaultValue={filters.payWeight}
            key={filters.payWeight}
            aria-label="Weight of pay in the combined score"
            className="h-9.5 w-full cursor-pointer"
            style={{ accentColor: "var(--brand)" }}
            onPointerUp={(e) => apply({ payWeight: Number(e.currentTarget.value) })}
            onKeyUp={(e) => apply({ payWeight: Number(e.currentTarget.value) })}
          />
        </div>
        <div className="col-span-2 flex gap-2 sm:ml-auto">
          <Button
            size="sm"
            variant={open || extra ? "secondary" : "ghost"}
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
          >
            <SlidersHorizontal className="size-3.5" />
            More{extra ? ` · ${extra}` : ""}
          </Button>
          {!isDefault ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                apply({
                  ...DEFAULT_FILTERS,
                  currency: defaultCurrency,
                  sort: filters.sort,
                  dir: filters.dir,
                })
              }
            >
              <RotateCcw className="size-3.5" />
              Reset
            </Button>
          ) : null}
        </div>
      </div>

      {open ? (
        <div className="border-line grid gap-4 border-t pt-4 md:grid-cols-2">
          <Chips
            label="Stages"
            values={stagesInGroup}
            selected={filters.stages}
            render={(s) => STAGE_META[s].label}
            onChange={(stages) => apply({ stages })}
          />
          <Chips
            label="Work mode"
            values={facets.workModes}
            selected={filters.workModes}
            onChange={(workModes) => apply({ workModes })}
          />
          <Chips
            label="Seniority"
            values={facets.seniorities}
            selected={filters.seniorities}
            onChange={(seniorities) => apply({ seniorities })}
          />
          <Chips
            label="Source"
            values={facets.sources}
            selected={filters.sources}
            onChange={(sources) => apply({ sources })}
          />
          <Chips
            label="Posted in"
            values={facets.currencies}
            selected={filters.currencies}
            onChange={(currencies) => apply({ currencies })}
          />
          <Chips
            label="Priority"
            values={facets.priorities}
            selected={filters.priorities}
            render={(p) => PRIORITY_LABELS[p] ?? String(p)}
            onChange={(priorities) => apply({ priorities })}
          />
          <div className="md:col-span-2">
            <Chips
              label="Tags (any)"
              values={facets.tags}
              selected={filters.tags}
              onChange={(tags) => apply({ tags })}
            />
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <p className="text-ink-muted mb-1.5 text-[11px] font-medium tracking-wide uppercase">
                Applied or added from
              </p>
              <Input
                type="date"
                defaultValue={filters.from ?? ""}
                key={`from-${filters.from}`}
                aria-label="From date"
                onChange={(e) => apply({ from: e.currentTarget.value || null })}
              />
            </div>
            <div>
              <p className="text-ink-muted mb-1.5 text-[11px] font-medium tracking-wide uppercase">
                To
              </p>
              <Input
                type="date"
                defaultValue={filters.to ?? ""}
                key={`to-${filters.to}`}
                aria-label="To date"
                onChange={(e) => apply({ to: e.currentTarget.value || null })}
              />
            </div>
          </div>
          <div className="self-end">
            <Switch
              label="Include archived"
              checked={filters.includeArchived}
              onCheckedChange={(includeArchived) => apply({ includeArchived })}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
