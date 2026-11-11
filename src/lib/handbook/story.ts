import {
  type HandbookBeat,
  handbookDiagramSchema,
  type HandbookPart,
} from "@/lib/ai/schemas";
import { renderDiagram } from "./diagrams";
import { renderCells, renderProblems } from "./lab";
import { escapeHtml, inlineMarkdown, renderMarkdown } from "./markdown";
import { cleanScene, renderScene } from "./scenes";

/*
 * A part told as a story: a goal, then beats — each a question, the picture
 * that answers it, and a few sentences under the picture — and only then the
 * exercises, folded away in "Go deeper" until the reader opens them.
 *
 * The page order is the teaching order. A prose part printed its whole essay
 * and then every picture after it, so the reader met each idea in words long
 * before they saw it. Here each picture sits where its idea is introduced,
 * and nothing asks the reader to practise an idea they have not been shown.
 */

/**
 * The beats as plain markdown. Stored as the part's body: the exercises are
 * written from it, and a part with a body counts as written.
 */
export function storyMarkdown(story: {
  goal: string;
  beats: HandbookBeat[];
}): string {
  const beats = story.beats.map((b) => {
    const scene = cleanScene(b.scene);
    const diagram = handbookDiagramSchema.safeParse(b.diagram).data;
    const picture = scene
      ? `*Scene: ${scene.title}.* ${scene.steps.map((s) => s.caption).join(" ")}`
      : diagram
        ? `*Diagram: ${diagram.title}* — ${diagram.nodes.map((n) => n.label).join(" → ")}. ${diagram.caption}`
        : "";
    return `### ${b.hook}\n\n${picture}\n\n${b.say}`;
  });
  return [`**${story.goal}**`, ...beats].join("\n\n");
}

function renderPicture(beat: HandbookBeat, key: string): string {
  if (beat.scene) return renderScene(beat.scene, key);
  const diagram = handbookDiagramSchema.safeParse(beat.diagram);
  return diagram.success ? renderDiagram(diagram.data) : "";
}

/** The goal and the beats, in reading order. */
export function renderStory(part: HandbookPart, key: string): string {
  const beats = (part.beats ?? [])
    .map(
      (
        b,
        i,
        all,
      ) => `<section class="beat" aria-label="${escapeHtml(`Step ${i + 1} of ${all.length}: ${b.hook}`)}">
  <h3 class="beat-hook"><span class="beat-n">${i + 1}</span>${inlineMarkdown(b.hook)}</h3>
  ${renderPicture(b, `${key}-b${i}`)}
  <div class="beat-say">${renderMarkdown(b.say)}</div>
</section>`,
    )
    .join("");
  const goal = part.goal?.trim()
    ? `<p class="goal"><span class="goal-l">Goal</span>${inlineMarkdown(part.goal)}</p>`
    : "";
  return `${goal}<div class="beats">${beats}</div>`;
}

/**
 * Everything after the story: callouts, notebook cells and problems, closed
 * by default. Empty when the part has none of them.
 */
export function renderDeeper(
  part: HandbookPart,
  key: string,
  notes: string,
): string {
  const cells = renderCells(part.lab?.cells, key);
  const problems = renderProblems(part.lab?.problems, key);
  if (!notes && !cells && !problems) return "";
  const count = (n: number, one: string, many: string) =>
    n ? `${n} ${n === 1 ? one : many}` : "";
  // Counted from what rendered: a cell or problem that failed validation is
  // dropped, and the summary must not promise it.
  const what = [
    count(
      cells.split('<div class="cell"').length - 1,
      "notebook cell",
      "notebook cells",
    ),
    count(problems.split('<div class="prob"').length - 1, "problem", "problems"),
    notes ? "notes for the room" : "",
  ]
    .filter(Boolean)
    .join(" · ");
  return `<details class="deeper">
  <summary><span class="deeper-t">Go deeper</span><span class="deeper-w">${escapeHtml(what)}</span></summary>
  <div class="deeper-b">${notes}${cells}${problems}</div>
</details>`;
}
