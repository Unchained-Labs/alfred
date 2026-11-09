import {
  type HandbookCell,
  handbookCellSchema,
  type HandbookProblem,
  handbookProblemSchema,
} from "@/lib/ai/schemas";
import { escapeHtml, inlineMarkdown, renderMarkdown } from "./markdown";

/*
 * The lab: runnable Python cells (a notebook) and practice problems with
 * tests (LeetCode), inside each part.
 *
 * Python runs in the reader's browser with Pyodide, inside a Web Worker, so a
 * loop that never ends stops the worker rather than the page. Pyodide is only
 * fetched — from its official CDN, pinned — the first time someone presses
 * Run; a reader who never runs anything never downloads it. Offline, the cell
 * says so instead of hanging.
 *
 * Code is DATA here like everything else: it is written into a <textarea>
 * through escapeHtml and read back with .value. Tests go into an attribute as
 * escaped JSON, and their `args` and `expected` are parsed in Python with
 * ast.literal_eval — the harness never evaluates them as code.
 */

/** Pinned. Bump deliberately: the harness depends on its API. */
export const PYODIDE_URL = "https://cdn.jsdelivr.net/pyodide/v0.29.3/full/";

const IDENT = /^[A-Za-z_][A-Za-z0-9_]{0,60}$/;
const DIFFICULTY = new Set(["easy", "medium", "hard"]);

function cleanCells(value: unknown): HandbookCell[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((c) => handbookCellSchema.safeParse(c))
    .filter((r) => r.success)
    .map((r) => r.data)
    .filter((c) => c.code.trim())
    .slice(0, 4);
}

function cleanProblems(value: unknown): HandbookProblem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((p) => handbookProblemSchema.safeParse(p))
    .filter((r) => r.success)
    .map((r) => r.data)
    .filter((p) => IDENT.test(p.functionName) && p.tests.length)
    .slice(0, 3);
}

export function renderCells(value: unknown, key: string): string {
  const cells = cleanCells(value);
  if (!cells.length) return "";
  return `<div class="nb" data-ns="${escapeHtml(key)}">
  <p class="lab-h"><span>Notebook</span> Python runs in your browser. Cells share variables, top to bottom — edit anything and run it again.</p>
  ${cells
    .map(
      (c, i) => `<div class="cell" data-cell="${escapeHtml(`${key}-c${i}`)}">
    <div class="cell-h"><span class="cell-n">In [${i + 1}]</span><b>${escapeHtml(c.title)}</b></div>
    ${c.explain.trim() ? `<p class="cell-x">${inlineMarkdown(c.explain)}</p>` : ""}
    <textarea class="cell-code" spellcheck="false" autocapitalize="off" autocomplete="off" aria-label="${escapeHtml(`Python code: ${c.title}`)}" rows="${Math.min(18, c.code.split("\n").length + 1)}">${escapeHtml(c.code)}</textarea>
    <div class="cell-bar" hidden><button type="button" class="btn run">▶ Run</button><button type="button" class="btn reset">Reset</button><span class="cell-st" aria-live="polite"></span></div>
    <pre class="cell-out" hidden></pre>
  </div>`,
    )
    .join("")}
</div>`;
}

export function renderProblems(value: unknown, key: string): string {
  const problems = cleanProblems(value);
  if (!problems.length) return "";
  return problems
    .map((p, i) => {
      const id = `${key}-p${i}`;
      const visible = p.tests.filter((t) => !t.hidden);
      const tests = p.tests.map((t) => ({
        args: t.args.slice(0, 2000),
        expected: t.expected.slice(0, 2000),
        hidden: t.hidden,
      }));
      const difficulty = DIFFICULTY.has(p.difficulty) ? p.difficulty : "medium";
      return `<div class="prob" data-prob="${escapeHtml(id)}" data-fn="${escapeHtml(p.functionName)}" data-tests="${escapeHtml(JSON.stringify(tests))}">
  <div class="prob-head">
    <span class="lab-tag">Practice</span>
    <h4>${escapeHtml(p.title)}</h4>
    <span class="chip diff ${difficulty}">${difficulty}</span>
    <span class="chip solved-chip" hidden>✓ Solved</span>
  </div>
  <div class="prob-st">${renderMarkdown(p.statement)}</div>
  ${
    visible.length
      ? `<ul class="prob-vis">${visible
          .map(
            (t) =>
              `<li><code>${escapeHtml(p.functionName)}(${escapeHtml(t.args)})</code> → <code>${escapeHtml(t.expected)}</code></li>`,
          )
          .join("")}</ul>`
      : ""
  }
  <textarea class="cell-code prob-code" spellcheck="false" autocapitalize="off" autocomplete="off" aria-label="${escapeHtml(`Your solution: ${p.title}`)}" rows="${Math.min(16, p.starter.split("\n").length + 4)}">${escapeHtml(p.starter)}</textarea>
  <div class="cell-bar" hidden>
    <button type="button" class="btn run">▶ Run ${p.tests.length} tests</button>
    <button type="button" class="btn reset">Reset</button>
    ${p.hints.length ? `<button type="button" class="btn hint">Hint 0/${p.hints.length}</button>` : ""}
    <span class="cell-st" aria-live="polite"></span>
  </div>
  ${
    p.hints.length
      ? `<ol class="prob-hints">${p.hints
          .slice(0, 4)
          .map((h) => `<li hidden>${inlineMarkdown(h)}</li>`)
          .join("")}</ol>`
      : ""
  }
  <ol class="prob-res" aria-live="polite"></ol>
  <details class="prob-sol">
    <summary>Solution and explanation</summary>
    <pre><code>${escapeHtml(p.solution)}</code></pre>
    ${renderMarkdown(p.explanation)}
    <p class="prob-cx"><b>Complexity</b> ${escapeHtml(p.complexity)}</p>
  </details>
</div>`;
    })
    .join("");
}

/*
 * The test harness, in Python. It reads the function name and the tests from
 * variables the worker sets — never from text pasted into this source — and
 * parses every argument and expected value with ast.literal_eval.
 */
export const HARNESS = `import ast, json, math, io, contextlib
__results = []
__f = globals().get(__fn_name)
def __same(a, b):
    if isinstance(a, float) or isinstance(b, float):
        try:
            return math.isclose(a, b, rel_tol=1e-6, abs_tol=1e-9)
        except TypeError:
            return False
    return a == b
for __t in json.loads(__tests_json):
    __r = {"ok": False, "got": "", "error": ""}
    try:
        if not callable(__f):
            raise NameError("define a function called " + __fn_name)
        __a = __t["args"].strip()
        __args = ast.literal_eval("(" + __a + ",)") if __a else ()
        __exp = ast.literal_eval(__t["expected"])
        __buf = io.StringIO()
        with contextlib.redirect_stdout(__buf):
            __got = __f(*__args)
        __r["ok"] = __same(__got, __exp)
        __r["got"] = repr(__got)[:300]
    except Exception as __e:
        __r["error"] = (type(__e).__name__ + ": " + str(__e))[:300]
    __results.append(__r)
__results_json = json.dumps(__results)
`;

/*
 * The worker. Built from a string so the handbook stays one file. It loads
 * Pyodide on its first message, runs cells in one namespace per part (so a
 * part is a notebook), and runs each problem's tests in a fresh namespace.
 */
export const WORKER = `var PY_URL = ${JSON.stringify(PYODIDE_URL)};
var HARNESS = ${JSON.stringify(HARNESS)};
var ready = null, py = null, spaces = {};
var NL = String.fromCharCode(10);
function boot(){
  if (!ready) ready = new Promise(function(resolve, reject){
    try { importScripts(PY_URL + "pyodide.js"); } catch (e) { reject(new Error("offline")); return; }
    loadPyodide({ indexURL: PY_URL }).then(function(p){ py = p; resolve(p); }, reject);
  });
  return ready;
}
function isProxy(v){ return !!(py && py.ffi && py.ffi.PyProxy && v instanceof py.ffi.PyProxy); }
self.onmessage = function(ev){
  var m = ev.data;
  boot().then(function(){
    self.postMessage({ id: m.id, started: true });
    var out = [];
    py.setStdout({ batched: function(s){ out.push(s); } });
    py.setStderr({ batched: function(s){ out.push(s); } });
    if (m.op === "run"){
      var ns = spaces[m.ns] || (spaces[m.ns] = py.globals.get("dict")());
      return py.runPythonAsync(m.code, { globals: ns }).then(function(r){
        var repr = null;
        if (r !== undefined && r !== null){
          if (isProxy(r)){ repr = String(py.globals.get("repr")(r)); r.destroy(); }
          else repr = typeof r === "string" ? JSON.stringify(r) : String(r);
        }
        self.postMessage({ id: m.id, ok: true, out: out.join(NL), repr: repr });
      });
    }
    var ns2 = py.globals.get("dict")();
    return py.runPythonAsync(m.code, { globals: ns2 }).then(function(){
      ns2.set("__fn_name", m.fn);
      ns2.set("__tests_json", JSON.stringify(m.tests));
      return py.runPythonAsync(HARNESS, { globals: ns2 });
    }).then(function(){
      var res = JSON.parse(String(ns2.get("__results_json")));
      ns2.destroy();
      self.postMessage({ id: m.id, ok: true, out: out.join(NL), results: res });
    });
  }).catch(function(e){
    var msg = String((e && e.message) || e);
    self.postMessage({ id: m.id, ok: false, offline: msg === "offline", error: msg });
  });
};
`;

export const LAB_JS = `
(function(){
"use strict";
var WORKER_SRC = ${JSON.stringify(WORKER)};
var LIMIT = 15000;
var KEY = "alfred:hb:" + (document.body.getAttribute("data-handbook") || "x") + ":";
var store = {
  get: function(k, d){ try { var v = localStorage.getItem(KEY + k); return v === null ? d : JSON.parse(v); } catch(e){ return d; } },
  set: function(k, v){ try { localStorage.setItem(KEY + k, JSON.stringify(v)); } catch(e){} }
};
function xp(key, pts, why){ try { document.dispatchEvent(new CustomEvent("hb:xp", { detail: { key: key, pts: pts, why: why } })); } catch(e){} }
function $$(s, r){ return Array.prototype.slice.call((r || document).querySelectorAll(s)); }

var worker = null, seq = 0, pending = {}, chain = Promise.resolve(), booted = false;
function spawn(){
  var url = URL.createObjectURL(new Blob([WORKER_SRC], { type: "text/javascript" }));
  worker = new Worker(url);
  worker.onmessage = function(ev){
    var m = ev.data, p = pending[m.id];
    if (!p) return;
    if (m.started){ booted = true; p.started(); return; }
    delete pending[m.id]; clearTimeout(p.timer); p.resolve(m);
  };
  worker.onerror = function(){
    Object.keys(pending).forEach(function(id){ clearTimeout(pending[id].timer); pending[id].resolve({ ok: false, error: "Python stopped unexpectedly." }); });
    pending = {}; worker = null;
  };
}
function call(msg, onStart){
  var run = function(){
    return new Promise(function(resolve){
      if (!worker) spawn();
      var id = ++seq, p = { resolve: resolve, timer: null };
      p.started = function(){
        if (onStart) onStart();
        p.timer = setTimeout(function(){
          if (worker) worker.terminate();
          worker = null; booted = false; delete pending[id];
          resolve({ ok: false, error: "Stopped after " + (LIMIT / 1000) + " seconds — an infinite loop, or too much work. Python restarted, so earlier cells need running again." });
        }, LIMIT);
      };
      pending[id] = p;
      msg.id = id;
      worker.postMessage(msg);
    });
  };
  var next = chain.then(run, run);
  chain = next.then(function(){}, function(){});
  return next;
}
var LOADING = "Loading Python — the first run downloads it (about 10 MB), then it is instant.";
var OFFLINE = "Python could not be loaded. Running code needs an internet connection the first time.";

/* ---------- notebook cells ---------- */
$$(".nb").forEach(function(nb){
  var ns = nb.getAttribute("data-ns") || "x";
  $$(".cell", nb).forEach(function(cell){
    var code = cell.querySelector(".cell-code"), bar = cell.querySelector(".cell-bar"), out = cell.querySelector(".cell-out");
    var st = cell.querySelector(".cell-st"), run = cell.querySelector(".run"), reset = cell.querySelector(".reset");
    if (!code || !bar || !out || !st || !run) return;
    bar.hidden = false;
    function go(){
      run.disabled = true;
      st.textContent = booted ? "Running…" : LOADING;
      call({ op: "run", ns: ns, code: code.value }, function(){ st.textContent = "Running…"; }).then(function(m){
        run.disabled = false;
        out.hidden = false;
        out.classList.toggle("err", !m.ok);
        var text = m.ok ? (m.out || "") + (m.repr !== null && m.repr !== undefined ? ((m.out ? "\\n" : "") + "→ " + m.repr) : "") : (m.offline ? OFFLINE : (m.out ? m.out + "\\n" : "") + m.error);
        out.textContent = text || "(no output)";
        st.textContent = m.ok ? "Done" : "Error";
        if (m.ok) xp("cell:" + cell.getAttribute("data-cell"), 5, "Ran a cell");
      });
    }
    run.addEventListener("click", go);
    if (reset) reset.addEventListener("click", function(){ code.value = code.defaultValue; st.textContent = "Reset"; });
    code.addEventListener("keydown", function(e){
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey || e.shiftKey)){ e.preventDefault(); go(); }
      if (e.key === "Tab" && !e.shiftKey){ e.preventDefault(); var s = code.selectionStart; code.setRangeText("    ", s, code.selectionEnd, "end"); }
    });
  });
});

/* ---------- practice problems ---------- */
var solved = store.get("solved", {});
$$(".prob").forEach(function(box){
  var id = box.getAttribute("data-prob") || "", fn = box.getAttribute("data-fn") || "", tests = [];
  try { tests = JSON.parse(box.getAttribute("data-tests") || "[]"); } catch(e){}
  var code = box.querySelector(".prob-code"), bar = box.querySelector(".cell-bar"), st = box.querySelector(".cell-st");
  var run = box.querySelector(".run"), reset = box.querySelector(".reset"), hint = box.querySelector(".hint");
  var res = box.querySelector(".prob-res"), chip = box.querySelector(".solved-chip");
  if (!code || !bar || !st || !run || !res) return;
  bar.hidden = false;
  var saved = store.get("code:" + id, null);
  if (typeof saved === "string" && saved.trim()) code.value = saved;
  function mark(){ if (chip) chip.hidden = !solved[id]; box.classList.toggle("solved", !!solved[id]); }
  mark();
  code.addEventListener("input", function(){ store.set("code:" + id, code.value); });
  function go(){
    run.disabled = true;
    st.textContent = booted ? "Running tests…" : LOADING;
    while (res.firstChild) res.removeChild(res.firstChild);
    call({ op: "test", fn: fn, code: code.value, tests: tests }, function(){ st.textContent = "Running tests…"; }).then(function(m){
      run.disabled = false;
      if (!m.ok){
        st.textContent = "Error";
        var li = document.createElement("li"); li.className = "bad";
        li.textContent = m.offline ? OFFLINE : m.error;
        res.appendChild(li);
        return;
      }
      var pass = 0;
      (m.results || []).forEach(function(r, i){
        var t = tests[i] || {}, li = document.createElement("li");
        li.className = r.ok ? "good" : "bad";
        if (r.ok) pass++;
        var head = (r.ok ? "✓ " : "✗ ") + "Test " + (i + 1) + (t.hidden ? " (hidden)" : "");
        var detail = t.hidden
          ? (r.ok ? "" : (r.error ? " — " + r.error : " — wrong answer"))
          : " — " + fn + "(" + t.args + ") → expected " + t.expected + (r.error ? ", raised " + r.error : ", got " + r.got);
        li.textContent = head + detail;
        res.appendChild(li);
      });
      var all = tests.length && pass === tests.length;
      st.textContent = pass + " / " + tests.length + " passed";
      if (all && !solved[id]){
        solved[id] = true; store.set("solved", solved); mark();
        xp("prob:" + id, 30, "Problem solved");
      }
    });
  }
  run.addEventListener("click", go);
  if (reset) reset.addEventListener("click", function(){ code.value = code.defaultValue; store.set("code:" + id, null); });
  code.addEventListener("keydown", function(e){
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey || e.shiftKey)){ e.preventDefault(); go(); }
    if (e.key === "Tab" && !e.shiftKey){ e.preventDefault(); var s = code.selectionStart; code.setRangeText("    ", s, code.selectionEnd, "end"); }
  });
  if (hint){
    var items = $$(".prob-hints li", box), shown = 0;
    hint.addEventListener("click", function(){
      if (shown < items.length){ items[shown].hidden = false; shown++; }
      hint.textContent = "Hint " + shown + "/" + items.length;
      if (shown >= items.length) hint.disabled = true;
    });
  }
});
})();
`;
