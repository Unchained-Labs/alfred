import {
  type HandbookScene,
  handbookSceneSchema,
  type SceneKind,
} from "@/lib/ai/schemas";
import { escapeHtml } from "./markdown";

/*
 * Scenes: animated explainers, drawn from data.
 *
 * The model describes a scene — a kind, some starting data, and what changes
 * at each step with a line of narration — and this file plus SCENE_JS draw it
 * as a step-through animation with play, pause, step and scrub.
 *
 * The same rule as the diagrams holds, harder: nothing generated is ever
 * markup. The server writes the scene as JSON into ONE attribute, through
 * escapeHtml, and the player builds every SVG element with createElementNS and
 * sets every label with textContent. There is no innerHTML anywhere in the
 * player, so a caption that says <script> is shown as the word.
 *
 * Without JavaScript a scene degrades to its numbered narration, which is
 * still a decent explanation — the steps were written to be read.
 */

const KIND_LABEL: Record<SceneKind, string> = {
  array: "array",
  stack: "stack",
  queue: "queue",
  linked_list: "linked list",
  heap: "heap",
  hashmap: "hash map",
  tree: "tree",
  graph: "graph",
  grid: "table",
  sequence: "request flow",
  state_machine: "state machine",
  plot: "plot",
  bars: "chart",
};

/* Hard ceilings, applied after validation: a scene is drawn on a phone. */
const MAX_STEPS = 14;
const MAX_ITEMS = 16;
const MAX_NODES = 12;
const MAX_POINTS = 80;
const MAX_TEXT = 240;

const cut = (s: string, n = MAX_TEXT) =>
  s.length > n ? `${s.slice(0, n - 1)}…` : s;

/**
 * Validates and bounds a scene. Returns null for anything that does not match
 * the schema — stored content and answers both pass through here, so a
 * malformed scene is dropped rather than half drawn.
 */
export function cleanScene(value: unknown): HandbookScene | null {
  const parsed = handbookSceneSchema.safeParse(value);
  if (!parsed.success) return null;
  const s = parsed.data;
  if (!s.steps.length) return null;
  const nodes = s.nodes
    .slice(0, MAX_NODES)
    .map((n) => ({ id: cut(n.id, 40), label: cut(n.label, 40) }));
  const ids = new Set(nodes.map((n) => n.id));
  return {
    ...s,
    title: cut(s.title, 120),
    caption: cut(s.caption),
    items: s.items.slice(0, MAX_ITEMS).map((v) => cut(v, 24)),
    nodes,
    // An edge to a node that is not there is dropped, not trusted.
    edges: s.edges
      .filter((e) => ids.has(e.from) && ids.has(e.to))
      .slice(0, 40)
      .map((e) => ({ ...e, label: cut(e.label, 30) })),
    grid: s.grid
      ? {
          rows: s.grid.rows.slice(0, MAX_ITEMS).map((v) => cut(v, 16)),
          cols: s.grid.cols.slice(0, MAX_ITEMS).map((v) => cut(v, 16)),
        }
      : null,
    series: s.series.slice(0, 3).map((x) => ({
      label: cut(x.label, 40),
      points: x.points
        .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
        .slice(0, MAX_POINTS),
    })),
    steps: s.steps.slice(0, MAX_STEPS).map((st) => ({
      ...st,
      caption: cut(st.caption),
      values: st.values.slice(0, MAX_ITEMS).map((v) => cut(v, 24)),
      highlight: st.highlight.slice(0, 24).map((v) => cut(v, 40)),
      visited: st.visited.slice(0, 24).map((v) => cut(v, 40)),
      pointers: st.pointers
        .slice(0, 4)
        .map((p) => ({ ...p, label: cut(p.label, 8) })),
      cells: st.cells.slice(0, 144).map((c) => ({ ...c, value: cut(c.value, 10) })),
      entries: st.entries
        .slice(0, 16)
        .map((e) => ({ ...e, key: cut(e.key, 14), value: cut(e.value, 14) })),
      message: st.message
        ? { ...st.message, label: cut(st.message.label, 40) }
        : null,
      marker: st.marker ? { ...st.marker, label: cut(st.marker.label, 40) } : null,
    })),
  };
}

/**
 * One scene's figure. The JSON goes in a single escaped attribute; the
 * narration is also written out as a plain list, which is what a reader
 * without scripting (or a printer) gets.
 */
export function renderScene(value: unknown, key: string): string {
  const scene = cleanScene(value);
  if (!scene) return "";
  const steps = scene.steps
    .map((s) => `<li>${escapeHtml(s.caption)}</li>`)
    .join("");
  return `<figure class="scene" data-scene="${escapeHtml(JSON.stringify(scene))}" data-key="${escapeHtml(key)}">
  <figcaption class="scene-head">
    <span class="scene-title">${escapeHtml(scene.title)}</span>
    <span class="scene-tag">${escapeHtml(KIND_LABEL[scene.kind])} · ${scene.steps.length} steps</span>
  </figcaption>
  <div class="scene-stage"></div>
  <p class="scene-say" aria-live="polite"></p>
  <div class="scene-ctl" hidden></div>
  <ol class="scene-steps">${steps}</ol>
  ${scene.caption.trim() ? `<p class="scene-cap">${escapeHtml(scene.caption)}</p>` : ""}
</figure>`;
}

export function renderScenes(
  scenes: unknown[] | undefined,
  keyPrefix: string,
): string {
  return (scenes ?? [])
    .map((s, i) => renderScene(s, `${keyPrefix}-s${i}`))
    .filter(Boolean)
    .join("");
}

/*
 * The player. Plain ES5 so the downloaded file runs anywhere, and exposed as
 * window.AlfredScene.mount so the ask panel can draw a scene that arrived
 * in an answer with exactly the same code.
 */
export const SCENE_JS = `
(function(){
"use strict";
var NS = "http://www.w3.org/2000/svg";
var reduced = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
function el(tag, attrs, text){
  var e = document.createElementNS(NS, tag);
  if (attrs) for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) e.setAttribute(k, String(attrs[k]));
  if (text !== undefined && text !== null) e.textContent = String(text);
  return e;
}
function h(tag, cls, text){
  var e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined && text !== null) e.textContent = String(text);
  return e;
}
function has(list, v){ return (list || []).indexOf(String(v)) >= 0; }
function num(v){ var n = parseFloat(v); return isFinite(n) ? n : 0; }

/* ---------- cumulative state per step ---------- */
function frames(sc){
  var out = [], values = (sc.items || []).slice(), visited = {}, cells = {}, entries = [], msgs = [], marks = [];
  for (var i = 0; i < sc.steps.length; i++){
    var st = sc.steps[i];
    if (st.values && st.values.length) values = st.values.slice();
    var fresh = {};
    (st.visited || []).forEach(function(v){ visited[v] = true; });
    (st.cells || []).forEach(function(c){ cells[c.row + "," + c.col] = c.value; fresh[c.row + "," + c.col] = true; });
    (st.entries || []).forEach(function(e){
      var found = false;
      entries.forEach(function(x){ if (x.key === e.key){ x.value = e.value; x.bucket = e.bucket; found = true; } });
      if (!found) entries.push({ key: e.key, value: e.value, bucket: e.bucket });
      fresh["k:" + e.key] = true;
    });
    if (st.message) msgs.push(st.message);
    if (st.marker) marks.push(st.marker);
    out.push({
      caption: st.caption, values: values.slice(), highlight: st.highlight || [],
      visited: Object.keys(visited), pointers: st.pointers || [], range: st.range,
      cells: JSON.parse(JSON.stringify(cells)), entries: JSON.parse(JSON.stringify(entries)),
      msgs: msgs.slice(), marks: marks.slice(), fresh: fresh
    });
  }
  return out;
}

/* ---------- drawing, one function per kind ---------- */
var CW = 54, CH = 44;

function svgOf(w, hgt, label){
  return el("svg", { viewBox: "0 0 " + w + " " + hgt, width: w, height: hgt, role: "img", "aria-label": label, "class": "sc-svg" });
}
function box(g, x, y, w, hgt, text, cls){
  g.appendChild(el("rect", { x: x, y: y, width: w, height: hgt, rx: 7, "class": "sc-box " + (cls || "") }));
  g.appendChild(el("text", { x: x + w / 2, y: y + hgt / 2 + 5, "text-anchor": "middle", "class": "sc-t" }, text));
}
function arrow(g, x1, y1, x2, y2, cls){
  g.appendChild(el("line", { x1: x1, y1: y1, x2: x2, y2: y2, "class": "sc-edge " + (cls || ""), "marker-end": "url(#sc-arr)" }));
}
function defs(svg){
  var d = el("defs");
  var m = el("marker", { id: "sc-arr", viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse" });
  m.appendChild(el("path", { d: "M0 0 L10 5 L0 10 z", "class": "sc-head" }));
  d.appendChild(m); svg.appendChild(d);
}

function drawRow(sc, f, kind){
  var vals = f.values, n = Math.max(vals.length, 1);
  var gap = kind === "linked_list" ? 34 : 6;
  var x0 = 24, y = 46;
  var w = x0 * 2 + n * CW + (n - 1) * gap + (kind === "linked_list" ? 50 : 0);
  var svg = svgOf(Math.max(w, 260), 150, sc.title); defs(svg);
  var g = el("g");
  if (kind === "array" && f.range){
    var a = Math.max(0, f.range.from), b = Math.min(vals.length - 1, f.range.to);
    if (b >= a) g.appendChild(el("rect", { x: x0 + a * (CW + gap) - 5, y: y - 8, width: (b - a + 1) * (CW + gap) - gap + 10, height: CH + 16, rx: 10, "class": "sc-window" }));
  }
  vals.forEach(function(v, i){
    var x = x0 + i * (CW + gap);
    box(g, x, y, CW, CH, v, has(f.highlight, i) ? "hot pop" : "");
    g.appendChild(el("text", { x: x + CW / 2, y: y + CH + 16, "text-anchor": "middle", "class": "sc-i" }, i));
    if (kind === "linked_list") arrow(g, x + CW + 2, y + CH / 2, x + CW + gap - 3, y + CH / 2);
  });
  if (kind === "linked_list") g.appendChild(el("text", { x: x0 + vals.length * (CW + gap) + 4, y: y + CH / 2 + 5, "class": "sc-i" }, "null"));
  if (kind === "queue" && vals.length){
    g.appendChild(el("text", { x: x0, y: y - 14, "class": "sc-i" }, "front"));
    g.appendChild(el("text", { x: x0 + (vals.length - 1) * (CW + gap) + CW, y: y - 14, "text-anchor": "end", "class": "sc-i" }, "back"));
  }
  var stacked = {};
  (f.pointers || []).forEach(function(p){
    if (p.index < 0 || p.index >= Math.max(vals.length, 1)) return;
    var k = stacked[p.index] = (stacked[p.index] || 0) + 1;
    var x = x0 + p.index * (CW + gap) + CW / 2, py = y + CH + 22 + (k - 1) * 18;
    var pg = el("g", { "class": "sc-ptr" });
    pg.appendChild(el("path", { d: "M" + x + " " + (py + 2) + " l-5 8 h10 z", "class": "sc-ptr-a" }));
    pg.appendChild(el("text", { x: x + 9, y: py + 11, "class": "sc-ptr-t" }, p.label));
    g.appendChild(pg);
  });
  svg.appendChild(g);
  return svg;
}

function drawStack(sc, f){
  var vals = f.values, n = Math.max(vals.length, 1);
  var hgt = 40 + n * (CH + 6) + 20, w = 240;
  var svg = svgOf(w, hgt, sc.title), g = el("g");
  vals.forEach(function(v, i){
    var y = hgt - 30 - (i + 1) * (CH + 6);
    box(g, 70, y, 110, CH, v, has(f.highlight, i) ? "hot pop" : "");
    if (i === vals.length - 1) g.appendChild(el("text", { x: 190, y: y + CH / 2 + 5, "class": "sc-i" }, "← top"));
  });
  g.appendChild(el("line", { x1: 60, y1: hgt - 26, x2: 190, y2: hgt - 26, "class": "sc-base" }));
  svg.appendChild(g);
  return svg;
}

function drawHeap(sc, f){
  var vals = f.values, n = vals.length, depth = Math.max(1, Math.ceil(Math.log(n + 1) / Math.LN2));
  var w = Math.max(320, Math.pow(2, depth - 1) * 64), hgt = depth * 70 + 90;
  var svg = svgOf(w, hgt, sc.title), g = el("g");
  function pos(i){ var d = Math.floor(Math.log(i + 1) / Math.LN2), p = i - (Math.pow(2, d) - 1), slots = Math.pow(2, d); return { x: (p + 0.5) * w / slots, y: 34 + d * 70 }; }
  for (var i = 1; i < n; i++){ var a = pos(Math.floor((i - 1) / 2)), b = pos(i); g.appendChild(el("line", { x1: a.x, y1: a.y, x2: b.x, y2: b.y, "class": "sc-edge" })); }
  vals.forEach(function(v, i){ var p = pos(i); node(g, p.x, p.y, v, has(f.highlight, i) ? "hot pop" : ""); });
  var cw = Math.min(40, (w - 20) / Math.max(n, 1));
  vals.forEach(function(v, i){
    var x = 10 + i * cw;
    g.appendChild(el("rect", { x: x, y: hgt - 44, width: cw - 3, height: 26, rx: 5, "class": "sc-box " + (has(f.highlight, i) ? "hot" : "") }));
    g.appendChild(el("text", { x: x + (cw - 3) / 2, y: hgt - 26, "text-anchor": "middle", "class": "sc-t sm" }, v));
  });
  svg.appendChild(g);
  return svg;
}

function node(g, x, y, label, cls){
  g.appendChild(el("circle", { cx: x, cy: y, r: 21, "class": "sc-node " + (cls || "") }));
  g.appendChild(el("text", { x: x, y: y + 5, "text-anchor": "middle", "class": "sc-t sm" }, label));
}

function drawHash(sc, f){
  var buckets = Math.max((sc.items || []).length, 1);
  f.entries.forEach(function(e){ if (e.bucket + 1 > buckets) buckets = e.bucket + 1; });
  buckets = Math.min(buckets, 16);
  var rows = {}, maxChain = 1;
  f.entries.forEach(function(e){ (rows[e.bucket] = rows[e.bucket] || []).push(e); maxChain = Math.max(maxChain, rows[e.bucket].length); });
  var hgt = 20 + buckets * 40, w = 90 + maxChain * 120 + 20;
  var svg = svgOf(w, hgt, sc.title); defs(svg); var g = el("g");
  for (var b = 0; b < buckets; b++){
    var y = 12 + b * 40;
    box(g, 10, y, 50, 30, (sc.items && sc.items[b]) || b, "bucket");
    (rows[b] || []).forEach(function(e, j){
      var x = 90 + j * 120;
      arrow(g, j === 0 ? 62 : x - 12, y + 15, x - 2, y + 15);
      box(g, x, y, 104, 30, e.key + ": " + e.value, (has(f.highlight, e.key) ? "hot " : "") + (f.fresh["k:" + e.key] ? "pop" : ""));
    });
  }
  svg.appendChild(g);
  return svg;
}

function drawTree(sc, f){
  var nodes = sc.nodes, kids = {}, parent = {};
  sc.edges.forEach(function(e){ (kids[e.from] = kids[e.from] || []).push(e.to); parent[e.to] = e.from; });
  var root = nodes.filter(function(n){ return !parent[n.id]; })[0] || nodes[0];
  if (!root) return null;
  var pos = {}, leaf = 0, maxD = 0, seen = {};
  (function walk(id, d){
    if (seen[id]) return; seen[id] = true; maxD = Math.max(maxD, d);
    var c = kids[id] || [];
    if (!c.length){ pos[id] = { x: leaf++, d: d }; return; }
    c.forEach(function(k){ walk(k, d + 1); });
    var xs = c.filter(function(k){ return pos[k]; }).map(function(k){ return pos[k].x; });
    pos[id] = { x: xs.length ? (Math.min.apply(null, xs) + Math.max.apply(null, xs)) / 2 : leaf++, d: d };
  })(root.id, 0);
  var w = Math.max(280, leaf * 66 + 40), hgt = (maxD + 1) * 76 + 30;
  var svg = svgOf(w, hgt, sc.title), g = el("g");
  var P = function(id){ return { x: 30 + pos[id].x * 66 + 10, y: 34 + pos[id].d * 76 }; };
  sc.edges.forEach(function(e){ if (pos[e.from] && pos[e.to]){ var a = P(e.from), b = P(e.to); g.appendChild(el("line", { x1: a.x, y1: a.y, x2: b.x, y2: b.y, "class": "sc-edge" })); } });
  nodes.forEach(function(n){ if (!pos[n.id]) return; var p = P(n.id); node(g, p.x, p.y, n.label, cls(f, n.id)); });
  svg.appendChild(g);
  return svg;
}
function cls(f, id){ return has(f.highlight, id) ? "hot pop" : (has(f.visited, id) ? "done" : ""); }

/* Rough width of mono text at the scene font size: labels are sized to fit. */
function textW(t, px){ return String(t == null ? "" : t).length * (px || 7.4); }

function drawGraph(sc, f, directed){
  var nodes = sc.nodes, n = nodes.length;
  // Single letters stay circles (a BFS over a, b, c); anything wordier becomes
  // a pill sized to its label, so "Recovery job" is not written over a dot.
  var wordy = nodes.some(function(nd){ return String(nd.label).length > 3; });
  var dims = {}, widest = 44;
  nodes.forEach(function(nd){
    var bw = wordy ? Math.max(48, textW(nd.label) + 20) : 42;
    dims[nd.id] = { w: bw, h: wordy ? 30 : 42 }; widest = Math.max(widest, bw);
  });
  var w = wordy ? Math.max(520, widest * 2 + 260) : 460, hgt = wordy ? 340 : 320;
  var cx = w / 2, cy = hgt / 2, rx = cx - widest / 2 - 12, ry = cy - 34;
  var svg = svgOf(w, hgt, sc.title); defs(svg); var g = el("g"), labels = el("g"), at = {};
  nodes.forEach(function(nd, i){ var a = -Math.PI / 2 + i * 2 * Math.PI / Math.max(n, 1); at[nd.id] = { x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) }; });
  // How far from a node's centre an edge leaves it, along (ux, uy).
  function reach(id, ux, uy){
    var d = dims[id];
    if (!wordy) return 22;
    var tx = Math.abs(ux) > 1e-6 ? (d.w / 2) / Math.abs(ux) : 1e9, ty = Math.abs(uy) > 1e-6 ? (d.h / 2) / Math.abs(uy) : 1e9;
    return Math.min(tx, ty) + 2;
  }
  sc.edges.forEach(function(e){
    var a = at[e.from], b = at[e.to]; if (!a || !b) return;
    var lit = has(f.highlight, e.from) && has(f.highlight, e.to);
    var t = e.label || (e.weight !== null && e.weight !== undefined ? String(e.weight) : "");
    if (e.from === e.to){
      var top = a.y - dims[e.from].h / 2;
      g.appendChild(el("path", { d: "M" + (a.x - 10) + " " + top + " c-26 -40 46 -40 20 0", "class": "sc-edge" + (lit ? " lit" : ""), "marker-end": directed ? "url(#sc-arr)" : "" }));
      if (t) labels.appendChild(el("text", { x: a.x, y: top - 34, "text-anchor": "middle", "class": "sc-e" + (lit ? " lit" : "") }, t));
      return;
    }
    var dx = b.x - a.x, dy = b.y - a.y, L = Math.sqrt(dx * dx + dy * dy) || 1, ux = dx / L, uy = dy / L;
    var line = el("line", { x1: a.x + ux * reach(e.from, ux, uy), y1: a.y + uy * reach(e.from, ux, uy), x2: b.x - ux * (reach(e.to, ux, uy) + 2), y2: b.y - uy * (reach(e.to, ux, uy) + 2), "class": "sc-edge" + (lit ? " lit" : "") });
    if (directed) line.setAttribute("marker-end", "url(#sc-arr)");
    g.appendChild(line);
    // The label sits beside its edge, not on it, and on the side away from
    // the reverse edge, so A→B and B→A do not print over each other.
    if (t) labels.appendChild(el("text", { x: (a.x + b.x) / 2 - uy * 10, y: (a.y + b.y) / 2 + ux * 10 + 4, "text-anchor": "middle", "class": "sc-e" + (lit ? " lit" : "") }, t));
  });
  nodes.forEach(function(nd){
    var p = at[nd.id], d = dims[nd.id];
    if (!wordy) return node(g, p.x, p.y, nd.label, cls(f, nd.id));
    g.appendChild(el("rect", { x: p.x - d.w / 2, y: p.y - d.h / 2, width: d.w, height: d.h, rx: d.h / 2, "class": "sc-node " + cls(f, nd.id) }));
    g.appendChild(el("text", { x: p.x, y: p.y + 4, "text-anchor": "middle", "class": "sc-t sm" }, nd.label));
  });
  // Labels last, so no node or edge is drawn over one.
  g.appendChild(labels);
  svg.appendChild(g);
  return svg;
}

function drawGrid(sc, f){
  var rows = (sc.grid && sc.grid.rows) || [], cols = (sc.grid && sc.grid.cols) || [];
  if (!rows.length || !cols.length) return null;
  // Columns as wide as the longest thing that will ever sit in them — a DP
  // table of digits stays tight, a table of "started" does not overflow.
  var widest = cols.map(function(c){ return textW(c, 6.8); });
  (sc.steps || []).forEach(function(st){ (st.cells || []).forEach(function(c){ if (c.col >= 0 && c.col < cols.length) widest[c.col] = Math.max(widest[c.col], textW(c.value)); }); });
  var cw = widest.map(function(x){ return Math.min(150, Math.max(46, x + 16)); });
  var cx = [], acc = 0; cw.forEach(function(x){ cx.push(acc); acc += x; });
  var ch = 32, lx = Math.max(64, Math.min(140, Math.max.apply(null, rows.map(function(r){ return textW(r, 6.8); })) + 16)), ty = 30;
  var svg = svgOf(lx + acc + 10, ty + rows.length * ch + 10, sc.title), g = el("g");
  cols.forEach(function(c, j){ g.appendChild(el("text", { x: lx + cx[j] + cw[j] / 2, y: 20, "text-anchor": "middle", "class": "sc-i" }, c)); });
  rows.forEach(function(r, i){
    g.appendChild(el("text", { x: lx - 8, y: ty + i * ch + ch / 2 + 4, "text-anchor": "end", "class": "sc-i" }, r));
    cols.forEach(function(c, j){
      var k = i + "," + j, v = f.cells[k];
      var c2 = (has(f.highlight, k) ? "hot " : "") + (f.fresh[k] ? "pop" : "") + (v === undefined ? " empty" : "");
      g.appendChild(el("rect", { x: lx + cx[j], y: ty + i * ch, width: cw[j] - 2, height: ch - 2, rx: 4, "class": "sc-box " + c2 }));
      if (v !== undefined) g.appendChild(el("text", { x: lx + cx[j] + cw[j] / 2 - 1, y: ty + i * ch + ch / 2 + 4, "text-anchor": "middle", "class": "sc-t sm" }, v));
    });
  });
  svg.appendChild(g);
  return svg;
}

function drawSequence(sc, f){
  var ps = sc.nodes, n = ps.length; if (!n) return null;
  var colW = 120, w = Math.max(300, n * colW), msgs = f.msgs, hgt = 70 + Math.max(msgs.length, 1) * 40 + 20;
  var svg = svgOf(w, hgt, sc.title); defs(svg); var g = el("g"), col = {};
  ps.forEach(function(p, i){
    var x = i * colW + colW / 2; col[p.id] = x;
    box(g, x - 50, 8, 100, 32, p.label, has(f.highlight, p.id) ? "hot" : "");
    g.appendChild(el("line", { x1: x, y1: 40, x2: x, y2: hgt - 8, "class": "sc-life" }));
  });
  msgs.forEach(function(m, i){
    var a = col[m.from], b = col[m.to]; if (a === undefined || b === undefined) return;
    var y = 66 + i * 40, last = i === msgs.length - 1;
    if (a === b){
      g.appendChild(el("path", { d: "M" + a + " " + (y - 8) + " h30 v16 h-28", "class": "sc-edge" + (last ? " lit draw" : " old"), "marker-end": "url(#sc-arr)" }));
    } else {
      var ln = el("line", { x1: a, y1: y, x2: b + (b > a ? -4 : 4), y2: y, "class": "sc-edge" + (last ? " lit draw" : " old"), "marker-end": "url(#sc-arr)" });
      g.appendChild(ln);
    }
    g.appendChild(el("text", { x: (a + b) / 2 + (a === b ? 40 : 0), y: y - 7, "text-anchor": "middle", "class": "sc-e" + (last ? " lit" : "") }, (i + 1) + ". " + m.label));
  });
  svg.appendChild(g);
  return svg;
}

function drawPlot(sc, f){
  var ax = sc.axes; if (!ax) return null;
  var w = 460, hgt = 280, L = 52, R = 16, T = 16, B = 42;
  var sx = function(x){ return L + (x - ax.xMin) / ((ax.xMax - ax.xMin) || 1) * (w - L - R); };
  var sy = function(y){ return hgt - B - (y - ax.yMin) / ((ax.yMax - ax.yMin) || 1) * (hgt - T - B); };
  var svg = svgOf(w, hgt, sc.title), g = el("g");
  g.appendChild(el("line", { x1: L, y1: hgt - B, x2: w - R, y2: hgt - B, "class": "sc-axis" }));
  g.appendChild(el("line", { x1: L, y1: T, x2: L, y2: hgt - B, "class": "sc-axis" }));
  [[ax.xMin, "start"], [ax.xMax, "end"]].forEach(function(t){ g.appendChild(el("text", { x: sx(t[0]), y: hgt - B + 16, "text-anchor": t[1], "class": "sc-i" }, +t[0].toFixed(3))); });
  [ax.yMin, ax.yMax].forEach(function(t){ g.appendChild(el("text", { x: L - 6, y: sy(t) + 4, "text-anchor": "end", "class": "sc-i" }, +t.toFixed(3))); });
  g.appendChild(el("text", { x: (L + w - R) / 2, y: hgt - 6, "text-anchor": "middle", "class": "sc-e" }, ax.xLabel));
  var yl = el("text", { x: 14, y: (T + hgt - B) / 2, "text-anchor": "middle", "class": "sc-e", transform: "rotate(-90 14 " + ((T + hgt - B) / 2) + ")" }, ax.yLabel); g.appendChild(yl);
  (sc.series || []).forEach(function(s, k){
    if (!s.points.length) return;
    var d = s.points.map(function(p, i){ return (i ? "L" : "M") + sx(p.x).toFixed(1) + " " + sy(p.y).toFixed(1); }).join(" ");
    g.appendChild(el("path", { d: d, "class": "sc-curve c" + k }));
    var lp = s.points[s.points.length - 1];
    if (s.label) g.appendChild(el("text", { x: Math.min(sx(lp.x), w - R) - 2, y: sy(lp.y) - 6, "text-anchor": "end", "class": "sc-e c" + k }, s.label));
  });
  f.marks.forEach(function(m, i){
    var last = i === f.marks.length - 1;
    g.appendChild(el("circle", { cx: sx(m.x), cy: sy(m.y), r: last ? 7 : 3.5, "class": "sc-mark" + (last ? " pop" : " trail") }));
    if (last && m.label) g.appendChild(el("text", { x: sx(m.x) + 10, y: sy(m.y) - 10, "class": "sc-e lit" }, m.label));
  });
  svg.appendChild(g);
  return svg;
}

function drawBars(sc, f, all){
  var labels = sc.items || [], n = labels.length; if (!n) return null;
  var max = 0; all.forEach(function(fr){ fr.values.forEach(function(v){ max = Math.max(max, num(v)); }); }); max = max || 1;
  var w = Math.max(300, n * 70 + 40), hgt = 240, base = hgt - 40;
  var svg = svgOf(w, hgt, sc.title), g = el("g");
  labels.forEach(function(lb, i){
    var v = num(f.values[i]), bh = v / max * (base - 30), x = 30 + i * 70;
    g.appendChild(el("rect", { x: x, y: base - bh, width: 46, height: Math.max(bh, 1), rx: 4, "class": "sc-bar " + (has(f.highlight, lb) ? "hot" : "") }));
    g.appendChild(el("text", { x: x + 23, y: base - bh - 6, "text-anchor": "middle", "class": "sc-e" }, f.values[i] === undefined ? "" : f.values[i]));
    g.appendChild(el("text", { x: x + 23, y: base + 16, "text-anchor": "middle", "class": "sc-i" }, lb));
  });
  g.appendChild(el("line", { x1: 20, y1: base, x2: w - 10, y2: base, "class": "sc-axis" }));
  svg.appendChild(g);
  return svg;
}

function draw(sc, f, all){
  switch (sc.kind){
    case "array": case "queue": case "linked_list": return drawRow(sc, f, sc.kind);
    case "stack": return drawStack(sc, f);
    case "heap": return drawHeap(sc, f);
    case "hashmap": return drawHash(sc, f);
    case "tree": return drawTree(sc, f);
    case "graph": return drawGraph(sc, f, false);
    case "state_machine": return drawGraph(sc, f, true);
    case "grid": return drawGrid(sc, f);
    case "sequence": return drawSequence(sc, f);
    case "plot": return drawPlot(sc, f);
    case "bars": return drawBars(sc, f, all);
  }
  return null;
}

/* ---------- the player ---------- */
function mount(fig, sc){
  if (!sc || !sc.steps || !sc.steps.length) return;
  var all = frames(sc), i = 0, timer = null, key = fig.getAttribute("data-key") || "";
  var stage = fig.querySelector(".scene-stage"), say = fig.querySelector(".scene-say"), ctl = fig.querySelector(".scene-ctl");
  var list = fig.querySelector(".scene-steps");
  if (!stage || !say || !ctl) return;
  if (list) list.hidden = true;
  fig.classList.add("live");
  fig.tabIndex = 0;

  function btn(label, title){ var b = h("button", "btn", label); b.type = "button"; b.title = title; b.setAttribute("aria-label", title); ctl.appendChild(b); return b; }
  var bFirst = btn("«", "First step"), bPrev = btn("◀", "Previous step"), bPlay = btn("▶ Play", "Play"), bNext = btn("▶", "Next step");
  var scrub = document.createElement("input");
  scrub.type = "range"; scrub.min = "0"; scrub.max = String(all.length - 1); scrub.value = "0"; scrub.className = "scene-scrub";
  scrub.setAttribute("aria-label", "Scrub through the steps");
  ctl.appendChild(scrub);
  var count = h("span", "scene-n", ""); ctl.appendChild(count);
  ctl.hidden = false;

  function show(n){
    i = Math.max(0, Math.min(all.length - 1, n));
    var svg = draw(sc, all[i], all);
    while (stage.firstChild) stage.removeChild(stage.firstChild);
    if (svg) stage.appendChild(svg);
    else stage.appendChild(h("p", "caveat", "This scene's data could not be drawn."));
    say.textContent = all[i].caption || "";
    scrub.value = String(i);
    count.textContent = (i + 1) + " / " + all.length;
    bPrev.disabled = i === 0; bFirst.disabled = i === 0; bNext.disabled = i === all.length - 1;
    if (i === all.length - 1){
      stop();
      try { document.dispatchEvent(new CustomEvent("hb:xp", { detail: { key: "scene:" + key, pts: 10, why: "Scene watched" } })); } catch(e){}
    }
  }
  function stop(){ if (timer){ clearInterval(timer); timer = null; } bPlay.textContent = "▶ Play"; bPlay.title = "Play"; }
  function play(){
    if (timer){ stop(); return; }
    if (i === all.length - 1) show(0);
    bPlay.textContent = "❚❚ Pause"; bPlay.title = "Pause";
    timer = setInterval(function(){ if (i >= all.length - 1) stop(); else show(i + 1); }, reduced ? 4200 : 2600);
  }
  bFirst.addEventListener("click", function(){ stop(); show(0); });
  bPrev.addEventListener("click", function(){ stop(); show(i - 1); });
  bNext.addEventListener("click", function(){ stop(); show(i + 1); });
  bPlay.addEventListener("click", play);
  scrub.addEventListener("input", function(){ stop(); show(parseInt(scrub.value, 10) || 0); });
  fig.addEventListener("keydown", function(e){
    if (e.target && e.target.tagName === "INPUT") return;
    if (e.key === "ArrowRight"){ stop(); show(i + 1); e.preventDefault(); }
    else if (e.key === "ArrowLeft"){ stop(); show(i - 1); e.preventDefault(); }
    else if (e.key === " "){ play(); e.preventDefault(); }
  });
  show(0);
}

window.AlfredScene = { mount: mount };
Array.prototype.forEach.call(document.querySelectorAll("figure.scene[data-scene]"), function(f){
  try { mount(f, JSON.parse(f.getAttribute("data-scene"))); } catch(e){}
});
})();
`;
