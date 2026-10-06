import { spawn } from "node:child_process";
import path from "node:path";
import "server-only";
import type { ExerciseTest } from "@/db/schema";
import type { RunReport, TestOutcome } from "@/lib/exercises";

/*
 * The authority on whether an exercise is solved.
 *
 * Nothing the browser reports is trusted here. The browser is where you type;
 * this is where it is decided. A client that claimed "all green" would be
 * believed by a server that only tallied its JSON, and then "done" would mean
 * nothing again — which is the exact problem this feature exists to fix.
 *
 * Execution happens in runner/python-runner.mjs, as its own process. See that
 * file for why.
 */

/** Whole-run budget, including the ~1.5s Pyodide takes to boot. */
const DEFAULT_TIMEOUT_MS = 15_000;
/** A runaway print loop should not be able to exhaust the server's memory. */
const MAX_OUTPUT_BYTES = 512 * 1024;

type RunnerEvent =
  | { type: "setup"; ok: boolean; error?: string; stdout?: string }
  | {
      type: "result";
      index: number;
      passed: boolean;
      got?: string;
      want?: string;
      error?: string;
      stdout?: string;
    }
  | { type: "done" }
  | { type: "fatal"; error: string };

function runnerScript(): string {
  // Overridable because the path that works is a property of the deployment,
  // not of the code: the repo root in dev, /app in the image.
  return (
    process.env.ALFRED_RUNNER_PATH ??
    path.join(process.cwd(), "runner", "python-runner.mjs")
  );
}

/**
 * Runs `code` against `tests` and reports every case.
 *
 * Never rejects for a failing submission — a wrong answer is a result, not an
 * error. It rejects only when the runner itself could not be started, which is
 * a deployment fault and must not read as "you got it wrong".
 */
export async function runPythonTests(
  code: string,
  tests: ExerciseTest[],
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<RunReport> {
  const started = Date.now();

  const child = spawn(process.execPath, [runnerScript()], {
    stdio: ["pipe", "pipe", "pipe"],
    // A deliberately bare environment. The child has no business reading the
    // database path or any provider key, and the candidate's own code is what
    // runs inside it.
    env: { PATH: process.env.PATH ?? "", NODE_ENV: process.env.NODE_ENV ?? "" },
  });

  const events: RunnerEvent[] = [];
  let stderr = "";
  let buffered = "";
  let bytes = 0;
  let overflowed = false;

  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    bytes += chunk.length;
    if (bytes > MAX_OUTPUT_BYTES) {
      overflowed = true;
      child.kill("SIGKILL");
      return;
    }
    buffered += chunk;
    // NDJSON: keep the trailing partial line for the next chunk.
    const lines = buffered.split("\n");
    buffered = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        events.push(JSON.parse(line) as RunnerEvent);
      } catch {
        // A line we cannot parse is the runner misbehaving, not the candidate.
        stderr += `unparseable runner output: ${line.slice(0, 200)}\n`;
      }
    }
  });

  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });

  // The child can be killed mid-write — on a timeout, or when it exits early
  // after a syntax error. That makes stdin emit EPIPE, which is expected here
  // and must not surface as an unhandled error event.
  child.stdin.on("error", () => {});

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill("SIGKILL");
  }, timeoutMs);

  const spawnFailure = await new Promise<Error | null>((resolve) => {
    child.on("error", (error) => resolve(error));
    child.on("close", () => resolve(null));
    try {
      child.stdin.end(JSON.stringify({ code, tests }));
    } catch (error) {
      resolve(error instanceof Error ? error : new Error(String(error)));
    }
  });
  clearTimeout(timer);

  if (spawnFailure) {
    throw new Error(
      `Could not start the exercise runner (${runnerScript()}): ${spawnFailure.message}`,
    );
  }

  const fatal = events.find((event) => event.type === "fatal");
  if (fatal && fatal.type === "fatal") {
    throw new Error(`The exercise runner failed: ${fatal.error}`);
  }
  // No events at all and no fatal line means it died before saying anything —
  // a missing pyodide in the image looks exactly like this.
  if (!events.length && !timedOut) {
    throw new Error(
      `The exercise runner produced no output.${stderr ? ` ${stderr.trim().slice(0, 300)}` : ""}`,
    );
  }

  const setup = events.find((event) => event.type === "setup");
  const setupFailed = setup?.type === "setup" && !setup.ok;

  const byIndex = new Map<number, Extract<RunnerEvent, { type: "result" }>>();
  for (const event of events) {
    if (event.type === "result") byIndex.set(event.index, event);
  }

  // Every test gets a row, including the ones that never ran. A report with
  // silent gaps is worse than one that says plainly where it stopped.
  const outcomes: TestOutcome[] = tests.map((test, index) => {
    const result = byIndex.get(index);
    if (result) {
      return {
        name: test.name,
        hidden: test.hidden,
        passed: result.passed,
        got: result.got,
        want: result.want,
        error: result.error,
        stdout: result.stdout,
      };
    }
    return {
      name: test.name,
      hidden: test.hidden,
      passed: false,
      timedOut: timedOut || overflowed,
      error: setupFailed
        ? "Not run — your code did not load."
        : overflowed
          ? "Not run — the previous case printed too much output."
          : timedOut
            ? `Not run — a previous case was still running after ${Math.round(timeoutMs / 1000)}s.`
            : "Not run.",
    };
  });

  return {
    passed:
      !setupFailed &&
      !timedOut &&
      !overflowed &&
      outcomes.length > 0 &&
      outcomes.every((outcome) => outcome.passed),
    setupError:
      setup?.type === "setup" && !setup.ok
        ? (setup.error ?? "Unknown error")
        : null,
    stdout: setup?.type === "setup" ? setup.stdout?.trim() || null : null,
    outcomes,
    timedOut: timedOut || overflowed,
    durationMs: Date.now() - started,
  };
}
