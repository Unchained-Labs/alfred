"use client";

import {
  Building2,
  Compass,
  ExternalLink,
  Plus,
  RefreshCw,
  Search as SearchIcon,
  Trash2,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import type { JobBoard, JobHit, JobSearch, JobSourceKind } from "@/db/schema";
import { useNow } from "@/lib/use-now";
import { relativeDay } from "@/lib/utils";

const SOURCE_LABELS: Record<JobSourceKind, string> = {
  boards: "Watched boards",
  remotive: "Remotive (remote)",
  arbeitnow: "Arbeitnow (Europe)",
};

type RunReport = {
  added: number;
  errors: string[];
  searches: {
    label: string;
    found: number;
    added: number;
    sources: { label: string; count: number; error?: string }[];
  }[];
};

/**
 * Discovery: standing searches, the boards they read, and what they turned up.
 *
 * Laid out in ordinary document flow with no fixed heights anywhere, so a long
 * list of hits or a wrapped form can never squeeze anything — the page scrolls
 * and the cards keep their shape.
 */
export function DiscoverView({
  hits,
  searches,
  boards,
}: {
  hits: JobHit[];
  searches: JobSearch[];
  boards: JobBoard[];
}) {
  const router = useRouter();
  const toast = useToast();
  const now = useNow();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [report, setReport] = React.useState<RunReport | null>(null);
  const [acted, setActed] = React.useState<Set<string>>(new Set());

  const lastRun = searches
    .map((s) => s.lastRunAt?.getTime())
    .filter((t): t is number => Boolean(t))
    .sort((a, b) => b - a)[0];

  async function call(
    key: string,
    url: string,
    init: RequestInit,
    onDone?: (data: Record<string, unknown>) => void,
  ) {
    setBusy(key);
    try {
      const response = await fetch(url, {
        headers: { "content-type": "application/json" },
        ...init,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "That did not work.");
      onDone?.(data);
      router.refresh();
      return data;
    } catch (error) {
      toast.error("Failed", error instanceof Error ? error.message : String(error));
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function runScan(searchId?: string) {
    setReport(null);
    const data = await call(
      searchId ? `run:${searchId}` : "run",
      "/api/discovery/run",
      { method: "POST", body: JSON.stringify(searchId ? { searchId } : {}) },
    );
    if (!data) return;
    const next = data.report as RunReport;
    setReport(next);
    toast.success(
      next.added
        ? `${next.added} new posting${next.added === 1 ? "" : "s"}`
        : "Nothing new",
      next.errors.length
        ? `${next.errors.length} source had trouble`
        : "Scan finished",
    );
  }

  const visibleHits = hits.filter((hit) => !acted.has(hit.id));

  return (
    <div className="space-y-4">
      {/* Run bar */}
      <Card>
        <CardBody className="flex flex-wrap items-center justify-between gap-3 pt-5">
          <div className="min-w-0">
            <p className="text-ink text-sm font-medium">
              {searches.length
                ? `${searches.filter((s) => s.active).length} active search${
                    searches.filter((s) => s.active).length === 1 ? "" : "es"
                  }`
                : "No searches yet"}
            </p>
            <p className="text-ink-muted mt-0.5 text-xs">
              {lastRun && now
                ? `Last scan ${relativeDay(new Date(lastRun))}. Alfred scans again once a search is 20 hours stale.`
                : "Alfred scans once a day, and you can run one now."}
            </p>
          </div>
          <Button
            variant="primary"
            onClick={() => runScan()}
            loading={busy === "run"}
            disabled={busy !== null || !searches.some((s) => s.active)}
          >
            <RefreshCw className="size-3.5" />
            Scan now
          </Button>
        </CardBody>
      </Card>

      {report ? (
        <Card>
          <CardHeader>
            <CardTitle>Last scan</CardTitle>
          </CardHeader>
          <CardBody className="space-y-2 pt-0">
            {report.searches.map((s) => (
              <div key={s.label} className="text-xs">
                <p className="text-ink font-medium">
                  {s.label} — {s.added} new of {s.found} matching
                </p>
                <p className="text-ink-muted mt-0.5 text-[11px]">
                  {s.sources
                    .map((src) =>
                      src.error
                        ? `${src.label}: ${src.error}`
                        : `${src.label}: ${src.count}`,
                    )
                    .join(" · ")}
                </p>
              </div>
            ))}
            {report.errors.length ? (
              <p className="text-[11px]" style={{ color: "var(--warning)" }}>
                {report.errors.join(" · ")}
              </p>
            ) : null}
          </CardBody>
        </Card>
      ) : null}

      {/* Hits */}
      <Card className="overflow-hidden">
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-2">
              <Compass className="size-4" style={{ color: "var(--brand)" }} />
              New postings
            </CardTitle>
            <p className="text-ink-muted mt-0.5 text-xs">
              Track one and it becomes an application at wishlist stage
            </p>
          </div>
          {visibleHits.length ? (
            <Badge tint="var(--brand-accent)">{visibleHits.length}</Badge>
          ) : null}
        </CardHeader>

        {!visibleHits.length ? (
          <EmptyState
            icon={Compass}
            title={searches.length ? "Nothing new" : "No searches yet"}
            description={
              searches.length
                ? "The next scan will add anything that appears. Nothing here means nothing matched, which is also information."
                : "Create a search below — a job title, optionally a place — and pick where Alfred should look."
            }
            compact
          />
        ) : (
          <ul className="border-line divide-y divide-[var(--border)] border-t">
            {visibleHits.map((hit) => (
              <li key={hit.id} className="px-5 py-3.5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <a
                        href={hit.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="text-ink text-xs font-semibold hover:underline"
                      >
                        {hit.title}
                      </a>
                      <ExternalLink className="text-ink-muted size-3 shrink-0" />
                    </div>
                    <p className="text-ink-muted mt-0.5 truncate text-[11px]">
                      {hit.company}
                      {hit.location ? ` · ${hit.location}` : ""}
                      {hit.salaryText ? ` · ${hit.salaryText}` : ""}
                      {hit.postedAt ? ` · ${relativeDay(hit.postedAt)}` : ""}
                    </p>
                    {hit.snippet ? (
                      <p className="text-ink-2 mt-1.5 line-clamp-2 text-[11px] leading-relaxed">
                        {hit.snippet}
                      </p>
                    ) : null}
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <Badge>{hit.source.split(":")[0]}</Badge>
                      {hit.remote ? <Badge tint="var(--good)">remote</Badge> : null}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      size="sm"
                      variant="primary"
                      loading={busy === `save:${hit.id}`}
                      disabled={busy !== null}
                      onClick={() =>
                        call(
                          `save:${hit.id}`,
                          `/api/discovery/hits/${hit.id}`,
                          { method: "PATCH", body: JSON.stringify({ save: true }) },
                          () => {
                            setActed((prev) => new Set(prev).add(hit.id));
                            toast.success(
                              "Tracking it",
                              `${hit.company} · ${hit.title}`,
                            );
                          },
                        )
                      }
                    >
                      <Plus className="size-3.5" />
                      Track
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Dismiss ${hit.title}`}
                      loading={busy === `skip:${hit.id}`}
                      disabled={busy !== null}
                      onClick={() =>
                        call(
                          `skip:${hit.id}`,
                          `/api/discovery/hits/${hit.id}`,
                          {
                            method: "PATCH",
                            body: JSON.stringify({ status: "dismissed" }),
                          },
                          () => setActed((prev) => new Set(prev).add(hit.id)),
                        )
                      }
                    >
                      <X className="size-3.5" />
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <SearchesCard
          searches={searches}
          busy={busy}
          onCall={call}
          onRun={runScan}
          hasBoards={boards.length > 0}
        />
        <BoardsCard boards={boards} busy={busy} onCall={call} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

type CallFn = (
  key: string,
  url: string,
  init: RequestInit,
  onDone?: (data: Record<string, unknown>) => void,
) => Promise<Record<string, unknown> | null>;

function SearchesCard({
  searches,
  busy,
  onCall,
  onRun,
  hasBoards,
}: {
  searches: JobSearch[];
  busy: string | null;
  onCall: CallFn;
  onRun: (id?: string) => void;
  hasBoards: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [titleQuery, setTitleQuery] = React.useState("");
  const [location, setLocation] = React.useState("");
  const [remoteOnly, setRemoteOnly] = React.useState(false);
  const [minSalary, setMinSalary] = React.useState("");
  const [sources, setSources] = React.useState<JobSourceKind[]>(["boards"]);

  const toggle = (kind: JobSourceKind) =>
    setSources((prev) =>
      prev.includes(kind) ? prev.filter((k) => k !== kind) : [...prev, kind],
    );

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2">
            <SearchIcon className="size-4" style={{ color: "var(--brand)" }} />
            Searches
          </CardTitle>
          <p className="text-ink-muted mt-0.5 text-xs">
            Commas are alternatives: “backend engineer, platform engineer”
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={() => setOpen((v) => !v)}>
          <Plus className="size-3.5" />
          New
        </Button>
      </CardHeader>

      {open ? (
        <CardBody className="space-y-3 pt-0">
          <div>
            <Label htmlFor="d-title">Job titles</Label>
            <Input
              id="d-title"
              value={titleQuery}
              onChange={(e) => setTitleQuery(e.target.value)}
              placeholder="senior backend engineer, staff engineer"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="d-loc">Location</Label>
              <Input
                id="d-loc"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="London"
                disabled={remoteOnly}
              />
            </div>
            <div>
              <Label htmlFor="d-sal">Minimum salary</Label>
              <Input
                id="d-sal"
                value={minSalary}
                onChange={(e) => setMinSalary(e.target.value)}
                placeholder="90000"
                inputMode="numeric"
              />
            </div>
          </div>
          <label className="text-ink-2 inline-flex cursor-pointer items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={remoteOnly}
              onChange={(e) => setRemoteOnly(e.target.checked)}
              className="size-3.5 cursor-pointer accent-[var(--brand)]"
            />
            Remote only — ignores the location filter
          </label>

          <div>
            <Label>Where to look</Label>
            <div className="mt-1 flex flex-wrap gap-2">
              {(Object.keys(SOURCE_LABELS) as JobSourceKind[]).map((kind) => (
                <label
                  key={kind}
                  className="border-line bg-surface-2 text-ink-2 inline-flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[11px]"
                >
                  <input
                    type="checkbox"
                    checked={sources.includes(kind)}
                    onChange={() => toggle(kind)}
                    className="size-3.5 cursor-pointer accent-[var(--brand)]"
                  />
                  {SOURCE_LABELS[kind]}
                </label>
              ))}
            </div>
            {sources.includes("boards") && !hasBoards ? (
              <p className="mt-1.5 text-[11px]" style={{ color: "var(--warning)" }}>
                You are not watching any boards yet — add one opposite, or this
                source will find nothing.
              </p>
            ) : null}
          </div>

          <Button
            variant="primary"
            size="sm"
            loading={busy === "new-search"}
            disabled={!titleQuery.trim() || !sources.length || busy !== null}
            onClick={() =>
              onCall(
                "new-search",
                "/api/discovery/searches",
                {
                  method: "POST",
                  body: JSON.stringify({
                    titleQuery,
                    location: remoteOnly ? "" : location,
                    remoteOnly,
                    minSalary,
                    sources,
                  }),
                },
                () => {
                  setOpen(false);
                  setTitleQuery("");
                  setLocation("");
                  setMinSalary("");
                },
              )
            }
          >
            Create search
          </Button>
        </CardBody>
      ) : null}

      {searches.length ? (
        <ul className="border-line divide-y divide-[var(--border)] border-t">
          {searches.map((search) => (
            <li
              key={search.id}
              className="flex flex-wrap items-center gap-2 px-5 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="text-ink truncate text-xs font-medium">
                  {search.label}
                </p>
                <p className="text-ink-muted truncate text-[11px]">
                  {search.remoteOnly
                    ? "remote only"
                    : search.location || "anywhere"}
                  {search.minSalary
                    ? ` · ${search.minSalary.toLocaleString()}+`
                    : ""}
                  {" · "}
                  {(search.sources ?? []).map((s) => s).join(", ") || "no sources"}
                  {search.lastRunAt
                    ? ` · last ${search.lastNewCount} new`
                    : " · never run"}
                </p>
              </div>
              {!search.active ? <Badge>paused</Badge> : null}
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Run ${search.label}`}
                loading={busy === `run:${search.id}`}
                disabled={busy !== null}
                onClick={() => onRun(search.id)}
              >
                <RefreshCw className="size-3.5" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy !== null}
                onClick={() =>
                  onCall(
                    `toggle:${search.id}`,
                    `/api/discovery/searches/${search.id}`,
                    {
                      method: "PATCH",
                      body: JSON.stringify({ active: !search.active }),
                    },
                  )
                }
              >
                {search.active ? "Pause" : "Resume"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Delete ${search.label}`}
                disabled={busy !== null}
                onClick={() =>
                  onCall(
                    `del:${search.id}`,
                    `/api/discovery/searches/${search.id}`,
                    {
                      method: "DELETE",
                    },
                  )
                }
              >
                <Trash2 className="size-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}

function BoardsCard({
  boards,
  busy,
  onCall,
}: {
  boards: JobBoard[];
  busy: string | null;
  onCall: CallFn;
}) {
  const [provider, setProvider] = React.useState("greenhouse");
  const [slug, setSlug] = React.useState("");

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="size-4" style={{ color: "var(--brand)" }} />
            Watched boards
          </CardTitle>
          <p className="text-ink-muted mt-0.5 text-xs">
            An employer’s own listings — the primary record, not an aggregator’s
            copy
          </p>
        </div>
      </CardHeader>

      <CardBody className="space-y-2 pt-0">
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-28">
            <Label>Provider</Label>
            <Select
              value={provider}
              onValueChange={setProvider}
              ariaLabel="Board provider"
              options={[
                { value: "greenhouse", label: "Greenhouse" },
                { value: "ashby", label: "Ashby" },
              ]}
            />
          </div>
          <div className="min-w-36 flex-1">
            <Label htmlFor="b-slug">Board name</Label>
            <Input
              id="b-slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="monzo"
            />
          </div>
          <Button
            size="sm"
            variant="secondary"
            loading={busy === "new-board"}
            disabled={!slug.trim() || busy !== null}
            onClick={() =>
              onCall(
                "new-board",
                "/api/discovery/boards",
                { method: "POST", body: JSON.stringify({ provider, slug }) },
                () => setSlug(""),
              )
            }
          >
            Watch
          </Button>
        </div>
        <p className="text-ink-muted text-[11px]">
          The identifier from the board’s own URL — the{" "}
          <code className="bg-surface-3 rounded px-1">monzo</code> in
          job-boards.greenhouse.io/monzo. Alfred checks it answers before saving.
        </p>
      </CardBody>

      {boards.length ? (
        <ul className="border-line divide-y divide-[var(--border)] border-t">
          {boards.map((board) => (
            <li key={board.id} className="flex items-center gap-2 px-5 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-ink truncate text-xs font-medium">
                  {board.label}
                </p>
                <p className="text-ink-muted truncate text-[11px]">
                  {board.provider} · {board.slug}
                  {board.lastError ? ` · ${board.lastError}` : ""}
                </p>
              </div>
              {board.lastError ? (
                <Badge tint="var(--critical)">failing</Badge>
              ) : null}
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Stop watching ${board.label}`}
                disabled={busy !== null}
                onClick={() =>
                  onCall(`delb:${board.id}`, `/api/discovery/boards/${board.id}`, {
                    method: "DELETE",
                  })
                }
              >
                <Trash2 className="size-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <CardBody className="pt-0">
          <p className="text-ink-muted text-[11px]">
            Nothing watched yet. The companies already in your pipeline are a good
            start.
          </p>
        </CardBody>
      )}
    </Card>
  );
}
