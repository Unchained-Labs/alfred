import { Banknote, Info, Sparkles, Star, Target } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { AnalyticsTabs } from "@/components/analytics/analytics-tabs";
import { JobBreakdown } from "@/components/analytics/jobs/job-breakdown";
import { JobFiltersBar } from "@/components/analytics/jobs/job-filters";
import { JobTable } from "@/components/analytics/jobs/job-table";
import { PayFitScatter } from "@/components/charts/pay-fit-scatter";
import { PayRanking } from "@/components/charts/pay-ranking";
import { StatTile } from "@/components/charts/stat-tile";
import { PageHeader } from "@/components/shell/app-shell";
import {
  Card,
  CardBody,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { APPLICATION_STAGES } from "@/db/schema";
import { requireUserForPage } from "@/lib/auth";
import {
  country,
  facetValues,
  jobBreakdown,
  parseFilters,
  type RankedJob,
  rankJobs,
  summarise,
} from "@/lib/analytics/jobs";
import { jobRows } from "@/lib/analytics/jobs-data";
import { formatMoney } from "@/lib/fx/convert";
import { ratesFor } from "@/lib/fx/store";
import { STAGE_META } from "@/lib/stages";

export const dynamic = "force-dynamic";

type Search = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const DEFAULT_CURRENCY = "USD";

/*
 * Analytics → Jobs: the board as a ranking.
 *
 * Every application, whether it is a wishlist idea or three rounds in, ranked
 * by what it pays (converted to one currency), by how well it fits (the latest
 * analysis), and by a blend of the two whose weighting is on the page rather
 * than hidden in a formula. Filters live in the URL.
 */
export default async function JobAnalyticsPage({ searchParams }: Search) {
  const user = await requireUserForPage();
  const params = await searchParams;
  const filters = parseFilters(params, DEFAULT_CURRENCY);
  const rows = jobRows(user.id);
  const rates = await ratesFor(user.id);
  const ranking = rankJobs(rows, filters, rates);
  const summary = summarise(ranking.jobs);
  const cur = filters.currency;

  const facets = {
    ...facetValues(rows),
    stages: APPLICATION_STAGES.filter((s) => rows.some((r) => r.stage === s)),
  };

  const top = summary.topPick;
  const ratesNote =
    rates.source === "fallback"
      ? "built-in approximate exchange rates (no feed reachable)"
      : `exchange rates of ${rates.date}${rates.source === "cached" ? " (cached; the feed did not answer today)" : ""}`;

  return (
    <div className="mx-auto max-w-7xl p-4 lg:p-6">
      <PageHeader
        title="Analytics"
        description="Every job on your board, ranked by what it pays and how well it fits."
        actions={<AnalyticsTabs current="jobs" />}
      />

      {rows.length === 0 ? (
        <Card>
          <CardBody className="py-14 text-center">
            <p className="text-ink text-sm font-medium">No jobs to rank yet</p>
            <p className="text-ink-muted mx-auto mt-1.5 max-w-sm text-xs leading-relaxed">
              Add applications on the{" "}
              <Link href="/pipeline" className="underline">
                board
              </Link>{" "}
              — with a salary and a fit analysis, each one lands here ranked.
            </p>
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-4">
          <JobFiltersBar
            filters={filters}
            facets={facets}
            defaultCurrency={DEFAULT_CURRENCY}
          />

          {/* Headline */}
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            <StatTile
              label="Jobs in view"
              value={summary.count}
              icon={Target}
              hint={
                ranking.inView !== summary.count
                  ? `${ranking.inView - summary.count} below your floors`
                  : `of ${rows.length} on the board`
              }
            />
            <StatTile
              label={`Median pay (${cur})`}
              value={formatMoney(summary.medianPay, cur)}
              icon={Banknote}
              hint={
                summary.withPay
                  ? `${summary.payCoverage}% have a salary · top ${formatMoney(summary.topPay, cur)}`
                  : "No salaries in view"
              }
            />
            <StatTile
              label="Median fit"
              value={
                summary.medianFit != null ? Math.round(summary.medianFit) : "—"
              }
              unit={summary.medianFit != null ? "/100" : undefined}
              icon={Sparkles}
              hint={`${summary.withFit} of ${summary.count} analysed`}
            />
            <StatTile
              label="Top pick"
              value={top ? top.company : "—"}
              icon={Star}
              hint={
                top
                  ? top.combined != null
                    ? `Score ${top.combined} · ${formatMoney(top.pay, cur)} · fit ${top.fitScore}`
                    : top.pay != null
                      ? `Best paid · ${formatMoney(top.pay, cur)}`
                      : `Best fit · ${top.fitScore}`
                  : "Needs a salary or a fit"
              }
            />
          </div>

          {ranking.noPay || ranking.noFit ? (
            <div
              className="flex items-start gap-2.5 rounded-xl border px-4 py-3"
              style={{
                borderColor: "color-mix(in oklab, var(--warning) 32%, transparent)",
                background: "color-mix(in oklab, var(--warning) 8%, transparent)",
              }}
            >
              <Info
                className="mt-px size-4 shrink-0"
                style={{ color: "var(--warning)" }}
              />
              <p className="text-ink-2 text-xs leading-relaxed">
                {ranking.noPay ? (
                  <>
                    <strong className="text-ink">{ranking.noPay}</strong> without a
                    salary {ranking.noPay === 1 ? "is" : "are"} unranked by pay
                  </>
                ) : null}
                {ranking.noPay && ranking.noFit ? "; " : null}
                {ranking.noFit ? (
                  <>
                    <strong className="text-ink">{ranking.noFit}</strong> without an
                    analysis {ranking.noFit === 1 ? "has" : "have"} no fit score
                  </>
                ) : null}
                . They sort last rather than as zero, and the combined score needs
                both. Pay is compared in {cur} at {ratesNote}, using the middle of
                each range.
              </p>
            </div>
          ) : null}

          {/* Pay vs fit, and the pay ranking */}
          <div className="grid gap-4 lg:grid-cols-5">
            <Card className="lg:col-span-3">
              <CardHeader>
                <div>
                  <CardTitle>Pay against fit</CardTitle>
                  <CardDescription>
                    Top-right is well paid and a good match. Click a point to open
                    it.
                  </CardDescription>
                </div>
              </CardHeader>
              <CardBody>
                <PayFitScatter
                  jobs={ranking.jobs}
                  currency={cur}
                  medianPay={summary.medianPay}
                  medianFit={summary.medianFit}
                />
              </CardBody>
            </Card>
            <Card className="lg:col-span-2">
              <CardHeader>
                <div>
                  <CardTitle>Best paid</CardTitle>
                  <CardDescription>
                    Salary range in {cur}, midpoint marked
                  </CardDescription>
                </div>
              </CardHeader>
              <CardBody>
                <PayRanking jobs={ranking.jobs} currency={cur} />
              </CardBody>
            </Card>
          </div>

          {/* The table */}
          <Card className="overflow-hidden">
            <CardHeader>
              <div>
                <CardTitle>Ranked</CardTitle>
                <CardDescription>
                  Score = {filters.payWeight}% pay percentile +{" "}
                  {100 - filters.payWeight}% fit. Pay percentile is where a
                  job&apos;s pay sits among the jobs in view, so a currency&apos;s
                  size cannot outweigh the fit. Starred: top three.
                </CardDescription>
              </div>
            </CardHeader>
            <div className="border-line border-t">
              <React.Suspense>
                <JobTable
                  jobs={ranking.jobs}
                  currency={cur}
                  sort={filters.sort}
                  dir={filters.dir}
                />
              </React.Suspense>
            </div>
          </Card>

          {/* Breakdowns */}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {(
              [
                ["By stage", (j) => STAGE_META[j.stage].label],
                ["By work mode", (j) => j.workMode],
                ["By seniority", (j) => j.seniority],
                ["By country", (j) => country(j.location)],
              ] satisfies [string, (j: RankedJob) => string | null][]
            ).map(([title, get]) => (
              <Card key={title}>
                <CardHeader>
                  <div>
                    <CardTitle>{title}</CardTitle>
                    <CardDescription>
                      Jobs · median pay · median fit
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardBody>
                  <JobBreakdown
                    rows={jobBreakdown(ranking.jobs, get)}
                    currency={cur}
                    emptyLabel="Nothing in view"
                  />
                </CardBody>
              </Card>
            ))}
          </div>

          <p className="text-ink-muted text-[11px]">
            Pay in {cur} at {ratesNote}. Salaries are read as annual.
          </p>
        </div>
      )}
    </div>
  );
}
