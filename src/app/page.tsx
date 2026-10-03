import {
  Activity,
  AlertCircle,
  ArrowRight,
  Briefcase,
  CalendarClock,
  Handshake,
  Target,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { ActivityChart } from "@/components/charts/activity-chart";
import { Funnel } from "@/components/charts/funnel";
import { StatTile } from "@/components/charts/stat-tile";
import { SetupNudge } from "@/components/dashboard/setup-nudge";
import { UpNext } from "@/components/dashboard/up-next";
import { PageHeader } from "@/components/shell/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import {
  applicationActivity,
  dashboardStats,
  funnelDepth,
  needsAttention,
  upcomingWork,
} from "@/lib/queries";
import { getSettings, profileIsUsable, providerIsConfigured } from "@/lib/settings";
import { STAGE_META } from "@/lib/stages";
import { formatDate, initials, relativeDay } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** Buckets the 30-day activity series into 12 points for the sparklines. */
function sparkline(activity: { count: number }[]): number[] {
  const buckets = 12;
  const size = Math.ceil(activity.length / buckets);
  const out: number[] = [];
  for (let index = 0; index < activity.length; index += size) {
    out.push(
      activity
        .slice(index, index + size)
        .reduce((total, point) => total + point.count, 0),
    );
  }
  return out;
}

export default function DashboardPage() {
  const stats = dashboardStats();
  const funnel = funnelDepth();
  const activity = applicationActivity(30);
  const queue = upcomingWork(7);
  const attention = needsAttention(5);
  const settings = getSettings();

  const providerReady = providerIsConfigured(settings.ai);

  const empty = stats.active === 0 && stats.totalApplied === 0;
  const trend = sparkline(activity);

  return (
    <div className="mx-auto max-w-7xl p-4 lg:p-6">
      <PageHeader
        title="Dashboard"
        description="Where every application stands, and what to do about it next."
        actions={
          <Button asChild variant="outline">
            <Link href="/pipeline">
              Open pipeline
              <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        }
      />

      <SetupNudge
        needsProvider={!providerReady}
        needsProfile={providerReady && !profileIsUsable(settings.profile)}
      />

      {empty ? (
        <Card>
          <EmptyState
            icon={Briefcase}
            title="No applications yet"
            description="Add your first one with the button up top — paste a posting and Alfred will extract the details, score your fit, and build a prep plan."
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {/* Hero + funnel */}
          <div className="grid gap-4 lg:grid-cols-5">
            <Card className="relative overflow-hidden lg:col-span-2">
              <div className="aurora" />
              <div className="relative p-5">
                <p className="label-eyebrow">Live pipeline</p>
                {/* The one hero figure on this view. */}
                <p className="text-ink mt-2 text-6xl leading-none font-semibold tracking-tight">
                  {stats.active}
                </p>
                <p className="text-ink-muted mt-1.5 text-sm">
                  {stats.active === 1 ? "application" : "applications"} in play
                </p>

                <div className="border-line mt-5 grid grid-cols-3 gap-3 border-t pt-4">
                  {[
                    { label: "Interviewing", value: stats.interviewing },
                    { label: "Offers", value: stats.offers },
                    { label: "Sent total", value: stats.totalApplied },
                  ].map((item) => (
                    <div key={item.label}>
                      <p className="tnum text-ink text-lg leading-none font-semibold">
                        {item.value}
                      </p>
                      <p className="text-ink-muted mt-1 text-[11px]">
                        {item.label}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </Card>

            <Card className="lg:col-span-3">
              <CardHeader>
                <div>
                  <CardTitle>Conversion funnel</CardTitle>
                  <p className="text-ink-muted mt-0.5 text-xs">
                    Applications that reached each stage, including ones later
                    closed.
                  </p>
                </div>
                {stats.responseRate != null ? (
                  <Badge tint="var(--series-1)" size="md">
                    {stats.responseRate}% response rate
                  </Badge>
                ) : null}
              </CardHeader>
              <CardBody>
                <Funnel rows={funnel} />
              </CardBody>
            </Card>
          </div>

          {/* Stat tiles */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile
              label="Applied, last 7 days"
              value={stats.appliedLast7}
              icon={TrendingUp}
              delta={{
                value: stats.appliedLast7 - stats.appliedPrev7,
                period: "vs prior 7d",
                higherIsBetter: true,
              }}
              trend={trend}
            />
            <StatTile
              label="Open prep items"
              value={stats.openActionables}
              icon={Target}
              hint={
                stats.dueSoon > 0
                  ? `${stats.dueSoon} due within 3 days`
                  : "Nothing due soon"
              }
            />
            <StatTile
              label="Average fit score"
              value={stats.avgFitScore ?? "—"}
              unit={stats.avgFitScore != null ? "/100" : undefined}
              icon={Activity}
              hint={
                stats.avgFitScore == null
                  ? "Run an analysis to see this"
                  : "Across analyzed roles"
              }
            />
            <StatTile
              label="Offers"
              value={stats.offers}
              icon={Handshake}
              hint={
                stats.rejections > 0
                  ? `${stats.rejections} rejected so far`
                  : "No rejections yet"
              }
            />
          </div>

          {/* Activity + queue */}
          <div className="grid gap-4 lg:grid-cols-5">
            <Card className="flex flex-col lg:col-span-3">
              <CardHeader>
                <div>
                  <CardTitle>Applications sent</CardTitle>
                  <p className="text-ink-muted mt-0.5 text-xs">Last 30 days</p>
                </div>
              </CardHeader>
              <CardBody className="flex-1">
                <ActivityChart data={activity} />
              </CardBody>
            </Card>

            <Card className="flex flex-col lg:col-span-2">
              <CardHeader>
                <div>
                  <CardTitle>Up next</CardTitle>
                  <p className="text-ink-muted mt-0.5 text-xs">
                    Highest-leverage prep work
                  </p>
                </div>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/prep">All</Link>
                </Button>
              </CardHeader>
              <div className="border-line flex-1 border-t">
                <UpNext items={queue} />
              </div>
            </Card>
          </div>

          {/* Overdue follow-ups */}
          {attention.length > 0 ? (
            <Card>
              <CardHeader>
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <AlertCircle
                      className="size-4"
                      style={{ color: "var(--serious)" }}
                    />
                    Needs a nudge
                  </CardTitle>
                  <p className="text-ink-muted mt-0.5 text-xs">
                    Follow-ups whose date has passed
                  </p>
                </div>
              </CardHeader>
              <ul className="border-line divide-y divide-[var(--border)] border-t">
                {attention.map((app) => (
                  <li key={app.id}>
                    <Link
                      href={`/pipeline/${app.id}`}
                      className="hover:bg-surface-2 flex items-center gap-3 px-5 py-3 transition-colors"
                    >
                      <span className="bg-surface-3 text-ink-2 grid size-8 shrink-0 place-items-center rounded-lg text-[10px] font-semibold">
                        {initials(app.company)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-ink truncate text-xs font-medium">
                          {app.title}
                        </p>
                        <p className="text-ink-muted truncate text-[11px]">
                          {app.company}
                          {app.nextActionLabel ? ` · ${app.nextActionLabel}` : ""}
                        </p>
                      </div>
                      <Badge tint={`var(${STAGE_META[app.stage].token})`}>
                        {STAGE_META[app.stage].label}
                      </Badge>
                      <span
                        className="hidden shrink-0 items-center gap-1 text-[10px] sm:flex"
                        style={{ color: "var(--critical)" }}
                      >
                        <CalendarClock className="size-3" />
                        {relativeDay(app.nextActionAt)}
                        <span className="text-ink-muted">
                          ({formatDate(app.nextActionAt)})
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      )}
    </div>
  );
}
