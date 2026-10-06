"use client";

import { AlertTriangle, Check, EyeOff, Timer, X } from "lucide-react";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import type { RunReport, TestOutcome } from "@/lib/exercises";
import { cn } from "@/lib/utils";

/*
 * What happened when the code ran.
 *
 * Hidden cases are shown but not fully explained — except for the FIRST one
 * that fails, which is reported in full. That is a deliberate middle: a
 * suite that only says "hidden test 9 failed" sends people guessing, while one
 * that prints every expected value has no hidden tests at all. One foothold is
 * enough to debug from, and it costs the exercise one case rather than all of
 * them.
 */

function Row({ outcome, revealed }: { outcome: TestOutcome; revealed: boolean }) {
  const detail = !outcome.hidden || revealed;
  const Icon = outcome.timedOut ? Timer : outcome.passed ? Check : X;
  const tint = outcome.passed
    ? "var(--good)"
    : outcome.timedOut
      ? "var(--warning)"
      : "var(--critical)";

  return (
    <li className="px-4 py-2.5">
      <div className="flex items-start gap-2.5">
        <Icon className="mt-0.5 size-3.5 shrink-0" style={{ color: tint }} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "text-xs font-medium",
                outcome.passed ? "text-ink-2" : "text-ink",
              )}
            >
              {outcome.name}
            </span>
            {outcome.hidden ? (
              <span className="text-ink-muted inline-flex items-center gap-1 text-[10px]">
                <EyeOff className="size-2.5" />
                hidden
              </span>
            ) : null}
          </div>

          {!outcome.passed && detail ? (
            <div className="mt-1.5 space-y-1 font-mono text-[11px]">
              {outcome.error ? (
                <p style={{ color: "var(--critical)" }}>{outcome.error}</p>
              ) : (
                <>
                  <p className="text-ink-muted">
                    expected <span className="text-ink">{outcome.want}</span>
                  </p>
                  <p className="text-ink-muted">
                    got{" "}
                    <span style={{ color: "var(--critical)" }}>{outcome.got}</span>
                  </p>
                </>
              )}
            </div>
          ) : null}

          {!outcome.passed && !detail ? (
            <p className="text-ink-muted mt-1 text-[11px]">
              A hidden case. Fix the one above first — if everything visible passes
              and this still fails, it will be shown in full.
            </p>
          ) : null}

          {outcome.stdout?.trim() ? (
            <pre className="border-line bg-surface-2 text-ink-muted mt-1.5 max-h-24 overflow-auto rounded-md border p-2 font-mono text-[10px] whitespace-pre-wrap">
              {outcome.stdout.trim()}
            </pre>
          ) : null}
        </div>
      </div>
    </li>
  );
}

export function TestResults({
  report,
  label,
}: {
  report: RunReport;
  label: string;
}) {
  const passedCount = report.outcomes.filter((outcome) => outcome.passed).length;

  // The first failing hidden case, and only that one.
  const revealIndex = React.useMemo(
    () => report.outcomes.findIndex((o) => o.hidden && !o.passed),
    [report.outcomes],
  );

  return (
    <div className="border-line overflow-hidden rounded-xl border">
      <div className="border-line bg-surface-2 flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-ink text-xs font-semibold">{label}</span>
          <Badge
            tint={report.passed ? "var(--good)" : "var(--critical)"}
          >{`${passedCount}/${report.outcomes.length} passed`}</Badge>
        </div>
        <span className="tnum text-ink-muted text-[10px]">
          {(report.durationMs / 1000).toFixed(1)}s
        </span>
      </div>

      {report.setupError ? (
        <div className="px-4 py-3">
          <p
            className="mb-1.5 inline-flex items-center gap-1.5 text-xs font-medium"
            style={{ color: "var(--critical)" }}
          >
            <AlertTriangle className="size-3.5" />
            Your code did not load
          </p>
          <pre className="border-line bg-surface-2 text-ink overflow-auto rounded-md border p-2.5 font-mono text-[11px] whitespace-pre-wrap">
            {report.setupError}
          </pre>
        </div>
      ) : null}

      {report.timedOut ? (
        <p
          className="border-line border-b px-4 py-2.5 text-[11px]"
          style={{ color: "var(--warning)" }}
        >
          The run was stopped before it finished — usually a loop that never ends,
          or a solution a few orders of magnitude too slow for the input size.
        </p>
      ) : null}

      {report.stdout ? (
        <div className="border-line border-b px-4 py-2.5">
          <p className="text-ink-muted mb-1 text-[10px] font-medium tracking-wide uppercase">
            Printed while loading
          </p>
          <pre className="text-ink-2 max-h-28 overflow-auto font-mono text-[10px] whitespace-pre-wrap">
            {report.stdout}
          </pre>
        </div>
      ) : null}

      {report.outcomes.length ? (
        <ul className="divide-y divide-[var(--border)]">
          {report.outcomes.map((outcome, index) => (
            <Row
              key={`${outcome.name}-${index}`}
              outcome={outcome}
              revealed={index === revealIndex}
            />
          ))}
        </ul>
      ) : null}
    </div>
  );
}
