import * as React from "react";
import { cn } from "@/lib/utils";

/*
 * A small markdown renderer for AI-written prose — problem statements, rubric
 * requirements, grader feedback.
 *
 * It handles the subset a model actually emits when asked for markdown:
 * headings, lists, fenced code, blockquotes, and inline code / bold / italic /
 * links. Anything else falls through as text, which for a problem statement is
 * a cosmetic loss and never a broken page.
 *
 * It builds React nodes rather than HTML. There is no dangerouslySetInnerHTML
 * here and there should never be: this renders text that arrived from a
 * provider over the network, and the cost of being wrong about sanitising it
 * once is an injection into the page.
 */

const INLINE = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\n]+\*)|(\[[^\]]+\]\([^)\s]+\))/g;

function inline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let index = 0;

  for (const match of text.matchAll(INLINE)) {
    const start = match.index;
    if (start > last) nodes.push(text.slice(last, start));
    const token = match[0];
    const key = `${keyPrefix}-${index++}`;

    if (token.startsWith("`")) {
      nodes.push(
        <code
          key={key}
          className="bg-surface-3 text-ink rounded px-1 py-0.5 font-mono text-[0.9em]"
        >
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith("**")) {
      nodes.push(
        <strong key={key} className="text-ink font-semibold">
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (token.startsWith("*")) {
      nodes.push(<em key={key}>{token.slice(1, -1)}</em>);
    } else {
      const split = token.indexOf("](");
      const label = token.slice(1, split);
      const href = token.slice(split + 2, -1);
      // Only http(s): a generated `javascript:` link would otherwise be one
      // click from executing in the page.
      const safe = /^https?:\/\//i.test(href);
      nodes.push(
        safe ? (
          <a
            key={key}
            href={href}
            target="_blank"
            rel="noreferrer noopener"
            className="text-brand underline underline-offset-2"
          >
            {label}
          </a>
        ) : (
          <span key={key}>{label}</span>
        ),
      );
    }
    last = start + token.length;
  }

  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

type Block =
  | { type: "p" | "h1" | "h2" | "h3" | "quote"; text: string }
  | { type: "code"; text: string; lang?: string }
  | { type: "ul" | "ol"; items: string[] };

function parse(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (line.startsWith("```")) {
      const lang = line.slice(3).trim() || undefined;
      const body: string[] = [];
      index++;
      while (index < lines.length && !lines[index].startsWith("```")) {
        body.push(lines[index++]);
      }
      index++; // the closing fence, or the end of the input
      blocks.push({ type: "code", text: body.join("\n"), lang });
      continue;
    }

    if (!line.trim()) {
      index++;
      continue;
    }

    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      blocks.push({
        type: level === 1 ? "h1" : level === 2 ? "h2" : "h3",
        text: heading[2],
      });
      index++;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const body: string[] = [];
      while (index < lines.length && /^>\s?/.test(lines[index])) {
        body.push(lines[index++].replace(/^>\s?/, ""));
      }
      blocks.push({ type: "quote", text: body.join(" ") });
      continue;
    }

    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\s*[-*+]\s+/.test(lines[index])) {
        items.push(lines[index++].replace(/^\s*[-*+]\s+/, ""));
      }
      blocks.push({ type: "ul", items });
      continue;
    }

    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\s*\d+[.)]\s+/.test(lines[index])) {
        items.push(lines[index++].replace(/^\s*\d+[.)]\s+/, ""));
      }
      blocks.push({ type: "ol", items });
      continue;
    }

    // A paragraph runs until a blank line or the start of another block.
    const body: string[] = [];
    while (
      index < lines.length &&
      lines[index].trim() &&
      !lines[index].startsWith("```") &&
      !/^#{1,3}\s/.test(lines[index]) &&
      !/^>\s?/.test(lines[index]) &&
      !/^\s*[-*+]\s+/.test(lines[index]) &&
      !/^\s*\d+[.)]\s+/.test(lines[index])
    ) {
      body.push(lines[index++]);
    }
    blocks.push({ type: "p", text: body.join(" ") });
  }

  return blocks;
}

export function Prose({
  children,
  className,
}: {
  children: string | null | undefined;
  className?: string;
}) {
  if (!children?.trim()) return null;
  const blocks = parse(children);

  return (
    <div className={cn("text-ink-2 space-y-3 text-xs leading-relaxed", className)}>
      {blocks.map((block, index) => {
        const key = `block-${index}`;
        switch (block.type) {
          case "h1":
            return (
              <h2 key={key} className="text-ink pt-1 text-sm font-semibold">
                {inline(block.text, key)}
              </h2>
            );
          case "h2":
            return (
              <h3 key={key} className="text-ink pt-1 text-xs font-semibold">
                {inline(block.text, key)}
              </h3>
            );
          case "h3":
            return (
              <h4
                key={key}
                className="text-ink-muted pt-1 text-[11px] font-semibold tracking-wide uppercase"
              >
                {inline(block.text, key)}
              </h4>
            );
          case "code":
            return (
              <pre
                key={key}
                className="border-line bg-surface-2 text-ink overflow-x-auto rounded-lg border p-3 font-mono text-[11px] leading-relaxed"
              >
                <code>{block.text}</code>
              </pre>
            );
          case "quote":
            return (
              <blockquote
                key={key}
                className="border-line-strong text-ink-muted border-l-2 pl-3 italic"
              >
                {inline(block.text, key)}
              </blockquote>
            );
          case "ul":
            return (
              <ul key={key} className="list-disc space-y-1 pl-4.5">
                {block.items.map((item, itemIndex) => (
                  <li key={`${key}-${itemIndex}`}>
                    {inline(item, `${key}-${itemIndex}`)}
                  </li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol key={key} className="list-decimal space-y-1 pl-4.5">
                {block.items.map((item, itemIndex) => (
                  <li key={`${key}-${itemIndex}`}>
                    {inline(item, `${key}-${itemIndex}`)}
                  </li>
                ))}
              </ol>
            );
          default:
            return <p key={key}>{inline(block.text, key)}</p>;
        }
      })}
    </div>
  );
}
