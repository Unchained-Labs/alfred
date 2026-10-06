"use client";

import { Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Prose } from "@/components/ui/prose";
import { useStoredCount } from "@/lib/use-stored";

/**
 * Hints, one at a time.
 *
 * The revealed count persists per exercise, so reloading does not re-hide
 * something you already read — while still refusing to hand over all four at
 * once, which is the only thing that makes a hint a hint rather than a
 * staggered solution.
 */
export function Hints({
  hints,
  exerciseId,
}: {
  hints: string[];
  exerciseId: string;
}) {
  const [revealed, setRevealed] = useStoredCount(`alfred:hints:${exerciseId}`);
  const shown = Math.min(revealed, hints.length);

  if (!hints.length) return null;

  return (
    <div className="space-y-2.5">
      {hints.slice(0, shown).map((hint, index) => (
        <div key={index} className="border-line bg-surface-2 rounded-lg border p-3">
          <p className="text-ink-muted mb-1 text-[10px] font-medium tracking-wide uppercase">
            Hint {index + 1}
          </p>
          <Prose>{hint}</Prose>
        </div>
      ))}

      {shown < hints.length ? (
        <Button size="sm" variant="ghost" onClick={() => setRevealed(shown + 1)}>
          <Lightbulb className="size-3.5" />
          {shown === 0
            ? `Give me a hint (${hints.length})`
            : `Another hint (${hints.length - shown} left)`}
        </Button>
      ) : (
        <p className="text-ink-muted text-[11px]">
          That is every hint. The rest is yours.
        </p>
      )}
    </div>
  );
}
