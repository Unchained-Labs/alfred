import {
  CircleSlash,
  Clock,
  Handshake,
  Info,
  MailQuestion,
  Send,
  Split,
} from "lucide-react";
import * as React from "react";
import { RejectionFeedback } from "@/components/analytics/rejection-feedback";
import { BreakdownBars } from "@/components/charts/breakdown-bars";
import { FitScatter } from "@/components/charts/fit-scatter";
import { OutcomeTrend } from "@/components/charts/outcome-trend";
import { ResponseHistogram } from "@/components/charts/response-histogram";
import { StageFates } from "@/components/charts/stage-fates";
import { StageWait } from "@/components/charts/stage-wait";
import { StatTile } from "@/components/charts/stat-tile";
import { PageHeader } from "@/components/shell/app-shell";
import {
  Card,
  CardBody,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireUserForPage } from "@/lib/auth";
import { analyticsReport } from "@/lib/analytics";
import { MIN_FOR_RATE } from "@/lib/analytics/compute";

export const dynamic = "force-dynamic";

/*
 * The one page in Alfred that is allowed to be about numbers.
 *
 * Its job is to answer three questions the pipeline board cannot: where do
 * applications die, how long does each step actually take, and is any of the
 * signal Alfred generates worth trusting. Everything here is derived from the
 * timeline events, so it costs nothing to keep and improves on its own as the
 * hunt goes on.
 *
 * The page is honest about thin data rather than decorative. With six
 * applications the medians swing wildly, so it says so at the top instead of
 * drawing confident-looking shapes over three data points.
 */
export default async function AnalyticsPage() {
  const user = await requireUserForPage();
  const report = analyticsReport(user.id);
  const { headline, rejections } = report;

  const fitGap =
    report.fit.medianFitAdvanced != null && report.fit.medianFitStalled != null
      ? Math.round(
          (report.fit.medianFitAdvanced - report.fit.medianFitStalled) * 10,
        ) / 10
      : null;

  return (
    <div className="mx-auto max-w-7xl p-4 lg:p-6">
      <PageHeader
        title="Analytics"
        description="Where applications end, how long each step takes, and what the companies said on the way out."
      />

      {headline.sent === 0 ? (
        <Card>
          <CardBody className="py-14 text-center">
            <p className="text-ink text-sm font-medium">Nothing to measure yet</p>
            <p className="text-ink-muted mx-auto mt-1.5 max-w-sm text-xs leading-relaxed">
              Every panel here is built from your own timeline — stage moves,
              replies, rejections. Send a few applications and it fills in on its
              own.
            </p>
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-4">
          {headline.thin ? (
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
                <strong className="text-ink">
                  {headline.sent}{" "}
                  {headline.sent === 1 ? "application" : "applications"}
                </strong>{" "}
                is a thin sample. Read the shapes, not the decimals — one outcome
                either way moves most of these numbers several points, and rates
                over fewer than {MIN_FOR_RATE} are left blank rather than guessed
                at.
              </p>
            </div>
          ) : null}

          {/* Headline */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile
              label="Applications sent"
              value={headline.sent}
              icon={Send}
              hint={`${headline.open} still open`}
            />
            <StatTile
              label="Response rate"
              value={headline.responseRate ?? "—"}
              unit={headline.responseRate != null ? "%" : undefined}
              icon={MailQuestion}
              hint={
                headline.responseRate == null
                  ? `Needs ${MIN_FOR_RATE} sent`
                  : "Got past the first reply"
              }
            />
            <StatTile
              label="Rejections"
              value={headline.rejected}
              icon={CircleSlash}
              hint={
                headline.rejectionRate != null
                  ? `${headline.rejectionRate}% of everything sent${headline.withdrawn > 0 ? ` · ${headline.withdrawn} withdrawn` : ""}`
                  : headline.withdrawn > 0
                    ? `${headline.withdrawn} withdrawn`
                    : "Closed by the company"
              }
            />
            <StatTile
              label="Offers"
              value={headline.offers}
              icon={Handshake}
              hint={
                headline.accepted > 0
                  ? `${headline.accepted} accepted`
                  : "Reached the offer stage"
              }
            />
          </div>

          {/* The rejection story: where, and why. */}
          <div className="grid gap-4 lg:grid-cols-5">
            <Card className="lg:col-span-2">
              <CardHeader>
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Split
                      className="size-4"
                      style={{ color: "var(--critical)" }}
                    />
                    Where applications end
                  </CardTitle>
                  <CardDescription>
                    What happened to everything that reached each stage
                  </CardDescription>
                </div>
              </CardHeader>
              <CardBody>
                <StageFates fates={report.fates} />
              </CardBody>
            </Card>

            <Card className="overflow-hidden lg:col-span-3">
              <CardHeader>
                <div>
                  <CardTitle>What they said</CardTitle>
                  <CardDescription>
                    Rejection feedback, newest first
                  </CardDescription>
                </div>
              </CardHeader>
              <div className="border-line border-t">
                <RejectionFeedback rejections={rejections} />
              </div>
            </Card>
          </div>

          {/* Timing */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="size-4" style={{ color: "var(--brand)" }} />
                    Time in each stage
                  </CardTitle>
                  <CardDescription>
                    Middle half of completed waits, with the median marked
                  </CardDescription>
                </div>
              </CardHeader>
              <CardBody>
                <StageWait durations={report.durations} />
              </CardBody>
            </Card>

            <Card className="flex flex-col">
              <CardHeader>
                <div>
                  <CardTitle>Time to first reply</CardTitle>
                  <CardDescription>
                    {report.response.medianDays != null
                      ? `Median ${report.response.medianDays} days, over ${report.response.n} answered`
                      : "Once a reply arrives, its lag lands here"}
                  </CardDescription>
                </div>
              </CardHeader>
              <CardBody className="flex-1">
                <ResponseHistogram response={report.response} />
              </CardBody>
              {report.response.ghosted > 0 ? (
                <div className="border-line border-t px-5 py-3">
                  <p className="text-ink-2 text-xs">
                    <strong className="text-ink tnum">
                      {report.response.ghosted}
                    </strong>{" "}
                    {report.response.ghosted === 1
                      ? "application has"
                      : "applications have"}{" "}
                    had no reply at all for over {report.response.ghostedAfterDays}{" "}
                    days.
                    <span className="text-ink-muted">
                      {" "}
                      They are excluded from the median above — counting them as a
                      fast reply would flatter it.
                    </span>
                  </p>
                </div>
              ) : null}
            </Card>
          </div>

          {/* Over time */}
          <Card className="flex flex-col">
            <CardHeader>
              <div>
                <CardTitle>Sends and outcomes by week</CardTitle>
                <CardDescription>
                  Last {report.trendWeeks} weeks. Rejections lag the sends that
                  caused them, so the gap between the bars and the red line is
                  roughly your cycle time.
                </CardDescription>
              </div>
            </CardHeader>
            <CardBody className="flex-1">
              <OutcomeTrend trend={report.trend} weeks={report.trendWeeks} />
            </CardBody>
          </Card>

          {/* Signal quality + slices */}
          <div className="grid gap-4 lg:grid-cols-5">
            <Card className="flex flex-col lg:col-span-3">
              <CardHeader>
                <div>
                  <CardTitle>Fit score against how far it went</CardTitle>
                  <CardDescription>
                    {fitGap == null
                      ? "Whether Alfred's pre-reply score predicts anything"
                      : fitGap >= 5
                        ? `Applications that got a reply scored ${fitGap} points higher on average — the score is carrying some signal.`
                        : `Only ${fitGap} points separate the two groups — treat the score as a summary, not a prediction.`}
                  </CardDescription>
                </div>
              </CardHeader>
              <CardBody className="flex-1">
                <FitScatter fit={report.fit} />
              </CardBody>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <div>
                  <CardTitle>Response rate by slice</CardTitle>
                  <CardDescription>
                    Where your replies actually come from
                  </CardDescription>
                </div>
              </CardHeader>
              <CardBody className="space-y-5">
                <section>
                  <p className="label-eyebrow mb-2.5">Source</p>
                  <BreakdownBars
                    rows={report.bySource}
                    emptyLabel="No applications to slice yet."
                  />
                </section>
                <section>
                  <p className="label-eyebrow mb-2.5">Seniority</p>
                  <BreakdownBars
                    rows={report.bySeniority}
                    emptyLabel="No seniority recorded on any application."
                  />
                </section>
                <section>
                  <p className="label-eyebrow mb-2.5">Work mode</p>
                  <BreakdownBars
                    rows={report.byWorkMode}
                    emptyLabel="No work mode recorded on any application."
                  />
                </section>
              </CardBody>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
