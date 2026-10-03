import { AlertTriangle, Check, Minus } from "lucide-react";
import * as React from "react";
import { Tooltip } from "@/components/ui/tooltip";
import type { SkillMatch } from "@/db/schema";

/**
 * Skill coverage. `level` is a state, not a series, so it takes the reserved
 * status palette — and every row ships the icon + label pairing that keeps a
 * status color from carrying meaning alone.
 */
const LEVELS = {
  have: { color: "var(--good)", label: "Have it", Icon: Check, fill: 1 },
  partial: { color: "var(--warning)", label: "Partial", Icon: Minus, fill: 0.55 },
  gap: { color: "var(--critical)", label: "Gap", Icon: AlertTriangle, fill: 0.18 },
} as const;

export function SkillBars({ skills }: { skills: SkillMatch[] }) {
  if (!skills.length) {
    return (
      <p className="text-ink-muted py-4 text-center text-xs">
        No skills extracted from this posting.
      </p>
    );
  }

  const counts = {
    have: skills.filter((skill) => skill.level === "have").length,
    partial: skills.filter((skill) => skill.level === "partial").length,
    gap: skills.filter((skill) => skill.level === "gap").length,
  };

  return (
    <div className="space-y-3">
      {/* Legend — required for more than one level on screen. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {(["have", "partial", "gap"] as const).map((level) => {
          const { color, label, Icon } = LEVELS[level];
          return (
            <span
              key={level}
              className="text-ink-muted inline-flex items-center gap-1.5 text-[11px]"
            >
              <Icon className="size-3" style={{ color }} />
              {label}
              <span className="tnum text-ink-2 font-semibold">{counts[level]}</span>
            </span>
          );
        })}
      </div>

      <ul className="space-y-1.5">
        {skills.map((skill) => {
          const { color, label, Icon, fill } = LEVELS[skill.level] ?? LEVELS.gap;
          return (
            <li key={`${skill.skill}-${skill.level}`}>
              <Tooltip content={skill.note ? `${label} — ${skill.note}` : label}>
                <div className="flex cursor-default items-center gap-2.5">
                  <Icon className="size-3 shrink-0" style={{ color }} />
                  <span className="text-ink-2 w-32 shrink-0 truncate text-xs sm:w-40">
                    {skill.skill}
                  </span>
                  <div className="bg-surface-2 h-2 min-w-0 flex-1 overflow-hidden rounded-sm">
                    <div
                      className="h-full rounded-r-[4px]"
                      style={{
                        width: `${fill * 100}%`,
                        backgroundColor: color,
                      }}
                    />
                  </div>
                  <span className="text-ink-muted w-14 shrink-0 text-right text-[10px]">
                    {label}
                  </span>
                </div>
              </Tooltip>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
