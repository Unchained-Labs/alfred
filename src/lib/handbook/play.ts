/*
 * Two things that make a handbook something you work through rather than
 * read: progress points, and a tutor you can ask about any passage.
 *
 * XP is deliberately modest — a level every hundred points and a study
 * streak, nothing that nags. Each action earns once (finishing a part,
 * watching a scene to its end, running a cell, solving a problem, knowing a
 * card), so there is nothing to farm. It lives in this browser's storage,
 * namespaced by handbook, like the rest of the page's state.
 *
 * The ask panel only exists on the live page. The route marks the document
 * with data-ask when it is served from Alfred; a downloaded copy has no such
 * attribute and no session to call with, so the button never appears there.
 */

export const ASK_HTML = `<button type="button" class="ask-fab" id="ask-fab" hidden aria-haspopup="dialog">Ask Alfred</button>
<button type="button" class="ask-sel" id="ask-sel" hidden>Ask about this</button>
<aside class="ask-panel" id="ask-panel" hidden role="dialog" aria-labelledby="ask-title">
  <header class="ask-h"><b id="ask-title">Ask Alfred</b><span class="ask-sub">Select any passage, then ask. Ask for a diagram and you get one.</span><button type="button" class="btn ask-x" id="ask-x" aria-label="Close">×</button></header>
  <div class="ask-log" id="ask-log"></div>
  <blockquote class="ask-quote" id="ask-quote" hidden></blockquote>
  <div class="ask-quick" role="group" aria-label="Quick questions">
    <button type="button" class="btn" data-ask-q="Explain this more simply, step by step.">Explain simpler</button>
    <button type="button" class="btn" data-ask-q="Show me this as an animated diagram or graph.">Draw it</button>
    <button type="button" class="btn" data-ask-q="Give me a concrete worked example.">Example</button>
    <button type="button" class="btn" data-ask-q="Ask me one interview question about this, then give the model answer.">Quiz me</button>
  </div>
  <form class="ask-form" id="ask-form">
    <textarea id="ask-q" rows="2" placeholder="Ask about the selection, or anything in this part…" aria-label="Your question"></textarea>
    <button type="submit" class="btn primary" id="ask-go">Ask</button>
  </form>
</aside>`;

export const XP_JS = `
(function(){
"use strict";
var KEY = "alfred:hb:" + (document.body.getAttribute("data-handbook") || "x") + ":";
var store = {
  get: function(k, d){ try { var v = localStorage.getItem(KEY + k); return v === null ? d : JSON.parse(v); } catch(e){ return d; } },
  set: function(k, v){ try { localStorage.setItem(KEY + k, JSON.stringify(v)); } catch(e){} }
};
var earned = store.get("xp", {}) || {}, days = store.get("days", []) || [];
var chip = document.getElementById("xp");
function pad(n){ return (n < 10 ? "0" : "") + n; }
function day(d){ return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
function total(){ var t = 0; for (var k in earned) if (Object.prototype.hasOwnProperty.call(earned, k)) t += Number(earned[k]) || 0; return t; }
function level(t){ return Math.floor(t / 100) + 1; }
function streak(){
  var set = {}; days.forEach(function(d){ set[d] = true; });
  var d = new Date(), n = 0;
  if (!set[day(d)]) d.setDate(d.getDate() - 1);
  while (set[day(d)]) { n++; d.setDate(d.getDate() - 1); }
  return n;
}
function render(){
  if (!chip) return;
  var t = total(), s = streak();
  chip.textContent = "Lv " + level(t) + " · " + t + " XP" + (s > 1 ? " · " + s + "-day streak" : "");
  chip.title = "Points for finishing parts (20), solving problems (30), watching scenes (10), running cells (5) and knowing cards (2). " + (100 - t % 100) + " to the next level.";
  chip.hidden = false;
}
function toast(msg){
  var el = document.getElementById("toast"); if (!el) return;
  el.textContent = msg; el.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(function(){ el.hidden = true; }, 2200);
}
document.addEventListener("hb:xp", function(e){
  var d = (e && e.detail) || {};
  if (!d.key || earned[d.key]) return;
  var before = level(total());
  earned[d.key] = Number(d.pts) || 0;
  store.set("xp", earned);
  var today = day(new Date());
  if (days.indexOf(today) < 0) { days.push(today); days = days.slice(-90); store.set("days", days); }
  render();
  var after = level(total());
  toast(after > before ? "Level " + after + " — nice." : "+" + d.pts + " XP · " + (d.why || ""));
});
render();
})();
`;

export const ASK_JS = `
(function(){
"use strict";
var url = document.body.getAttribute("data-ask");
if (!url || !/^https?:$/.test(location.protocol)) return;
var fab = document.getElementById("ask-fab"), sel = document.getElementById("ask-sel"), panel = document.getElementById("ask-panel");
var log = document.getElementById("ask-log"), quote = document.getElementById("ask-quote"), form = document.getElementById("ask-form");
var q = document.getElementById("ask-q"), go = document.getElementById("ask-go"), x = document.getElementById("ask-x");
if (!fab || !sel || !panel || !log || !quote || !form || !q || !go) return;
var main = document.querySelector("main");
var picked = { text: "", part: null };
fab.hidden = false;

function partOf(node){
  while (node && node.nodeType !== 1) node = node.parentNode;
  return node && node.closest ? node.closest("section.part, section.drills") : null;
}
function open(){
  panel.hidden = false; fab.setAttribute("aria-expanded", "true");
  document.documentElement.classList.add("ask-open");
  if (picked.text){ quote.textContent = picked.text.length > 400 ? picked.text.slice(0, 399) + "…" : picked.text; quote.hidden = false; }
  else quote.hidden = true;
  q.focus();
}
function close(){ panel.hidden = true; fab.setAttribute("aria-expanded", "false"); document.documentElement.classList.remove("ask-open"); fab.focus(); }
fab.addEventListener("click", function(){ panel.hidden ? open() : close(); });
if (x) x.addEventListener("click", close);
document.addEventListener("keydown", function(e){ if (e.key === "Escape" && !panel.hidden) close(); });

/* "Ask about this" follows a selection inside the handbook. */
function placeSel(){
  var s = window.getSelection ? window.getSelection() : null;
  var text = s && !s.isCollapsed ? String(s).trim() : "";
  if (!text || text.length < 3 || !main || !s.rangeCount || !main.contains(s.anchorNode) || panel.contains(s.anchorNode)){ sel.hidden = true; return; }
  var r = s.getRangeAt(0).getBoundingClientRect();
  sel.style.top = Math.max(8, r.top - 44) + "px";
  sel.style.left = Math.min(window.innerWidth - 150, Math.max(8, r.left + r.width / 2 - 60)) + "px";
  sel.hidden = false;
  sel._text = text.slice(0, 2000); sel._part = partOf(s.anchorNode);
}
document.addEventListener("mouseup", function(){ setTimeout(placeSel, 0); });
document.addEventListener("keyup", function(e){ if (e.shiftKey) placeSel(); });
document.addEventListener("selectionchange", function(){ var s = window.getSelection(); if (!s || s.isCollapsed) sel.hidden = true; });
window.addEventListener("scroll", function(){ sel.hidden = true; }, { passive: true });
sel.addEventListener("mousedown", function(e){ e.preventDefault(); });
sel.addEventListener("click", function(){ picked = { text: sel._text || "", part: sel._part || null }; sel.hidden = true; open(); });

function bubble(cls, text){ var d = document.createElement("div"); d.className = "ask-m " + cls; if (text) d.textContent = text; log.appendChild(d); log.scrollTop = log.scrollHeight; return d; }
function scene(host, sc){
  if (!sc || !window.AlfredScene) return;
  var fig = document.createElement("figure"); fig.className = "scene";
  fig.setAttribute("data-key", "ask-" + Date.now());
  var head = document.createElement("figcaption"); head.className = "scene-head";
  var t = document.createElement("span"); t.className = "scene-title"; t.textContent = sc.title || "";
  head.appendChild(t); fig.appendChild(head);
  ["scene-stage", "scene-say", "scene-ctl"].forEach(function(c){ var e = document.createElement(c === "scene-say" ? "p" : "div"); e.className = c; if (c === "scene-ctl") e.hidden = true; fig.appendChild(e); });
  if (sc.caption){ var cap = document.createElement("p"); cap.className = "scene-cap"; cap.textContent = sc.caption; fig.appendChild(cap); }
  host.appendChild(fig);
  window.AlfredScene.mount(fig, sc);
}
function ask(question){
  question = (question || "").trim();
  if (!question) return;
  // The selected passage's part, or else the part being read.
  var part = picked.part || document.querySelector("section.part.here");
  var title = part ? ((part.querySelector("h2") || {}).textContent || "") : "";
  var context = part ? (part.innerText || "").slice(0, 4000) : "";
  bubble("me", question);
  var wait = bubble("them wait", "Thinking…");
  go.disabled = true; q.value = "";
  fetch(url, {
    method: "POST", credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ question: question, selection: picked.text || "", part: title, context: context })
  }).then(function(r){ return r.json().then(function(d){ return { ok: r.ok, d: d }; }); })
    .then(function(res){
      wait.classList.remove("wait");
      if (!res.ok){ wait.textContent = (res.d && res.d.error) || "Alfred could not answer that."; wait.classList.add("err"); return; }
      wait.textContent = "";
      var body = document.createElement("div"); body.className = "ask-a";
      body.innerHTML = res.d.html || "";
      wait.appendChild(body);
      scene(wait, res.d.scene);
      log.scrollTop = log.scrollHeight;
    })
    .catch(function(){ wait.classList.remove("wait"); wait.classList.add("err"); wait.textContent = "Could not reach Alfred. Is the app still running?"; })
    .then(function(){ go.disabled = false; });
}
form.addEventListener("submit", function(e){ e.preventDefault(); ask(q.value); });
q.addEventListener("keydown", function(e){ if (e.key === "Enter" && !e.shiftKey){ e.preventDefault(); ask(q.value); } });
Array.prototype.forEach.call(panel.querySelectorAll(".ask-quick [data-ask-q]"), function(b){
  b.addEventListener("click", function(){ ask(b.getAttribute("data-ask-q")); });
});
})();
`;
