/*
 * The handbook's stylesheet, inlined into the document it ships with.
 *
 * It repeats Alfred's tokens rather than importing them, because a handbook is
 * a file the candidate keeps: it has to look right after being downloaded,
 * emailed to themselves, or opened on a train with no network. A stylesheet
 * fetched from the app would make all three fail silently.
 */
export const HANDBOOK_CSS = `
*,*::before,*::after{box-sizing:border-box}
:root{
  --page:#f6f3ef;--surface:#fff;--surface-2:#f3efe9;--surface-3:#e8e1d8;
  --ink:#1a1512;--ink-2:#4a423c;--muted:#6f655e;
  --line:#e2d9cf;--line-strong:#cfc5b8;
  --brand:#7a2e35;--brand-hot:#93383f;--brand-ink:#fff;--brand-wash:rgb(122 46 53/.09);
  --good:#2f7d32;--good-wash:#e4efe3;--warn:#8a5a00;--warn-wash:#f8eed8;
  --bad:#a3302f;--bad-wash:#f6e2e1;--why:#6b4a1f;--why-wash:#f4ead9;
  --radius:10px;
  --shadow:0 1px 2px rgb(26 21 18/.05),0 10px 28px -14px rgb(26 21 18/.14);
  --f-display:"Barlow Condensed","Arial Narrow",system-ui,sans-serif;
  --f-body:"Atkinson Hyperlegible",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  --f-mono:"IBM Plex Mono",ui-monospace,SFMono-Regular,Menlo,monospace;
  color-scheme:light;
}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
  --page:#141010;--surface:#1c1715;--surface-2:#241c1a;--surface-3:#302724;
  --ink:#ede6e1;--ink-2:#cfc5be;--muted:#9d928a;
  --line:#302724;--line-strong:#473b37;
  --brand:#f2e7e4;--brand-hot:#fff;--brand-ink:#1c1715;--brand-wash:rgb(224 149 156/.14);
  --accent:#e0959c;
  --good:#6cc08b;--good-wash:#16301f;--warn:#e0a44c;--warn-wash:#32260f;
  --bad:#ef8079;--bad-wash:#381b1a;--why:#d7a86a;--why-wash:#2e2415;
  --shadow:0 1px 2px rgb(0 0 0/.5),0 10px 28px -14px rgb(0 0 0/.7);
  color-scheme:dark;
}}
:root[data-theme="dark"]{
  --page:#141010;--surface:#1c1715;--surface-2:#241c1a;--surface-3:#302724;
  --ink:#ede6e1;--ink-2:#cfc5be;--muted:#9d928a;
  --line:#302724;--line-strong:#473b37;
  --brand:#f2e7e4;--brand-hot:#fff;--brand-ink:#1c1715;--brand-wash:rgb(224 149 156/.14);
  --accent:#e0959c;
  --good:#6cc08b;--good-wash:#16301f;--warn:#e0a44c;--warn-wash:#32260f;
  --bad:#ef8079;--bad-wash:#381b1a;--why:#d7a86a;--why-wash:#2e2415;
  --shadow:0 1px 2px rgb(0 0 0/.5),0 10px 28px -14px rgb(0 0 0/.7);
  color-scheme:dark;
}
/* The claret rule only works on a light ground; on dark it becomes the accent. */
:root{--rule:var(--brand)}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--rule:var(--accent)}}
:root[data-theme="dark"]{--rule:var(--accent)}

html{scroll-behavior:smooth;-webkit-text-size-adjust:100%}
body{margin:0;background:var(--page);color:var(--ink);font-family:var(--f-body);
  font-size:16.5px;line-height:1.62;-webkit-font-smoothing:antialiased}
p,li{max-width:70ch}
a{color:var(--rule);text-underline-offset:2px}
h1,h2,h3{font-family:var(--f-display);line-height:1.04;letter-spacing:-.005em;margin:0}
code{font-family:var(--f-mono);font-size:.85em;background:var(--surface-3);padding:.1em .35em;border-radius:4px}
pre{background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:13px 15px;
  overflow-x:auto;font-size:.78rem;line-height:1.55;margin:14px 0}
pre code{background:none;padding:0;font-size:inherit}
:focus-visible{outline:2.5px solid var(--rule);outline-offset:2px;border-radius:4px}
button{font-family:inherit}

/* ---------- top bar ---------- */
.bar{position:sticky;top:0;z-index:40;background:var(--surface);border-bottom:1px solid var(--line)}
.bar-in{max-width:1240px;margin:0 auto;padding:9px 16px;display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center}
.mark{font-family:var(--f-display);font-weight:700;font-size:1.1rem;letter-spacing:.03em;
  text-transform:uppercase;white-space:nowrap}
.mark b{color:var(--rule);font-weight:700}
.prog{flex:1 1 150px;display:flex;align-items:center;gap:9px;min-width:140px}
.prog-track{flex:1;height:7px;background:var(--surface-3);border-radius:99px;overflow:hidden}
.prog-fill{height:100%;width:0;background:var(--good);transition:width .45s ease}
.prog-txt{font-family:var(--f-mono);font-size:.74rem;color:var(--muted);white-space:nowrap;
  font-variant-numeric:tabular-nums}
.tools{display:flex;gap:6px;flex-wrap:wrap}
.btn{font:500 .8rem/1 var(--f-mono);padding:.62em .72em;border-radius:7px;border:1px solid var(--line);
  background:var(--surface);color:var(--ink);cursor:pointer;display:inline-flex;gap:.4em;align-items:center;
  white-space:nowrap}
.btn:hover{border-color:var(--rule)}
.btn[aria-pressed="true"]{background:var(--brand);color:var(--brand-ink);border-color:var(--brand)}
.btn.run{background:var(--warn-wash);border-color:var(--warn);color:var(--warn)}

/* ---------- hero ---------- */
.wrap{max-width:1240px;margin:0 auto;padding-inline:16px}
.hero{padding-block:44px 30px;border-bottom:1px solid var(--line)}
.eyebrow{font-family:var(--f-mono);font-size:.74rem;letter-spacing:.11em;text-transform:uppercase;
  color:var(--muted);margin:0}
h1{font-size:clamp(2.4rem,5.2vw,3.8rem);font-weight:700;margin:.18em 0 .34em;text-wrap:balance}
.lede{font-size:1.1rem;max-width:58ch;margin:0;color:var(--ink-2)}
.routes{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;margin-top:24px}
.route{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:13px 15px}
.route b{display:block;font-family:var(--f-display);font-size:1.3rem;font-weight:600;line-height:1.1}
.route span{display:block;font-size:.86rem;color:var(--muted);margin-top:3px;line-height:1.4}
.route .jumps{display:flex;flex-wrap:wrap;gap:4px;margin-top:8px}
.route .jumps a{font-family:var(--f-mono);font-size:.7rem;padding:2px 7px;border-radius:4px;
  background:var(--surface-2);color:var(--ink);text-decoration:none;border:1px solid var(--line)}
.route .jumps a:hover{background:var(--brand);color:var(--brand-ink);border-color:var(--brand)}

/* ---------- shell ---------- */
.shell{max-width:1240px;margin:0 auto;padding-inline:16px;display:grid;
  grid-template-columns:232px minmax(0,1fr);gap:48px}
.rail{position:sticky;top:60px;align-self:start;max-height:calc(100vh - 78px);overflow:auto;padding-block:26px}
.rail-h{font-family:var(--f-mono);font-size:.7rem;letter-spacing:.13em;text-transform:uppercase;
  color:var(--muted);margin:0 0 8px 8px}
.rail ol{list-style:none;margin:0 0 18px;padding:0;display:grid;gap:1px}
.rail a{display:grid;grid-template-columns:2em 1fr 17px;gap:6px;align-items:center;padding:6px 8px;
  border-radius:6px;color:var(--ink);text-decoration:none;font-size:.88rem;line-height:1.25}
.rail a:hover{background:var(--surface-2)}
.rail a .n{font-family:var(--f-mono);font-size:.7rem;color:var(--muted)}
.rail a .tick{width:15px;height:15px;border-radius:50%;border:1.5px solid var(--line-strong);
  display:inline-grid;place-items:center;font-size:.58rem;color:transparent}
.rail a.done .tick{background:var(--good);border-color:var(--good);color:var(--surface)}
.rail a.here{background:var(--brand-wash)}
.rail a.here .n{color:var(--rule)}
main{min-width:0;max-width:810px;padding-block:0 90px}

/* ---------- parts ---------- */
.part{padding-block:50px 20px;border-top:1px solid var(--line);scroll-margin-top:66px}
main>.part:first-child{border-top:0}
.part-n{font-family:var(--f-mono);font-size:.76rem;letter-spacing:.15em;text-transform:uppercase;color:var(--rule)}
h2{font-size:clamp(1.95rem,4.2vw,2.7rem);font-weight:700;margin:5px 0 0;text-wrap:balance}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:9px}
.chip{font-family:var(--f-mono);font-size:.68rem;letter-spacing:.05em;text-transform:uppercase;
  padding:3px 8px;border-radius:99px;background:var(--surface-3);color:var(--muted);white-space:nowrap}
.chip.must{background:var(--brand);color:var(--brand-ink)}
.chip.leadership{background:var(--brand-wash);color:var(--rule)}
.chip.company{background:var(--why-wash);color:var(--why)}
.tldr{position:relative;background:var(--surface);border:2px solid var(--ink);border-radius:5px;
  padding:17px 18px 13px;margin:20px 0 26px}
.tldr-l{position:absolute;top:-11px;left:12px;background:var(--brand);color:var(--brand-ink);
  font:500 .7rem/1 var(--f-mono);letter-spacing:.11em;padding:5px 8px;border-radius:3px}
.tldr ul{margin:.2em 0 0;padding-left:1.15em}
.tldr li{margin:.32em 0}
.hidden-note{display:none;font-size:.86rem;color:var(--muted);font-style:italic}
body.tldr-only .part .body{display:none}
body.tldr-only .part .hidden-note{display:block}
body.focus .part:not(.here){display:none}
body.focus .hero,body.focus .drills{display:none}
.body>:first-child{margin-top:0}
.body h3{font-family:var(--f-display);font-size:1.62rem;font-weight:600;margin:2.1rem 0 .5rem}
.body h4{font-size:1.02rem;font-weight:700;margin:1.5rem 0 .3rem;font-family:var(--f-body)}
.body p{margin:.68em 0}
.body ul,.body ol{padding-left:1.25em}
.body li{margin:.3em 0}
blockquote{border-left:2.5px solid var(--rule);margin:14px 0;padding-left:14px;color:var(--ink-2);font-style:italic}

/* notes */
.note{border-radius:var(--radius);padding:12px 15px;margin:17px 0;background:var(--surface-2)}
.note .l{display:block;font:500 .69rem/1.4 var(--f-mono);letter-spacing:.11em;text-transform:uppercase;
  margin-bottom:3px}
.note p{margin:.2em 0}
.note.say{background:var(--brand-wash)}.note.say .l{color:var(--rule)}
.note.say p{font-style:italic}
.note.trap{background:var(--bad-wash)}.note.trap .l{color:var(--bad)}
.note.why{background:var(--why-wash)}.note.why .l{color:var(--why)}
.note.tip{background:var(--good-wash)}.note.tip .l{color:var(--good)}

/* tables */
.tbl{overflow-x:auto;margin:17px 0;border:1px solid var(--line);border-radius:8px;background:var(--surface)}
table{border-collapse:collapse;width:100%;font-size:.89rem;min-width:420px}
th,td{text-align:left;padding:9px 12px;border-bottom:1px solid var(--line);vertical-align:top}
th{font:500 .69rem/1.3 var(--f-mono);letter-spacing:.07em;text-transform:uppercase;color:var(--muted);
  background:var(--surface-2)}
tr:last-child td{border-bottom:0}
td:first-child{font-weight:700}

/* cards */
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(215px,1fr));gap:11px;margin:18px 0}
.card{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:13px 15px;min-width:0}
.card h4{margin:0 0 4px;font-family:var(--f-display);font-size:1.2rem;font-weight:600;line-height:1.15}
.card p{margin:.2em 0;font-size:.91rem}

/* part footer */
.foot{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:10px;margin-top:32px;
  padding:11px 14px;border:1px solid var(--line);border-radius:var(--radius);background:var(--surface)}
.gotit{display:inline-flex;gap:10px;align-items:center;font-weight:700;cursor:pointer}
.gotit input{width:21px;height:21px;accent-color:var(--good);margin:0}
.pager{display:flex;gap:6px}

/* ---------- drills ---------- */
.drills{border-top:1px solid var(--line);padding-block:50px 20px;scroll-margin-top:66px}
.drills h2{margin-bottom:14px}
.fc-cats{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px}
.fc-cats button{font:500 .73rem/1 var(--f-mono);padding:6px 9px;border-radius:99px;border:1px solid var(--line);
  background:var(--surface);color:var(--ink);cursor:pointer}
.fc-cats button[aria-pressed="true"]{background:var(--ink);color:var(--page);border-color:var(--ink)}
.fc{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:19px 21px;min-height:184px;
  display:flex;flex-direction:column;gap:9px;cursor:pointer}
.fc .k{font:500 .68rem/1 var(--f-mono);letter-spacing:.11em;text-transform:uppercase;color:var(--muted)}
.fc .q{font-family:var(--f-display);font-size:1.42rem;font-weight:600;line-height:1.18;margin:0;text-wrap:balance}
.fc .a{margin:0;font-size:.93rem}
.fc .a ul{margin:.2em 0;padding-left:1.1em}
.fc .hint{margin-top:auto;font-size:.77rem;color:var(--muted)}
.fc[data-face="q"] .a{display:none}
.fc[data-face="a"] .q{font-size:1.05rem;font-weight:400;font-family:var(--f-body);color:var(--muted)}
.fc-bar{display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px;align-items:center;margin-top:11px}
.fc-count{font-family:var(--f-mono);font-size:.78rem;color:var(--muted);font-variant-numeric:tabular-nums}
.gl-find{width:100%;font:1rem var(--f-body);padding:10px 12px;border-radius:8px;border:1px solid var(--line);
  background:var(--surface);color:var(--ink)}
.gl{display:grid;grid-template-columns:minmax(120px,210px) minmax(0,1fr);margin:12px 0;border:1px solid var(--line);
  border-radius:8px;overflow:hidden;background:var(--surface)}
.gl dt,.gl dd{padding:8px 12px;border-bottom:1px solid var(--line);margin:0}
.gl dt{font-family:var(--f-mono);font-size:.82rem;font-weight:500;background:var(--surface-2)}
.gl dd{font-size:.9rem}
.gl .off{display:none}
.story{border:1px solid var(--line);border-radius:10px;background:var(--surface);margin:9px 0}
.story summary{cursor:pointer;list-style:none;padding:12px 14px;display:grid;
  grid-template-columns:auto 1fr auto;gap:9px;align-items:center;font-weight:700}
.story summary::-webkit-details-marker{display:none}
.story .dot{width:10px;height:10px;border-radius:50%;background:var(--surface-3);display:inline-block}
.story.filled .dot{background:var(--good)}
.story .tags{display:flex;flex-wrap:wrap;gap:4px;justify-content:flex-end}
.story .tags span{font:500 .62rem/1 var(--f-mono);padding:3px 6px;border-radius:99px;
  background:var(--why-wash);color:var(--why)}
.story .sb{padding:0 14px 14px}
.story .sb p{font-size:.87rem;color:var(--muted);margin:.2em 0 .5em}
.story textarea{width:100%;min-height:140px;font:.85rem/1.55 var(--f-mono);background:var(--page);
  color:var(--ink);border:1px solid var(--line);border-radius:8px;padding:10px;resize:vertical}
.asks{display:grid;grid-template-columns:repeat(auto-fit,minmax(265px,1fr));gap:11px}
.checks{list-style:none;padding:0;margin:10px 0;display:grid;gap:6px}
.checks li{max-width:none}
.checks label{display:grid;grid-template-columns:22px 1fr;gap:10px;align-items:start;padding:9px 12px;
  border:1px solid var(--line);border-radius:8px;background:var(--surface);cursor:pointer}
.checks input{width:19px;height:19px;margin:2px 0 0;accent-color:var(--good)}
.checks input:checked+span{color:var(--muted);text-decoration:line-through}
.src li{font-size:.9rem}
.caveat{font-size:.82rem;color:var(--muted)}
.toast{position:fixed;left:50%;bottom:20px;transform:translateX(-50%);background:var(--ink);color:var(--page);
  padding:10px 16px;border-radius:8px;z-index:90;font-weight:700;box-shadow:var(--shadow)}

@media (max-width:980px){
  .shell{grid-template-columns:1fr;gap:0}
  .rail{position:static;max-height:none;padding-block:14px 4px;overflow-x:auto}
  .rail-h{display:none}
  .rail ol{display:flex;gap:6px;width:max-content;margin-bottom:10px}
  .rail a{grid-template-columns:auto auto 15px;white-space:nowrap;border:1px solid var(--line);
    background:var(--surface)}
  main{max-width:none}
}
@media (max-width:620px){
  body{font-size:16px}
  .hero{padding-block:30px 24px}
  .gl{grid-template-columns:1fr}
  .gl dt{border-bottom:0;padding-bottom:0;background:var(--surface)}
}
@media print{
  .bar,.rail,.tools,.pager,.foot,.fc-cats,.fc-bar,.gl-find{display:none!important}
  body{background:#fff;color:#000;font-size:11pt}
  .shell{display:block;padding:0}
  main{max-width:none;padding:0}
  .part{page-break-inside:avoid;border-top:1px solid #ccc}
  .fc[data-face="q"] .a{display:block}
  a{color:#000;text-decoration:underline}
}
@media (prefers-reduced-motion:reduce){
  html{scroll-behavior:auto}
  *,*::before,*::after{animation-duration:.001ms!important;transition-duration:.001ms!important}
}
`;
