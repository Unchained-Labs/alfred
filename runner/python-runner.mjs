/**
 * Runs a candidate's Python against an exercise's test cases, and reports what
 * happened one line at a time.
 *
 * This is a standalone script rather than a module inside src/ for two reasons.
 *
 * It must be a SEPARATE PROCESS. Pyodide executes Python synchronously on the
 * thread that calls it, so a submission with an infinite loop — the single most
 * likely thing a half-finished solution does — would wedge the event loop and
 * take the whole server down with it. A child process can simply be killed.
 * That also caps the damage from a wasm heap that grows without bound, and
 * means the ~150MB Pyodide costs is transient rather than resident forever.
 *
 * And it must be UNBUNDLED. Next traces and rewrites what it bundles; a worker
 * entry point has to survive as a real file at a real path. So it lives here,
 * is copied verbatim into the image, and is spawned by absolute path.
 *
 * Protocol: a single JSON job on stdin, NDJSON events on stdout.
 *   in   { code, tests: [{ name, call, expect, hidden }] }
 *   out  { type: "setup",  ok, error?, stdout? }
 *        { type: "result", index, passed, got?, want?, error?, stdout? }
 *        { type: "done" }
 *        { type: "fatal",  error }
 *
 * Streaming matters: if the parent has to kill us for running too long, every
 * test that already finished is still reported, and the first one missing is
 * precisely the one that hung. A timeout becomes "test 7 never came back"
 * instead of "something, somewhere, failed".
 */

import { loadPyodide } from "pyodide";

/** Keeps one pathological test from producing a megabyte of output. */
const MAX_STDOUT = 4000;
const MAX_REPR = 600;

/**
 * Defines the two helpers the loop below calls.
 *
 * `alfred_test` RE-EXECUTES the submission for every case rather than copying
 * the namespace it produced. A shallow copy looks sufficient and is not: a
 * module-level `cache = {}` or `shared = Counter()` is the same object in
 * every copy, so one case mutates what the next one sees and the suite starts
 * failing on ordering rather than on correctness. Re-running a module of
 * function definitions costs microseconds; a test that passes alone and fails
 * in sequence costs an evening.
 *
 * `expect` is evaluated with empty globals: it is a literal by contract, and
 * evaluating it in the candidate's namespace would let a shadowed builtin
 * quietly redefine what "correct" means.
 */
const HARNESS = `
import contextlib, io, json, sys, traceback

_code = ""

def _clip(text, limit):
    text = text if isinstance(text, str) else str(text)
    return text if len(text) <= limit else text[:limit] + "\\n... (truncated)"

def _blocked_imports(names):
    """
    Python running here is the candidate's own code, in their own app. The
    sandbox is wasm, so the filesystem and network are already out of reach —
    except through \`import js\`, which hands back the host's JavaScript scope
    and with it this process. That one is a real escape, so the bridge modules
    are refused by name.
    """
    class Blocker:
        def find_module(self, fullname, path=None):
            return self if fullname.split(".")[0] in names else None

        def find_spec(self, fullname, path=None, target=None):
            if fullname.split(".")[0] in names:
                raise ImportError(
                    f"{fullname} is not available in the exercise runner."
                )
            return None

    for name in list(sys.modules):
        if name.split(".")[0] in names:
            del sys.modules[name]
    sys.meta_path.insert(0, Blocker())

_blocked_imports({"js", "pyodide_js", "ctypes", "subprocess", "socket", "multiprocessing"})

def alfred_setup(code):
    """
    Runs the submission once to report whether it loads at all, and anything
    it printed while doing so. Nothing is kept from this namespace — each test
    builds its own.
    """
    global _code
    _code = code
    out = io.StringIO()
    try:
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(out):
            exec(code, {"__name__": "__main__"})
    except BaseException:
        return json.dumps({
            "ok": False,
            "error": _clip(traceback.format_exc(limit=4), 2000),
            "stdout": _clip(out.getvalue(), ${MAX_STDOUT}),
        })
    return json.dumps({"ok": True, "stdout": _clip(out.getvalue(), ${MAX_STDOUT})})

def alfred_test(call, expect):
    out = io.StringIO()
    try:
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(out):
            ns = {"__name__": "__main__"}
            exec(_code, ns)
            # Whatever the module printed on import was already reported by
            # setup; repeating it on every case would bury the test's own output.
            out.truncate(0)
            out.seek(0)
            want = eval(expect, {})
            got = eval(call, ns)
        return json.dumps({
            "passed": bool(got == want),
            "got": _clip(repr(got), ${MAX_REPR}),
            "want": _clip(repr(want), ${MAX_REPR}),
            "stdout": _clip(out.getvalue(), 1000),
        })
    except BaseException as exc:
        return json.dumps({
            "passed": False,
            "error": _clip(f"{type(exc).__name__}: {exc}", 600),
            "stdout": _clip(out.getvalue(), 1000),
        })
`;

function emit(event) {
  process.stdout.write(`${JSON.stringify(event)}\n`);
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

async function main() {
  const job = JSON.parse(await readStdin());
  const tests = Array.isArray(job.tests) ? job.tests : [];

  // Python's own prints are captured inside the harness; anything Pyodide
  // itself says would otherwise corrupt the NDJSON stream on stdout.
  const pyodide = await loadPyodide({
    stdout: () => {},
    stderr: () => {},
  });
  pyodide.runPython(HARNESS);

  const setup = JSON.parse(
    pyodide.globals.get("alfred_setup")(String(job.code ?? "")),
  );
  emit({ type: "setup", ...setup });
  // Code that does not even import cannot be tested; the error is the result.
  if (!setup.ok) {
    emit({ type: "done" });
    return;
  }

  const run = pyodide.globals.get("alfred_test");
  for (const [index, test] of tests.entries()) {
    const outcome = JSON.parse(run(String(test.call), String(test.expect)));
    emit({ type: "result", index, ...outcome });
  }
  emit({ type: "done" });
}

main().then(
  () => process.exit(0),
  (error) => {
    emit({ type: "fatal", error: error?.message ?? String(error) });
    process.exit(1);
  },
);
