import type { HandbookDrills, HandbookPlan } from "@/lib/ai/schemas";
import { escapeHtml, inlineMarkdown, renderMarkdown, slug } from "./markdown";
import { HANDBOOK_CSS } from "./styles";
import { HANDBOOK_JS } from "./behaviour";

/*
 * Turns stored handbook content into one self-contained HTML document.
 *
 * Deterministic: the same content renders the same page, and the template can
 * be improved without regenerating anybody's handbook. That is the whole reason
 * the database stores content and not HTML.
 *
 * Everything interpolated goes through escapeHtml or the markdown renderer.
 * There is no path here that writes provider output into the page as markup.
 */

export type HandbookContent = { plan: HandbookPlan; drills: HandbookDrills };

/** Narrows the untyped `content` JSON column. */
export function asHandbookContent(value: unknown): HandbookContent | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Partial<HandbookContent>;
  if (!v.plan || !Array.isArray(v.plan.parts) || !v.drills) return null;
  return v as HandbookContent;
}

const EMPHASIS_LABEL: Record<string, string> = {
  must: "Must know",
  leadership: "Leadership",
  company: "Company",
  optional: "Depth",
};

const NOTE_LABEL: Record<string, string> = {
  say: "Say it like this",
  trap: "Trap",
  why: "Why it matters here",
  tip: "Tip",
};

const PHASE_LABEL: Record<string, string> = {
  before: "The day before",
  day: "On the day",
  after: "Afterwards",
};

const pad = (n: number) => String(n).padStart(2, "0");

export type HandbookMeta = {
  id: string;
  company: string;
  role: string;
  generatedAt: Date;
  provider?: string | null;
  model?: string | null;
  /** Rendered into the page so a downloaded copy can still link home. */
  appUrl?: string | null;
};

export function renderHandbook(
  content: HandbookContent,
  meta: HandbookMeta,
): string {
  const { plan, drills } = content;

  // Part ids come from a model, so they are re-slugged and de-duplicated here
  // rather than trusted as anchors.
  const seen = new Set<string>();
  const parts = plan.parts.map((part, index) => {
    let id = slug(part.id || part.short || part.title, `part-${index + 1}`);
    while (seen.has(id)) id = `${id}-${index + 1}`;
    seen.add(id);
    return { ...part, anchor: id, no: pad(index + 1) };
  });
  const byOriginalId = new Map(plan.parts.map((p, i) => [p.id, parts[i].anchor]));

  const rail = parts
    .map(
      (p) =>
        `<li><a href="#${p.anchor}" data-target="${p.anchor}"><span class="n">${p.no}</span><span>${escapeHtml(p.short || p.title)}</span><span class="tick" aria-hidden="true">✓</span></a></li>`,
    )
    .join("");

  const routes = plan.routes.length
    ? `<div class="routes">${plan.routes
        .map((r) => {
          const jumps = r.parts
            .map((pid) => byOriginalId.get(pid))
            .filter((a): a is string => Boolean(a))
            .map((a) => {
              const p = parts.find((x) => x.anchor === a)!;
              return `<a href="#${a}">${p.no}</a>`;
            })
            .join("");
          return `<div class="route"><b>${escapeHtml(r.label)}</b><span>${escapeHtml(r.detail)}</span>${jumps ? `<div class="jumps">${jumps}</div>` : ""}</div>`;
        })
        .join("")}</div>`
    : "";

  const partSections = parts
    .map((p, index) => {
      const chips = [
        `<span class="chip ${escapeHtml(p.emphasis)}">${escapeHtml(EMPHASIS_LABEL[p.emphasis] ?? p.emphasis)}</span>`,
        `<span class="chip">${p.minutes} min</span>`,
      ].join("");

      const tldr = p.tldr.length
        ? `<div class="tldr"><span class="tldr-l">TL;DR</span><ul>${p.tldr
            .map((l) => `<li>${inlineMarkdown(l)}</li>`)
            .join("")}</ul></div>
      <p class="hidden-note">Body hidden. Turn off “TL;DR only” to read the part.</p>`
        : "";

      const notes = (p.notes ?? [])
        .map(
          (n) =>
            `<div class="note ${escapeHtml(n.tone)}"><span class="l">${escapeHtml(n.title || NOTE_LABEL[n.tone] || "Note")}</span>${renderMarkdown(n.body)}</div>`,
        )
        .join("");

      const cards = (p.cards ?? []).length
        ? `<div class="cards">${(p.cards ?? [])
            .map(
              (c) =>
                `<div class="card"><h4>${escapeHtml(c.title)}</h4>${renderMarkdown(c.body)}</div>`,
            )
            .join("")}</div>`
        : "";

      return `<section class="part" id="${p.anchor}" data-no="${p.no}">
  <header>
    <span class="part-n">Part ${p.no}</span>
    <h2>${escapeHtml(p.title)}</h2>
    <div class="chips">${chips}</div>
  </header>
  ${tldr}
  <div class="body">
    ${
      p.body?.trim()
        ? renderMarkdown(p.body)
        : `<p class="caveat">This part has not been written yet. Rebuild the handbook to fill it in.</p>`
    }
    ${notes}
    ${cards}
  </div>
  <footer class="foot">
    <label class="gotit"><input type="checkbox" class="done" data-part="${p.anchor}"> I've got this</label>
    <div class="pager">
      <button class="btn prev"${index === 0 ? " disabled" : ""}>← Prev</button>
      <button class="btn next">Next →</button>
    </div>
  </footer>
</section>`;
    })
    .join("\n");

  /* ---- drills ---- */
  const categories = Array.from(
    new Set(drills.flashcards.map((c) => c.category.trim()).filter(Boolean)),
  );
  const flashcards = drills.flashcards.length
    ? `<section class="drills" id="cards">
  <h2>Practice cards</h2>
  <p class="caveat">Answer out loud first, then flip. ${drills.flashcards.length} cards.</p>
  <div class="fc-cats" role="group" aria-label="Categories">
    <button data-cat="*" aria-pressed="true">All</button>
    ${categories.map((c) => `<button data-cat="${escapeHtml(c)}" aria-pressed="false">${escapeHtml(c)}</button>`).join("")}
  </div>
  <div class="fc" id="fc" data-face="q" tabindex="0" role="button" aria-label="Flashcard — press Enter to flip">
    <span class="k" id="fc-k"></span>
    <p class="q" id="fc-q"></p>
    <div class="a" id="fc-a"></div>
    <span class="hint">Click, or press Enter, to flip.</span>
  </div>
  <div class="fc-bar">
    <span class="fc-count" id="fc-count"></span>
    <div class="tools">
      <button class="btn" id="fc-prev">←</button>
      <button class="btn" id="fc-got">Got it ✓</button>
      <button class="btn" id="fc-next">→</button>
      <button class="btn" id="fc-shuffle">Shuffle</button>
    </div>
  </div>
  <div hidden id="fc-data">${drills.flashcards
    .map(
      (c) =>
        `<div data-cat="${escapeHtml(c.category)}" data-q="${escapeHtml(c.question)}"><ul>${c.answer
          .map((a) => `<li>${inlineMarkdown(a)}</li>`)
          .join("")}</ul></div>`,
    )
    .join("")}</div>
</section>`
    : "";

  const glossary = drills.glossary.length
    ? `<section class="drills" id="glossary">
  <h2>Glossary</h2>
  <label class="caveat" for="gl-find">Filter ${drills.glossary.length} terms</label>
  <input type="search" id="gl-find" class="gl-find" placeholder="Try an acronym…">
  <dl class="gl" id="gl">${drills.glossary
    .map(
      (g) =>
        `<dt>${escapeHtml(g.term)}</dt><dd>${inlineMarkdown(g.definition)}</dd>`,
    )
    .join("")}</dl>
</section>`
    : "";

  const stories = drills.stories.length
    ? `<section class="drills" id="stories">
  <h2>Your story bank</h2>
  <p class="caveat">Alfred will not write these for you — they are yours. Saved in this browser only.</p>
  ${drills.stories
    .map(
      (s, i) =>
        `<details class="story" data-story="${i}">
    <summary><span class="dot" aria-hidden="true"></span><span>${escapeHtml(s.prompt)}</span><span class="tags">${s.tags
      .map((t) => `<span>${escapeHtml(t)}</span>`)
      .join("")}</span></summary>
    <div class="sb"><p>${escapeHtml(s.hint)}</p>
      <textarea data-story-input="${i}" aria-label="${escapeHtml(s.prompt)}" placeholder="S: where, when, what was at stake&#10;T: your responsibility&#10;A: what YOU did, in 3-4 steps&#10;R: the result, with a number&#10;L: what you learned"></textarea>
    </div>
  </details>`,
    )
    .join("")}
  <div class="tools" style="margin-top:10px"><button class="btn" id="stories-copy">Copy all stories</button><span class="caveat" id="stories-msg"></span></div>
</section>`
    : "";

  const asks = drills.asks.length
    ? `<section class="drills" id="ask">
  <h2>Questions to ask them</h2>
  <div class="asks">${drills.asks
    .map(
      (a) =>
        `<div class="card"><h4>${escapeHtml(a.audience)}</h4><ul>${a.questions
          .map((q) => `<li>${inlineMarkdown(q)}</li>`)
          .join("")}</ul></div>`,
    )
    .join("")}</div>
</section>`
    : "";

  const checklist = drills.checklist.length
    ? `<section class="drills" id="checklist">
  <h2>Checklist</h2>
  ${drills.checklist
    .map(
      (c) =>
        `<h3 style="font-family:var(--f-display);font-size:1.5rem;margin:1.6rem 0 .4rem">${escapeHtml(PHASE_LABEL[c.phase] ?? c.phase)}</h3>
    <ul class="checks">${c.items
      .map(
        (item, i) =>
          `<li><label><input type="checkbox" data-check="${escapeHtml(c.phase)}-${i}"><span>${inlineMarkdown(item)}</span></label></li>`,
      )
      .join("")}</ul>`,
    )
    .join("")}
</section>`
    : "";

  const sources = drills.sources.length
    ? `<section class="drills" id="sources">
  <h2>Sources</h2>
  <p class="caveat">Generated links. Worth opening before you rely on any of them.</p>
  <ul class="src">${drills.sources
    .map((s) =>
      /^https?:\/\//i.test(s.url)
        ? `<li><a href="${escapeHtml(s.url)}" target="_blank" rel="noreferrer noopener">${escapeHtml(s.label)}</a></li>`
        : `<li>${escapeHtml(s.label)}</li>`,
    )
    .join("")}</ul>
</section>`
    : "";

  const stamp = meta.generatedAt.toISOString().slice(0, 10);
  const origin = [
    `Generated by Alfred on ${stamp}`,
    meta.provider
      ? `via ${meta.provider}${meta.model ? ` (${meta.model})` : ""}`
      : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${escapeHtml(plan.title)}</title>
<meta name="robots" content="noindex">
<meta name="description" content="${escapeHtml(plan.lede.slice(0, 180))}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&family=Barlow+Condensed:wght@600;700&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>${HANDBOOK_CSS}</style>
</head>
<body data-handbook="${escapeHtml(meta.id)}">

<div class="bar">
  <div class="bar-in">
    <div class="mark">${escapeHtml(meta.company)} <b>Handbook</b></div>
    <div class="prog" aria-label="Reading progress">
      <div class="prog-track"><div class="prog-fill" id="prog-fill"></div></div>
      <span class="prog-txt" id="prog-txt">0/${parts.length} parts</span>
    </div>
    <div class="tools">
      <button class="btn" id="t-tldr" aria-pressed="false" title="Show only the TL;DR of every part">TL;DR only</button>
      <button class="btn" id="t-focus" aria-pressed="false" title="Show one part at a time">Focus</button>
      <button class="btn" id="t-timer" title="25-minute study sprint">▶ 25:00</button>
      <button class="btn" id="t-theme" title="Switch light and dark">◐</button>
      <button class="btn" id="t-print" title="Print or save as PDF">Print</button>
    </div>
  </div>
</div>

<div class="wrap">
  <header class="hero">
    <p class="eyebrow">${escapeHtml(plan.eyebrow)}</p>
    <h1>${escapeHtml(plan.title)}</h1>
    <p class="lede">${escapeHtml(plan.lede)}</p>
    ${routes}
  </header>
</div>

<div class="shell">
  <nav class="rail" aria-label="Parts">
    <p class="rail-h">Parts</p>
    <ol>${rail}</ol>
    <p class="rail-h">Practice</p>
    <ol>
      ${flashcards ? '<li><a href="#cards"><span class="n">··</span><span>Cards</span><span></span></a></li>' : ""}
      ${glossary ? '<li><a href="#glossary"><span class="n">··</span><span>Glossary</span><span></span></a></li>' : ""}
      ${stories ? '<li><a href="#stories"><span class="n">··</span><span>Stories</span><span></span></a></li>' : ""}
      ${asks ? '<li><a href="#ask"><span class="n">··</span><span>Ask them</span><span></span></a></li>' : ""}
      ${checklist ? '<li><a href="#checklist"><span class="n">··</span><span>Checklist</span><span></span></a></li>' : ""}
    </ol>
  </nav>
  <main>
${partSections}
${flashcards}
${glossary}
${stories}
${asks}
${checklist}
${sources}
    <p class="caveat" style="margin-top:40px">${escapeHtml(origin)} for ${escapeHtml(meta.role)} at ${escapeHtml(meta.company)}. Written by a language model from the job posting and your profile — check anything you plan to assert out loud.</p>
  </main>
</div>
<div class="toast" id="toast" hidden></div>
<script>${HANDBOOK_JS}</script>
</body>
</html>
`;
}
