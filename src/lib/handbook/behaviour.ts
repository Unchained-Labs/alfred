/*
 * The handbook's own JavaScript, inlined into the document.
 *
 * All of it is progressive: the page is fully readable with scripting off, and
 * every stored value is a convenience (which part you finished, which cards you
 * know, the stories you drafted). Nothing here is required to render a word.
 *
 * Storage is namespaced by handbook id, so two handbooks for two applications
 * never share progress. Every access is wrapped — storage throws outright in a
 * private window with site data blocked, and a study aid is not worth taking
 * the page down for.
 */
export const HANDBOOK_JS = `
(function(){
"use strict";
var $ = function(s,r){return (r||document).querySelector(s);};
var $$ = function(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s));};
var KEY = "alfred:hb:" + (document.body.getAttribute("data-handbook") || "x") + ":";
var store = {
  get: function(k, d){ try { var v = localStorage.getItem(KEY+k); return v === null ? d : JSON.parse(v); } catch(e){ return d; } },
  set: function(k, v){ try { localStorage.setItem(KEY+k, JSON.stringify(v)); } catch(e){} }
};
var reduced = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
function toast(msg, ms){
  var t = $("#toast"); if(!t) return;
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(function(){ t.hidden = true; }, ms || 2600);
}

/* ---------- parts, rail, progress ---------- */
var parts = $$("section.part");
var railLinks = $$(".rail a[data-target]");
var boxes = $$("input.done");
var doneState = store.get("done", {});

function updateProgress(){
  var n = boxes.filter(function(b){ return b.checked; }).length;
  var fill = $("#prog-fill"), txt = $("#prog-txt");
  if (fill) fill.style.width = (boxes.length ? n / boxes.length * 100 : 0) + "%";
  if (txt) txt.textContent = n + "/" + boxes.length + " parts";
  railLinks.forEach(function(a){
    var b = document.querySelector('input.done[data-part="' + a.getAttribute("data-target") + '"]');
    a.classList.toggle("done", !!(b && b.checked));
  });
}
boxes.forEach(function(b){
  var id = b.getAttribute("data-part");
  b.checked = !!doneState[id];
  b.addEventListener("change", function(){
    doneState[id] = b.checked; store.set("done", doneState); updateProgress();
    if (b.checked) {
      var n = boxes.filter(function(x){ return x.checked; }).length;
      toast(n === boxes.length ? "Every part done. Now rest." : "Nice. " + n + " of " + boxes.length + ".",
            n === boxes.length ? 5000 : 1700);
    }
  });
});
updateProgress();

var current = 0;
function barH(){ var b = $(".bar"); return b ? b.getBoundingClientRect().height : 0; }
function mark(i){
  current = i;
  parts.forEach(function(p, j){ p.classList.toggle("here", j === i); });
  railLinks.forEach(function(a, j){ a.classList.toggle("here", j === i); });
  var nav = $(".rail");
  if (nav && nav.scrollWidth > nav.clientWidth + 4 && railLinks[i]) {
    nav.scrollTo({ left: Math.max(0, railLinks[i].parentElement.offsetLeft - 16),
                   behavior: reduced ? "auto" : "smooth" });
  }
}
function goTo(i, scroll){
  i = Math.max(0, Math.min(parts.length - 1, i));
  mark(i); store.set("cur", i);
  if (scroll && parts[i]) {
    var top = parts[i].getBoundingClientRect().top + window.scrollY - barH() - 6;
    window.scrollTo({ top: Math.max(0, top), behavior: reduced ? "auto" : "smooth" });
  }
}
parts.forEach(function(p, i){
  var nx = $(".next", p), pv = $(".prev", p);
  if (nx) nx.addEventListener("click", function(){ goTo(i + 1, true); });
  if (pv) pv.addEventListener("click", function(){ goTo(i - 1, true); });
});
document.addEventListener("click", function(e){
  var a = e.target.closest ? e.target.closest('a[href^="#"]') : null;
  if (!a) return;
  var id = a.getAttribute("href").slice(1);
  var idx = -1;
  parts.forEach(function(p, i){ if (p.id === id) idx = i; });
  if (idx < 0) return;
  e.preventDefault(); goTo(idx, true);
  try { history.replaceState(null, "", "#" + id); } catch(_){}
});
if (window.IntersectionObserver) {
  var io = new IntersectionObserver(function(entries){
    if (document.body.classList.contains("focus")) return;
    entries.forEach(function(en){
      if (!en.isIntersecting) return;
      var i = parts.indexOf(en.target);
      if (i >= 0 && i !== current) mark(i);
    });
  }, { rootMargin: "-30% 0px -65% 0px" });
  parts.forEach(function(p){ io.observe(p); });
}

/* ---------- toggles ---------- */
var tg = { tldr: store.get("tldr", false), focus: store.get("focus", false) };
function applyToggles(){
  document.body.classList.toggle("tldr-only", tg.tldr);
  document.body.classList.toggle("focus", tg.focus);
  $("#t-tldr").setAttribute("aria-pressed", String(tg.tldr));
  $("#t-focus").setAttribute("aria-pressed", String(tg.focus));
}
$("#t-tldr").addEventListener("click", function(){
  tg.tldr = !tg.tldr; store.set("tldr", tg.tldr); applyToggles();
});
$("#t-focus").addEventListener("click", function(){
  tg.focus = !tg.focus; store.set("focus", tg.focus); applyToggles(); goTo(current, true);
});
applyToggles();

/* ---------- theme ---------- */
var saved = store.get("theme", null);
if (saved) document.documentElement.setAttribute("data-theme", saved);
$("#t-theme").addEventListener("click", function(){
  var cur = document.documentElement.getAttribute("data-theme");
  var sysDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  var next = cur ? (cur === "dark" ? "light" : "dark") : (sysDark ? "light" : "dark");
  document.documentElement.setAttribute("data-theme", next);
  store.set("theme", next);
});

$("#t-print").addEventListener("click", function(){ window.print(); });

/* ---------- 25-minute sprint ---------- */
(function(){
  var btn = $("#t-timer"), LEN = 25 * 60, left = LEN, endAt = 0, id = null;
  function fmt(s){ return String(Math.floor(s/60)) + ":" + ("0" + (s%60)).slice(-2); }
  function render(){ btn.textContent = (id ? "❚❚ " : "▶ ") + fmt(left); btn.classList.toggle("run", !!id); }
  btn.addEventListener("click", function(){
    if (id) { clearInterval(id); id = null; render(); return; }
    endAt = Date.now() + left * 1000;
    id = setInterval(function(){
      left = Math.max(0, Math.ceil((endAt - Date.now())/1000));
      if (left <= 0) { clearInterval(id); id = null; left = LEN;
        toast("Sprint done. Stand up, get some water.", 7000); }
      render();
    }, 500);
    render();
  });
  render();
})();

/* ---------- flashcards ---------- */
(function(){
  var host = $("#fc"); if (!host) return;
  var data = $$("#fc-data > div").map(function(d){
    return { cat: d.getAttribute("data-cat") || "", q: d.getAttribute("data-q") || "", a: d.innerHTML };
  });
  if (!data.length) return;
  var order = data.map(function(_, i){ return i; });
  var cat = "*", idx = 0;
  var known = {};
  (store.get("known", []) || []).forEach(function(i){ known[i] = true; });

  function deck(){ return order.filter(function(i){ return cat === "*" || data[i].cat === cat; }); }
  function show(){
    var d = deck();
    host.setAttribute("data-face", "q");
    if (!d.length) { $("#fc-q").textContent = "No cards here."; $("#fc-a").innerHTML = ""; $("#fc-k").textContent = ""; $("#fc-count").textContent = "0 cards"; return; }
    if (idx >= d.length) idx = 0;
    if (idx < 0) idx = d.length - 1;
    var c = data[d[idx]];
    $("#fc-k").textContent = c.cat + (known[d[idx]] ? " · got it ✓" : "");
    $("#fc-q").textContent = c.q;
    $("#fc-a").innerHTML = c.a;
    var n = Object.keys(known).length;
    $("#fc-count").textContent = "Card " + (idx+1) + " of " + d.length + " · " + n + " of " + data.length + " marked";
  }
  function flip(){ host.setAttribute("data-face", host.getAttribute("data-face") === "q" ? "a" : "q"); }
  host.addEventListener("click", flip);
  host.addEventListener("keydown", function(e){
    if (e.key === " " || e.key === "Enter") { e.preventDefault(); flip(); }
    else if (e.key === "ArrowRight") { idx++; show(); }
    else if (e.key === "ArrowLeft") { idx--; show(); }
  });
  $("#fc-next").addEventListener("click", function(){ idx++; show(); });
  $("#fc-prev").addEventListener("click", function(){ idx--; show(); });
  $("#fc-got").addEventListener("click", function(){
    var d = deck(); if (!d.length) return;
    known[d[idx]] = true;
    store.set("known", Object.keys(known).map(Number));
    idx++; show();
  });
  $("#fc-shuffle").addEventListener("click", function(){
    for (var i = order.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i+1)), t = order[i]; order[i] = order[j]; order[j] = t;
    }
    idx = 0; show();
  });
  $$(".fc-cats button").forEach(function(b){
    b.addEventListener("click", function(){
      cat = b.getAttribute("data-cat"); idx = 0;
      $$(".fc-cats button").forEach(function(x){ x.setAttribute("aria-pressed", String(x === b)); });
      show();
    });
  });
  show();
})();

/* ---------- glossary filter ---------- */
(function(){
  var input = $("#gl-find"), list = $("#gl"); if (!input || !list) return;
  var kids = Array.prototype.slice.call(list.children);
  var rows = [];
  for (var i = 0; i < kids.length; i += 2) {
    rows.push([kids[i], kids[i+1], ((kids[i].textContent||"") + " " + ((kids[i+1]||{}).textContent||"")).toLowerCase()]);
  }
  input.addEventListener("input", function(){
    var q = input.value.trim().toLowerCase();
    rows.forEach(function(r){
      var off = q && r[2].indexOf(q) < 0;
      r[0].classList.toggle("off", !!off);
      if (r[1]) r[1].classList.toggle("off", !!off);
    });
  });
})();

/* ---------- story bank ---------- */
(function(){
  var areas = $$("[data-story-input]"); if (!areas.length) return;
  var saved = store.get("stories", {}) || {};
  areas.forEach(function(ta){
    var i = ta.getAttribute("data-story-input");
    var box = ta.closest("details");
    ta.value = saved[i] || "";
    if (box) box.classList.toggle("filled", !!ta.value.trim());
    ta.addEventListener("input", function(){
      saved[i] = ta.value; store.set("stories", saved);
      if (box) box.classList.toggle("filled", !!ta.value.trim());
    });
  });
  var copy = $("#stories-copy"); if (!copy) return;
  copy.addEventListener("click", function(){
    var text = areas.map(function(ta){
      var sum = ta.closest("details").querySelector("summary span:nth-child(2)");
      return "## " + (sum ? sum.textContent : "Story") + "\\n" + (ta.value.trim() || "(empty)") + "\\n";
    }).join("\\n");
    var msg = $("#stories-msg");
    function fallback(){
      ta_all(text);
      msg.textContent = "Copying is blocked here — the text below is selected.";
    }
    function ta_all(t){
      var box = $("#stories-all");
      if (!box) {
        box = document.createElement("textarea");
        box.id = "stories-all";
        box.setAttribute("aria-label", "All stories as text");
        box.style.cssText = "width:100%;min-height:200px;margin-top:8px;font:.8rem/1.5 var(--f-mono);background:var(--surface);color:var(--ink);border:1px solid var(--line);border-radius:8px;padding:10px";
        msg.parentElement.appendChild(box);
      }
      box.value = t; box.focus(); box.select();
    }
    try {
      if (!navigator.clipboard) throw new Error("no clipboard");
      navigator.clipboard.writeText(text).then(function(){ msg.textContent = "Copied."; }, fallback);
    } catch(e) { fallback(); }
  });
})();

/* ---------- checklists ---------- */
(function(){
  var saved = store.get("checks", {}) || {};
  $$("[data-check]").forEach(function(c){
    var k = c.getAttribute("data-check");
    c.checked = !!saved[k];
    c.addEventListener("change", function(){ saved[k] = c.checked; store.set("checks", saved); });
  });
})();

/* ---------- where we were ---------- */
(function(){
  var h = (location.hash || "").slice(1), hi = -1;
  parts.forEach(function(p, i){ if (p.id === h) hi = i; });
  if (hi >= 0) goTo(hi, true);
  else if (tg.focus) goTo(store.get("cur", 0), false);
  else mark(0);
})();
})();
`;
