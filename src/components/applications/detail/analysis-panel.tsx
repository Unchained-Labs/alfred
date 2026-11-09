"use client";

import {
  AlertTriangle,
  Banknote,
  Compass,
  RefreshCw,
  Sparkles,
  Target,
  ThumbsUp,
} from "lucide-react";
import * as React from "react";
import { fitTone, FitGauge } from "@/components/charts/meter";
import { jobPhase, useQueuedJob } from "@/components/jobs/use-queued-job";
import { SkillBars } from "@/components/charts/skill-bars";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, ThinkingRows } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import type { AiJob, Analysis } from "@/db/schema";
import { formatDateTime } from "@/lib/utils";

function Bullets({
  title,
  items,
  icon: Icon,
  tint,
}: {
  title: string;
  items: string[];
  icon: typeof ThumbsUp;
  tint: string;
}) {
  if (!items.length) return null;
  return (
    <div>
      <p className="text-ink mb-2 flex items-center gap-1.5 text-xs font-semibold">
        <Icon className="size-3.5" style={{ color: tint }} />
        {title}
      </p>
      <ul className="space-y-1.5">
        {items.map((item) => (
          <li key={item} className="text-ink-2 flex gap-2 text-xs leading-relaxed">
            <span
              aria-hidden
              className="mt-1.5 size-1 shrink-0 rounded-full"
              style={{ background: tint }}
            />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AnalysisPanel({
  applicationId,
  analysis,
  hasDescription,
  activeJob,
}: {
  applicationId: string;
  analysis: Analysis | null;
  hasDescription: boolean;
  /** An analysis already queued or running when the page rendered. */
  activeJob?: AiJob | null;
}) {
  const toast = useToast();
  const {
    job,
    busy: running,
    start,
  } = useQueuedJob(activeJob, {
    onSucceeded: (done) => {
      const fit = (done.result as { fitScore?: number } | null)?.fitScore;
      toast.success(
        "Analysis ready",
        fit != null ? `Fit score: ${fit}/100` : undefined,
      );
    },
    onFailed: (done) => toast.error("Analysis failed", done.error ?? ""),
  });

  async function analyze() {
    try {
      await start(`/api/applications/${applicationId}/analyze`);
    } catch (error) {
      toast.error(
        "Analysis failed",
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  const tone = analysis ? fitTone(analysis.fitScore) : null;

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="size-4" style={{ color: "var(--brand)" }} />
            Fit analysis
          </CardTitle>
          <p className="text-ink-muted mt-0.5 text-xs">
            {analysis
              ? `${analysis.provider}${analysis.model ? ` · ${analysis.model}` : ""} · ${formatDateTime(analysis.createdAt)}`
              : "How your background lines up against this posting"}
          </p>
        </div>
        {analysis ? (
          <Button size="sm" variant="ghost" onClick={analyze} loading={running}>
            <RefreshCw className="size-3.5" />
            Re-run
          </Button>
        ) : null}
      </CardHeader>

      <CardBody>
        {running && !analysis ? (
          <div className="space-y-3">
            <p className="text-ink-muted text-xs">
              {jobPhase(job)} — it carries on if you leave this page.
            </p>
            <ThinkingRows rows={4} />
          </div>
        ) : !analysis ? (
          <EmptyState
            icon={Target}
            title="Not analyzed yet"
            description={
              hasDescription
                ? "Alfred will score your fit, name the gaps, and say how to position yourself."
                : "Add the job description first — without it the analysis is mostly guesswork."
            }
            action={
              <Button variant="primary" onClick={analyze} loading={running}>
                <Sparkles className="size-3.5" />
                Analyze this role
              </Button>
            }
            compact
          />
        ) : (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-5">
              <FitGauge score={analysis.fitScore} />
              <div className="min-w-0 flex-1">
                <Badge tint={tone!.color} size="md">
                  {tone!.label}
                </Badge>
                <p className="text-ink mt-2 text-sm font-medium">
                  {analysis.verdict}
                </p>
                <p className="text-ink-2 mt-1.5 text-xs leading-relaxed">
                  {analysis.summary}
                </p>
              </div>
            </div>

            <div className="border-line border-t pt-4">
              <p className="label-eyebrow mb-3">Skill coverage</p>
              <SkillBars skills={analysis.skills ?? []} />
            </div>

            <div className="border-line grid gap-5 border-t pt-4 sm:grid-cols-2">
              <Bullets
                title="Lead with these"
                items={analysis.strengths ?? []}
                icon={ThumbsUp}
                tint="var(--good)"
              />
              <Bullets
                title="Close these gaps"
                items={analysis.gaps ?? []}
                icon={AlertTriangle}
                tint="var(--serious)"
              />
            </div>

            {(analysis.interviewFocus ?? []).length ? (
              <div className="border-line border-t pt-4">
                <p className="text-ink mb-2 flex items-center gap-1.5 text-xs font-semibold">
                  <Compass
                    className="size-3.5"
                    style={{ color: "var(--series-1)" }}
                  />
                  Likely interview focus
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {(analysis.interviewFocus ?? []).map((topic) => (
                    <Badge key={topic} tint="var(--series-1)">
                      {topic}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}

            {analysis.positioning ? (
              <div className="border-line bg-surface-2 rounded-xl border p-3.5">
                <p className="text-ink mb-1.5 flex items-center gap-1.5 text-xs font-semibold">
                  <Compass className="size-3.5" style={{ color: "var(--brand)" }} />
                  How to position yourself
                </p>
                <p className="text-ink-2 text-xs leading-relaxed">
                  {analysis.positioning}
                </p>
              </div>
            ) : null}

            {analysis.salaryInsight ? (
              <p className="text-ink-muted flex items-start gap-2 text-xs leading-relaxed">
                <Banknote className="mt-0.5 size-3.5 shrink-0" />
                {analysis.salaryInsight}
              </p>
            ) : null}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
