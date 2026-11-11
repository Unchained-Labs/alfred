/*
 * Styles for the interactive half of a handbook: scenes, the notebook, the
 * practice problems, the ask panel and the XP chip. Same tokens as
 * styles.ts, so every piece follows the theme toggle and dark mode.
 */
export const LAB_CSS = `
/* ---------- scenes ---------- */
.scene{margin:1.6rem 0;border:1px solid var(--line);border-radius:var(--radius);background:var(--surface);
  box-shadow:var(--shadow);overflow:hidden}
.scene:focus-visible{outline:2.5px solid var(--rule);outline-offset:2px}
.scene-head{display:flex;justify-content:space-between;align-items:baseline;gap:10px;padding:10px 14px;
  border-bottom:1px solid var(--line);background:var(--surface-2)}
.scene-title{font-family:var(--f-display);font-size:1.22rem;font-weight:700}
.scene-tag{font:500 .7rem var(--f-mono);color:var(--muted);text-transform:uppercase;letter-spacing:.06em;white-space:nowrap}
.scene-stage{overflow-x:auto;padding:14px 10px 4px;display:flex;justify-content:center;min-height:0}
.scene.live .scene-stage{min-height:150px}
.sc-svg{max-width:100%;height:auto;max-height:380px;overflow:visible}
.scene-say{margin:4px 16px 10px;min-height:2.6em;font-size:1rem;line-height:1.45;max-width:none}
.scene:not(.live) .scene-say{display:none}
.scene-ctl{display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:8px 12px;border-top:1px solid var(--line);background:var(--surface-2)}
.scene-ctl .btn{min-width:2.4em}
.scene-scrub{flex:1 1 120px;accent-color:var(--rule)}
.scene-n{font:500 .78rem var(--f-mono);color:var(--muted);min-width:4.5em;text-align:right}
.scene-steps{margin:12px 16px 12px 36px;font-size:.95rem}
.scene-cap{margin:0;padding:8px 14px 12px;color:var(--muted);font-size:.9rem;max-width:none}

.sc-box{fill:var(--surface);stroke:var(--line-strong);stroke-width:1.4;transition:fill .35s ease,stroke .35s ease}
.sc-box.hot{fill:var(--brand-wash);stroke:var(--rule);stroke-width:2.2}
.sc-box.bucket{fill:var(--surface-2)}
.sc-box.empty{fill:var(--surface-2);stroke-dasharray:3 3}
.sc-t{font:600 14px var(--f-mono);fill:var(--ink)}
.sc-t.sm{font-size:12px}
.sc-i{font:11px var(--f-mono);fill:var(--muted)}
.sc-e{font:11px var(--f-mono);fill:var(--muted);paint-order:stroke;stroke:var(--surface);stroke-width:4px;stroke-linejoin:round}
.sc-e.lit{fill:var(--rule);font-weight:600}
.sc-edge{stroke:var(--ink-2);stroke-width:1.4;fill:none}
.sc-edge.lit{stroke:var(--rule);stroke-width:2.4}
.sc-edge.old{opacity:.45}
.sc-head{fill:var(--ink-2)}
.sc-base,.sc-axis{stroke:var(--ink-2);stroke-width:1.4}
.sc-life{stroke:var(--line-strong);stroke-dasharray:4 4}
.sc-window{fill:var(--good-wash);stroke:var(--good);stroke-width:1.2;stroke-dasharray:5 3}
.sc-node{fill:var(--surface);stroke:var(--ink-2);stroke-width:1.4;transition:fill .35s ease}
.sc-node.hot{fill:var(--brand-wash);stroke:var(--rule);stroke-width:2.6}
.sc-node.done{fill:var(--good-wash);stroke:var(--good)}
.sc-ptr-a{fill:var(--rule)}
.sc-ptr-t{font:700 12px var(--f-mono);fill:var(--rule)}
.sc-curve{fill:none;stroke:var(--rule);stroke-width:2.2}
.sc-curve.c1{stroke:var(--good)}.sc-curve.c2{stroke:var(--warn)}
.sc-e.c1{fill:var(--good)}.sc-e.c2{fill:var(--warn)}
.sc-mark{fill:var(--rule)}
.sc-mark.trail{opacity:.4}
.sc-bar{fill:var(--line-strong);transition:height .45s ease,y .45s ease}
.sc-bar.hot{fill:var(--rule)}
.pop{animation:sc-pop .45s cubic-bezier(.2,.9,.3,1.3) both;transform-box:fill-box;transform-origin:center}
@keyframes sc-pop{from{transform:scale(.6);opacity:.2}to{transform:none;opacity:1}}
.draw{stroke-dasharray:600;animation:sc-draw .7s ease both}
@keyframes sc-draw{from{stroke-dashoffset:600}to{stroke-dashoffset:0}}

/* ---------- a part told as a story ---------- */
.goal{display:flex;gap:10px;align-items:baseline;margin:0 0 1.4rem;padding:10px 14px;border-radius:var(--radius);
  background:var(--brand-wash);border-left:3px solid var(--rule);font-weight:600;max-width:none}
.goal-l{font:700 .72rem var(--f-mono);text-transform:uppercase;letter-spacing:.08em;color:var(--rule);flex:none}
.beat{margin:0 0 2.2rem}
.body .beat-hook{display:flex;gap:10px;align-items:baseline;margin:0 0 .2rem;font-size:1.45rem}
.beat-n{flex:none;display:inline-grid;place-items:center;width:1.6em;height:1.6em;border-radius:999px;
  background:var(--rule);color:var(--brand-ink);font:700 .8rem var(--f-mono);transform:translateY(-2px)}
.beat .scene,.beat .dgm{margin:.7rem 0 .6rem}
.beat-say{font-size:1.02rem}
.beat-say>:first-child{margin-top:0}
.deeper{margin:1.6rem 0 0;border:1px solid var(--line);border-radius:var(--radius);background:var(--surface)}
.deeper>summary{display:flex;flex-wrap:wrap;gap:4px 12px;align-items:baseline;padding:12px 14px;cursor:pointer;list-style:none}
.deeper>summary::-webkit-details-marker{display:none}
.deeper>summary::before{content:"▸";color:var(--rule);transition:transform .2s ease}
.deeper[open]>summary::before{transform:rotate(90deg)}
.deeper-t{font-family:var(--f-display);font-size:1.25rem;font-weight:700}
.deeper-w{color:var(--muted);font-size:.88rem}
.deeper-b{padding:0 14px 8px;border-top:1px solid var(--line)}

/* ---------- notebook and problems ---------- */
.lab-h{display:flex;gap:8px;align-items:baseline;flex-wrap:wrap;margin:1.8rem 0 .6rem;color:var(--muted);font-size:.9rem;max-width:none}
.lab-h span,.lab-tag{font:700 .72rem var(--f-mono);text-transform:uppercase;letter-spacing:.08em;color:var(--rule)}
.nb{margin:1rem 0}
.cell{border:1px solid var(--line);border-left:3px solid var(--rule);border-radius:8px;background:var(--surface);margin:.7rem 0;overflow:hidden}
.cell-h{display:flex;gap:10px;align-items:baseline;padding:8px 12px 0}
.cell-n{font:500 .74rem var(--f-mono);color:var(--muted)}
.cell-x{margin:4px 12px 8px;font-size:.92rem;color:var(--ink-2);max-width:none}
.cell-code{display:block;width:100%;box-sizing:border-box;border:0;border-top:1px solid var(--line);border-bottom:1px solid var(--line);
  background:var(--surface-2);color:var(--ink);font:13px/1.55 var(--f-mono);padding:10px 12px;resize:vertical;tab-size:4;white-space:pre;overflow:auto}
.cell-code:focus{outline:none;background:var(--surface)}
.cell-bar{display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:8px 12px}
.cell-st{font:.78rem var(--f-mono);color:var(--muted)}
.cell-out{margin:0;padding:10px 12px;border-top:1px dashed var(--line);font:12.5px/1.5 var(--f-mono);white-space:pre-wrap;
  max-height:320px;overflow:auto;background:var(--surface)}
.cell-out.err{color:var(--bad);background:var(--bad-wash)}
.prob{border:1px solid var(--line);border-radius:var(--radius);background:var(--surface);margin:1.4rem 0;box-shadow:var(--shadow);overflow:hidden}
.prob.solved{border-color:var(--good)}
.prob-head{display:flex;flex-wrap:wrap;gap:8px;align-items:baseline;padding:12px 14px 4px}
.prob-head h4{margin:0;font-family:var(--f-display);font-size:1.35rem;flex:1 1 auto}
.chip.diff.easy{color:var(--good)}.chip.diff.medium{color:var(--warn)}.chip.diff.hard{color:var(--bad)}
.solved-chip{color:var(--good);border-color:var(--good)}
.prob-st{padding:0 14px}
.prob-vis{margin:.4rem 14px .8rem;padding-left:18px;font-size:.88rem}
.prob-hints{margin:0 14px 8px 32px;font-size:.92rem}
.prob-res{margin:0;padding:0 14px 8px 32px;font:12.5px/1.6 var(--f-mono)}
.prob-res .good{color:var(--good)}.prob-res .bad{color:var(--bad)}
.prob-sol{margin:0 14px 14px;border-top:1px solid var(--line);padding-top:8px}
.prob-sol summary{cursor:pointer;font-weight:700}
.prob-sol pre{background:var(--surface-2);padding:10px 12px;border-radius:6px;overflow:auto}
.prob-cx{color:var(--muted);font-size:.9rem}

/* ---------- XP ---------- */
.xp{font:600 .75rem var(--f-mono);color:var(--good);border:1px solid var(--good);border-radius:999px;padding:3px 9px;white-space:nowrap}

/* ---------- ask Alfred ---------- */
.ask-fab{position:fixed;right:18px;bottom:18px;z-index:40;border:0;border-radius:999px;padding:12px 18px;
  background:var(--rule);color:var(--brand-ink);font:700 .95rem var(--f-body);box-shadow:0 8px 24px -8px rgb(0 0 0/.45);cursor:pointer}
.ask-fab[aria-expanded="true"]{opacity:.85}
.ask-sel{position:fixed;z-index:41;border:0;border-radius:8px;padding:7px 11px;background:var(--ink);color:var(--page);
  font:700 .82rem var(--f-body);box-shadow:var(--shadow);cursor:pointer}
.ask-panel{position:fixed;right:18px;bottom:76px;z-index:42;width:min(440px,calc(100vw - 24px));max-height:min(72vh,680px);
  display:flex;flex-direction:column;border:1px solid var(--line-strong);border-radius:14px;background:var(--surface);
  box-shadow:0 18px 48px -18px rgb(0 0 0/.45);overflow:hidden}
.ask-h{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 10px;padding:10px 12px;border-bottom:1px solid var(--line);background:var(--surface-2)}
.ask-h b{font-family:var(--f-display);font-size:1.25rem}
.ask-sub{flex:1 1 180px;color:var(--muted);font-size:.78rem}
.ask-x{margin-left:auto}
.ask-log{flex:1 1 auto;overflow:auto;padding:10px 12px;display:grid;gap:8px;align-content:start}
.ask-m{padding:8px 11px;border-radius:10px;font-size:.93rem;line-height:1.45;max-width:100%}
.ask-m.me{justify-self:end;background:var(--brand-wash);max-width:85%}
.ask-m.them{background:var(--surface-2)}
.ask-m.wait{color:var(--muted);font-style:italic}
.ask-m.err{color:var(--bad);background:var(--bad-wash)}
.ask-a p,.ask-a li{max-width:none}
.ask-a > :first-child{margin-top:0}
.ask-m .scene{margin:.8rem 0 0;box-shadow:none}
.ask-quote{margin:0 12px 8px;padding:6px 10px;border-left:3px solid var(--rule);background:var(--brand-wash);font-size:.85rem;
  max-height:5.5em;overflow:auto;color:var(--ink-2)}
.ask-quick{display:flex;flex-wrap:wrap;gap:6px;padding:0 12px 8px}
.ask-quick .btn{font-size:.78rem}
.ask-form{display:flex;gap:6px;padding:8px 12px 12px;border-top:1px solid var(--line)}
.ask-form textarea{flex:1;resize:none;border:1px solid var(--line-strong);border-radius:8px;padding:8px;font:inherit;
  background:var(--surface);color:var(--ink)}
.ask-form .primary{background:var(--rule);color:var(--brand-ink);border-color:var(--rule)}
@media (max-width:620px){.ask-panel{right:12px;left:12px;width:auto;bottom:70px}.ask-fab{right:12px;bottom:12px}}
/* Wide enough to read beside it: dock the panel full height and move the page
   out from under it, instead of floating over the text being asked about. */
@media (min-width:981px){
  html.ask-open body{padding-right:476px}
  html.ask-open .ask-panel{top:72px;max-height:none}
}
/* Below 1240 the parts rail and the panel do not both fit beside the text:
   the rail steps aside while the panel is open. */
@media (min-width:981px) and (max-width:1239px){
  html.ask-open .shell{grid-template-columns:minmax(0,1fr)}
  html.ask-open .rail{display:none}
}
@media print{
  .scene-ctl,.scene-say,.cell-bar,.ask-fab,.ask-sel,.ask-panel,.xp{display:none!important}
  .scene-steps{display:block!important}
  .deeper-b{display:block!important}
  .scene .scene-stage{display:none}
  .prob-sol{display:block}
}
@media (prefers-reduced-motion:reduce){.pop,.draw{animation:none}}
`;
