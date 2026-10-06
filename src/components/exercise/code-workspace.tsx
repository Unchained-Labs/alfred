"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  Play,
  RotateCcw,
  Send,
} from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { CodeEditor } from "@/components/exercise/code-editor";
import { Hints } from "@/components/exercise/hints";
import { TestResults } from "@/components/exercise/test-results";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Prose } from "@/components/ui/prose";
import { useToast } from "@/components/ui/toast";
import type { Actionable, Exercise, Submission } from "@/db/schema";
import { asRunReport, type RunReport } from "@/lib/exercises";
import { useStoredValue } from "@/lib/use-stored";

/**
 * Where a coding prep item is actually done.
 *
 * Two buttons, and the difference between them is the whole design. Run is
 * local feedback against the visible cases and costs nothing. Submit is the
 * verdict: it runs every case, including the hidden ones, on the server, and
 * is the only thing that can mark the prep item done.
 */
export function CodeWorkspace({
  exercise,
  actionable,
  lastSubmission,
}: {
  exercise: Exercise;
  actionable: Actionable;
  lastSubmission: Submission | null;
}) {
  const router = useRouter();
  const toast = useToast();

  // Resume where they left off: the last thing they submitted, or the
  // skeleton. An unsent draft in this browser wins over both.
  const starting = lastSubmission?.body ?? exercise.starterCode ?? "";
  const [code, setCode, clearDraft] = useStoredValue(
    `alfred:draft:${exercise.id}`,
    starting,
  );

  const [busy, setBusy] = React.useState<"run" | "submit" | null>(null);
  const [report, setReport] = React.useState<{
    label: string;
    data: RunReport;
  } | null>(() => {
    const previous = asRunReport(lastSubmission?.results);
    return previous ? { label: "Last submission", data: previous } : null;
  });
  const [solution, setSolution] = React.useState<string | null>(null);
  const [showSolution, setShowSolution] = React.useState(false);

  const verified = Boolean(actionable.verifiedAt);
  // A generated suite that rejects its own reference solution is Alfred's bug,
  // and the candidate is told so rather than left to doubt their answer.
  const checksBroken = exercise.selfCheckPassed === false;

  async function post(path: "run" | "submit") {
    setBusy(path);
    try {
      const response = await fetch(`/api/exercises/${exercise.id}/${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "The run failed.");

      setReport({
        label: path === "run" ? "Sample tests" : "Submission",
        data: data.report as RunReport,
      });

      if (path === "submit") {
        if (data.passed) {
          setSolution(data.referenceSolution ?? null);
          toast.success("Solved", `"${actionable.title}" is done.`);
          // The prep item's status lives on the server; re-render so the rest
          // of the app agrees it is complete.
          router.refresh();
        } else {
          toast.error("Not yet", "Some cases still fail — the results are below.");
        }
      }
    } catch (error) {
      toast.error(
        path === "run" ? "Could not run" : "Could not submit",
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setBusy(null);
    }
  }

  // Cmd/Ctrl+Enter to run, add Shift to submit. The editor swallows plain
  // Enter, so these are bound on the container.
  function onKeyDown(event: React.KeyboardEvent) {
    if (!(event.metaKey || event.ctrlKey) || event.key !== "Enter") return;
    event.preventDefault();
    if (busy) return;
    void post(event.shiftKey ? "submit" : "run");
  }

  return (
    <div
      className="grid gap-4 lg:grid-cols-5"
      onKeyDown={onKeyDown}
      role="presentation"
    >
      <div className="space-y-4 lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle>The problem</CardTitle>
            {exercise.language ? (
              <Badge tint="var(--kind-leetcode)">{exercise.language}</Badge>
            ) : null}
          </CardHeader>
          <CardBody>
            <Prose>{exercise.brief}</Prose>
          </CardBody>
        </Card>

        {checksBroken ? (
          <Card>
            <CardBody className="pt-4">
              <p
                className="mb-1.5 inline-flex items-center gap-1.5 text-xs font-medium"
                style={{ color: "var(--warning)" }}
              >
                <AlertTriangle className="size-3.5" />
                These tests are not trustworthy
              </p>
              <p className="text-ink-2 text-[11px] leading-relaxed">
                {exercise.selfCheckDetail ??
                  "The generated tests reject the solution they shipped with."}{" "}
                Solve it for the practice, then mark it done by hand — Alfred will
                not hold you to a check it got wrong. Regenerating usually produces
                a clean one.
              </p>
            </CardBody>
          </Card>
        ) : null}

        {exercise.examples?.length ? (
          <Card>
            <CardHeader>
              <CardTitle>Examples</CardTitle>
            </CardHeader>
            <CardBody className="space-y-2.5">
              {exercise.examples.map((example, index) => (
                <div
                  key={index}
                  className="border-line bg-surface-2 space-y-1 rounded-lg border p-2.5 font-mono text-[11px]"
                >
                  <p className="text-ink-muted">
                    in <span className="text-ink">{example.input}</span>
                  </p>
                  <p className="text-ink-muted">
                    out <span className="text-ink">{example.output}</span>
                  </p>
                  {example.note ? (
                    <p className="text-ink-muted font-sans text-[10px] italic">
                      {example.note}
                    </p>
                  ) : null}
                </div>
              ))}
            </CardBody>
          </Card>
        ) : null}

        {exercise.hints?.length ? (
          <Card>
            <CardHeader>
              <CardTitle>Stuck?</CardTitle>
            </CardHeader>
            <CardBody>
              <Hints hints={exercise.hints} exerciseId={exercise.id} />
            </CardBody>
          </Card>
        ) : null}
      </div>

      <div className="space-y-4 lg:col-span-3">
        {verified ? (
          <div
            className="flex items-center gap-2 rounded-xl border px-4 py-3"
            style={{
              borderColor: "color-mix(in oklab, var(--good) 30%, transparent)",
              backgroundColor: "color-mix(in oklab, var(--good) 10%, transparent)",
            }}
          >
            <CheckCircle2 className="size-4" style={{ color: "var(--good)" }} />
            <p className="text-ink text-xs font-medium">
              Solved. Every test passed on the server.
            </p>
          </div>
        ) : null}

        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Your solution</CardTitle>
            <span className="text-ink-muted hidden text-[10px] sm:inline">
              ⌘↵ run · ⇧⌘↵ submit
            </span>
          </CardHeader>
          <div className="px-5 pb-4">
            <CodeEditor value={code} onChange={setCode} height="440px" />
          </div>

          <div className="border-line flex flex-wrap items-center gap-2 border-t px-5 py-3">
            <Button
              variant="secondary"
              onClick={() => post("run")}
              loading={busy === "run"}
              disabled={busy !== null}
            >
              <Play className="size-3.5" />
              Run samples
            </Button>
            <Button
              variant="primary"
              onClick={() => post("submit")}
              loading={busy === "submit"}
              disabled={busy !== null}
            >
              <Send className="size-3.5" />
              Submit
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                clearDraft();
                setCode(exercise.starterCode ?? "");
              }}
              disabled={busy !== null}
            >
              <RotateCcw className="size-3.5" />
              Reset
            </Button>
          </div>
        </Card>

        {report ? <TestResults report={report.data} label={report.label} /> : null}

        {/* The reference solution only exists here after a pass, and the
            server only sends it then — reading someone else's answer before
            you have your own is the one thing that makes this worthless. */}
        {solution ? (
          <Card>
            <CardHeader>
              <CardTitle>How Alfred would write it</CardTitle>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowSolution((value) => !value)}
              >
                <Eye className="size-3.5" />
                {showSolution ? "Hide" : "Show"}
              </Button>
            </CardHeader>
            {showSolution ? (
              <CardBody>
                <pre className="border-line bg-surface-2 text-ink overflow-x-auto rounded-lg border p-3 font-mono text-[11px] leading-relaxed">
                  <code>{solution}</code>
                </pre>
              </CardBody>
            ) : null}
          </Card>
        ) : null}
      </div>
    </div>
  );
}
