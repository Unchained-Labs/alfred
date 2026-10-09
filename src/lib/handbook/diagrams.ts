import type { HandbookDiagram } from "@/lib/ai/schemas";
import { escapeHtml } from "./markdown";

/*
 * Diagrams, drawn from data.
 *
 * The model describes a shape — a kind, some nodes, some edges — and this file
 * draws it. Nothing generated is ever interpolated as markup: labels go
 * through escapeHtml and geometry is computed here, so a handbook cannot ship
 * a diagram that is also a script.
 *
 * Drawing them in one place also means they animate consistently and all stop
 * animating together under `prefers-reduced-motion`, which the stylesheet
 * handles for every one of them at once.
 */

/** Nodes a model sent that we can actually draw. */
function usable(diagram: HandbookDiagram) {
  const nodes = (diagram.nodes ?? []).filter((n) => n.label?.trim()).slice(0, 6);
  // Indices arrive from a model, so anything out of range is dropped rather
  // than trusted into a path expression.
  const edges = (diagram.edges ?? []).filter(
    (e) =>
      Number.isInteger(e.from) &&
      Number.isInteger(e.to) &&
      e.from >= 0 &&
      e.to >= 0 &&
      e.from < nodes.length &&
      e.to < nodes.length &&
      e.from !== e.to,
  );
  return { nodes, edges };
}

const frame = (title: string, caption: string, inner: string) => `
<figure class="dgm">
  <figcaption class="dgm-head">
    <span class="dgm-title">${escapeHtml(title)}</span>
    <span class="dgm-tag">diagram</span>
  </figcaption>
  <div class="dgm-scroll">${inner}</div>
  ${caption?.trim() ? `<p class="dgm-cap">${escapeHtml(caption)}</p>` : ""}
</figure>`;

const ARROW = `<defs><marker id="dgm-arrow" viewBox="0 0 10 10" refX="9" refY="5"
  markerWidth="6" markerHeight="6" orient="auto-start-reverse">
  <path d="M0 0 L10 5 L0 10 z" fill="currentColor"/></marker></defs>`;

/** Stages something passes through, with dots travelling along the path. */
function flow(diagram: HandbookDiagram): string {
  const { nodes, edges } = usable(diagram);
  if (nodes.length < 2) return "";

  const W = 132,
    H = 60,
    GAP = 34,
    TOP = 44;
  const width = nodes.length * W + (nodes.length - 1) * GAP;
  const height = TOP + H + 46;
  const x = (i: number) => i * (W + GAP);
  const midY = TOP + H / 2;

  const boxes = nodes
    .map(
      (n, i) => `
  <g>
    <rect class="dgm-box" x="${x(i)}" y="${TOP}" width="${W}" height="${H}" rx="7"/>
    <text class="dgm-l" x="${x(i) + W / 2}" y="${TOP + (n.sub?.trim() ? 25 : 35)}" text-anchor="middle">${escapeHtml(n.label)}</text>
    ${
      n.sub?.trim()
        ? `<text class="dgm-s" x="${x(i) + W / 2}" y="${TOP + 42}" text-anchor="middle">${escapeHtml(n.sub)}</text>`
        : ""
    }
  </g>`,
    )
    .join("");

  // Forward arrows sit between consecutive boxes; a label on the matching edge
  // rides above its own arrow.
  const forward = nodes
    .slice(0, -1)
    .map((_, i) => {
      const from = x(i) + W;
      const to = x(i + 1);
      const label = edges.find((e) => e.from === i && e.to === i + 1)?.label;
      return `
  <path class="dgm-line" d="M${from + 4} ${midY} H${to - 6}" marker-end="url(#dgm-arrow)"/>
  ${
    label?.trim()
      ? `<text class="dgm-e" x="${(from + to) / 2}" y="${midY - 9}" text-anchor="middle">${escapeHtml(label)}</text>`
      : ""
  }`;
    })
    .join("");

  // A backwards edge is the thing people forget — what flows back up the
  // pipeline. Drawn as a dashed arc above, like a return path.
  const back = edges
    .filter((e) => e.to < e.from)
    .slice(0, 1)
    .map((e) => {
      const sx = x(e.from) + W / 2;
      const tx = x(e.to) + W / 2;
      return `
  <path class="dgm-back" d="M${sx} ${TOP - 6} C${sx} ${10}, ${tx} ${10}, ${tx} ${TOP - 6}" marker-end="url(#dgm-arrow)"/>
  ${
    e.label?.trim()
      ? `<text class="dgm-be" x="${(sx + tx) / 2}" y="${8}" text-anchor="middle">${escapeHtml(e.label)}</text>`
      : ""
  }`;
    })
    .join("");

  // Three dots, staggered, travelling the whole run. Pure CSS so the stylesheet's
  // reduced-motion rule stops them with everything else.
  const travel = [0, 1, 2]
    .map(
      (k) =>
        `<circle class="dgm-dot" cx="0" cy="${midY}" r="4.5" style="--dgm-from:${x(0) + W / 2}px;--dgm-to:${x(nodes.length - 1) + W / 2}px;animation-delay:${k * 1.5}s"/>`,
    )
    .join("");

  return frame(
    diagram.title,
    diagram.caption,
    `<svg viewBox="0 0 ${width} ${height}" style="min-width:${Math.min(width, 620)}px" role="img"
  aria-label="${escapeHtml(`${diagram.title}: ${nodes.map((n) => n.label).join(" then ")}`)}">
  ${ARROW}${back}${forward}${boxes}${travel}
</svg>`,
  );
}

/** Layers of a system, clickable, with the detail of the one you picked. */
function stack(diagram: HandbookDiagram): string {
  const { nodes } = usable(diagram);
  if (!nodes.length) return "";

  const rows = nodes
    .map(
      (n, i) => `
    <button type="button" class="dgm-layer" data-layer="${i}" aria-selected="${i === 0}"
      style="animation-delay:${i * 70}ms">
      <span class="n">L${nodes.length - i}</span>
      <span class="t">${escapeHtml(n.label)}</span>
    </button>`,
    )
    .join("");

  const panels = nodes
    .map(
      (n, i) => `
    <div class="dgm-panel" data-panel="${i}"${i === 0 ? "" : " hidden"}>
      <h4>${escapeHtml(n.label)}</h4>
      <p>${escapeHtml(n.sub?.trim() || "No detail given for this layer.")}</p>
    </div>`,
    )
    .join("");

  return frame(
    diagram.title,
    diagram.caption,
    `<div class="dgm-stack" data-stack>
    <div class="dgm-layers" role="tablist" aria-label="${escapeHtml(diagram.title)}">${rows}</div>
    <div class="dgm-panels">${panels}</div>
  </div>`,
  );
}

/** A loop that returns to its start, with a sweep going round it. */
function cycle(diagram: HandbookDiagram): string {
  const { nodes, edges } = usable(diagram);
  if (nodes.length < 3) return "";

  const R = 104,
    CX = 190,
    CY = 150,
    BOX_W = 116,
    BOX_H = 44;
  const pos = nodes.map((_, i) => {
    // Start at the top and go clockwise, which is how people read a cycle.
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / nodes.length;
    return { x: CX + R * Math.cos(a), y: CY + R * Math.sin(a) };
  });

  const arcs = nodes
    .map((_, i) => {
      const from = pos[i];
      const to = pos[(i + 1) % nodes.length];
      const label = edges.find(
        (e) => e.from === i && e.to === (i + 1) % nodes.length,
      )?.label;
      const mid = {
        x: (from.x + to.x) / 2,
        y: (from.y + to.y) / 2,
      };
      // Bow the connector outwards so it reads as a ring, not a polygon.
      const k = 1.22;
      const cx = CX + (mid.x - CX) * k;
      const cy = CY + (mid.y - CY) * k;
      return `
  <path class="dgm-line" d="M${from.x.toFixed(1)} ${from.y.toFixed(1)} Q${cx.toFixed(1)} ${cy.toFixed(1)}, ${to.x.toFixed(1)} ${to.y.toFixed(1)}"
    marker-end="url(#dgm-arrow)" fill="none"/>
  ${
    label?.trim()
      ? `<text class="dgm-e" x="${cx.toFixed(1)}" y="${(cy - 6).toFixed(1)}" text-anchor="middle">${escapeHtml(label)}</text>`
      : ""
  }`;
    })
    .join("");

  const boxes = nodes
    .map(
      (n, i) => `
  <g>
    <rect class="dgm-box" x="${(pos[i].x - BOX_W / 2).toFixed(1)}" y="${(pos[i].y - BOX_H / 2).toFixed(1)}"
      width="${BOX_W}" height="${BOX_H}" rx="7"/>
    <text class="dgm-l" x="${pos[i].x.toFixed(1)}" y="${(pos[i].y + (n.sub?.trim() ? -2 : 5)).toFixed(1)}" text-anchor="middle">${escapeHtml(n.label)}</text>
    ${
      n.sub?.trim()
        ? `<text class="dgm-s" x="${pos[i].x.toFixed(1)}" y="${(pos[i].y + 12).toFixed(1)}" text-anchor="middle">${escapeHtml(n.sub)}</text>`
        : ""
    }
  </g>`,
    )
    .join("");

  return frame(
    diagram.title,
    diagram.caption,
    `<svg viewBox="0 0 ${CX * 2} ${CY * 2}" style="min-width:320px;max-width:420px;margin-inline:auto" role="img"
  aria-label="${escapeHtml(`${diagram.title}: a cycle through ${nodes.map((n) => n.label).join(", then ")}, returning to the start`)}">
  ${ARROW}
  <circle class="dgm-ring" cx="${CX}" cy="${CY}" r="${R}"/>
  <g class="dgm-sweep" style="transform-origin:${CX}px ${CY}px">
    <line class="dgm-sweep-l" x1="${CX}" y1="${CY}" x2="${CX}" y2="${CY - R}"/>
  </g>
  ${arcs}${boxes}
</svg>`,
  );
}

/** Renders one diagram, or nothing when it cannot be drawn honestly. */
export function renderDiagram(diagram: HandbookDiagram): string {
  switch (diagram.kind) {
    case "flow":
      return flow(diagram);
    case "stack":
      return stack(diagram);
    case "cycle":
      return cycle(diagram);
    default:
      return "";
  }
}

export function renderDiagrams(diagrams: HandbookDiagram[] | undefined): string {
  return (diagrams ?? []).slice(0, 2).map(renderDiagram).filter(Boolean).join("\n");
}
