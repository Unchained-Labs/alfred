/*
 * Markdown subset → HTML, for handbook content.
 *
 * Every piece of text here arrived from an AI provider over the network, so
 * the one rule this file exists to enforce is that NOTHING reaches the output
 * unescaped. There is no raw-HTML passthrough and there must never be one: the
 * handbook is rendered into a page the user opens, and a single `<script>` in a
 * generated table cell would execute there.
 *
 * It handles what a model actually emits when asked for markdown — headings,
 * paragraphs, lists, pipe tables, fenced code, blockquotes, and inline
 * code/bold/italic/links. Anything else degrades to text, which for a study
 * document is a cosmetic loss and never a broken page.
 */

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const INLINE = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\n]+\*)|(\[[^\]]+\]\([^)\s]+\))/g;

/** Inline spans. Escapes first, then re-introduces only the tags we chose. */
export function inlineMarkdown(text: string): string {
  let out = "";
  let last = 0;

  for (const match of text.matchAll(INLINE)) {
    const start = match.index;
    out += escapeHtml(text.slice(last, start));
    const token = match[0];

    if (token.startsWith("`")) {
      out += `<code>${escapeHtml(token.slice(1, -1))}</code>`;
    } else if (token.startsWith("**")) {
      out += `<strong>${escapeHtml(token.slice(2, -2))}</strong>`;
    } else if (token.startsWith("*")) {
      out += `<em>${escapeHtml(token.slice(1, -1))}</em>`;
    } else {
      const split = token.indexOf("](");
      const label = escapeHtml(token.slice(1, split));
      const href = token.slice(split + 2, -1);
      // http(s) only. A generated `javascript:` href would otherwise be one
      // click from running in the reader's browser.
      out += /^https?:\/\//i.test(href)
        ? `<a href="${escapeHtml(href)}" target="_blank" rel="noreferrer noopener">${label}</a>`
        : label;
    }
    last = start + token.length;
  }

  return out + escapeHtml(text.slice(last));
}

const isHeading = (l: string) => /^#{2,4}\s+/.test(l);
const isUl = (l: string) => /^\s*[-*+]\s+/.test(l);
const isOl = (l: string) => /^\s*\d+[.)]\s+/.test(l);
const isQuote = (l: string) => /^>\s?/.test(l);
const isFence = (l: string) => l.startsWith("```");
/** A pipe table row: at least two cells, and not a list item that happens to contain a pipe. */
const isTableRow = (l: string) => /^\s*\|.*\|\s*$/.test(l);
const isTableRule = (l: string) => /^\s*\|[\s:|-]+\|\s*$/.test(l);

const cells = (row: string) =>
  row
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());

/** Block-level markdown. Returns an HTML string. */
export function renderMarkdown(source: string): string {
  const lines = (source ?? "").replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (isFence(line)) {
      const lang = line.slice(3).trim();
      const body: string[] = [];
      i++;
      while (i < lines.length && !isFence(lines[i])) body.push(lines[i++]);
      i++; // closing fence, or end of input
      const cls = lang ? ` data-lang="${escapeHtml(lang)}"` : "";
      out.push(`<pre${cls}><code>${escapeHtml(body.join("\n"))}</code></pre>`);
      continue;
    }

    if (!line.trim()) {
      i++;
      continue;
    }

    const heading = /^(#{2,4})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length; // 2..4
      out.push(`<h${level}>${inlineMarkdown(heading[2].trim())}</h${level}>`);
      i++;
      continue;
    }

    // A table needs a header row followed by a |---|---| rule; without the
    // rule it is just a line with pipes in it.
    if (isTableRow(line) && i + 1 < lines.length && isTableRule(lines[i + 1])) {
      const headers = cells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && isTableRow(lines[i])) rows.push(cells(lines[i++]));
      const head = headers.map((h) => `<th>${inlineMarkdown(h)}</th>`).join("");
      const body = rows
        .map(
          (r) =>
            `<tr>${headers
              .map((_, c) => `<td>${inlineMarkdown(r[c] ?? "")}</td>`)
              .join("")}</tr>`,
        )
        .join("");
      out.push(
        `<div class="tbl"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`,
      );
      continue;
    }

    if (isQuote(line)) {
      const body: string[] = [];
      while (i < lines.length && isQuote(lines[i])) {
        body.push(lines[i++].replace(/^>\s?/, ""));
      }
      out.push(`<blockquote>${inlineMarkdown(body.join(" "))}</blockquote>`);
      continue;
    }

    if (isUl(line) || isOl(line)) {
      const ordered = isOl(line);
      const match = ordered ? isOl : isUl;
      const strip = ordered ? /^\s*\d+[.)]\s+/ : /^\s*[-*+]\s+/;
      const items: string[] = [];
      while (i < lines.length && match(lines[i])) {
        items.push(lines[i++].replace(strip, ""));
      }
      const tag = ordered ? "ol" : "ul";
      out.push(
        `<${tag}>${items.map((t) => `<li>${inlineMarkdown(t)}</li>`).join("")}</${tag}>`,
      );
      continue;
    }

    // A paragraph runs until a blank line or the start of another block.
    const body: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !isFence(lines[i]) &&
      !isHeading(lines[i]) &&
      !isQuote(lines[i]) &&
      !isUl(lines[i]) &&
      !isOl(lines[i]) &&
      !(isTableRow(lines[i]) && isTableRule(lines[i + 1] ?? ""))
    ) {
      body.push(lines[i++]);
    }
    out.push(`<p>${inlineMarkdown(body.join(" "))}</p>`);
  }

  return out.join("\n");
}

/** A slug safe to use as an id and a fragment. */
export function slug(value: string, fallback = "part"): string {
  const s = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || fallback;
}
