import { ArrowRight, Sparkles } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { Button } from "@/components/ui/button";

export function SetupNudge({
  needsProvider,
  needsProfile,
}: {
  needsProvider: boolean;
  needsProfile: boolean;
}) {
  if (!needsProvider && !needsProfile) return null;

  const message = needsProvider
    ? "Connect an AI provider — Claude, any OpenAI-compatible endpoint, or your own agent — to unlock fit analysis and prep plans."
    : "Add your background in Settings. Alfred's analysis is only as specific as the résumé it has to work from.";

  return (
    <div className="card card-lit relative mb-6 overflow-hidden p-4">
      <div className="aurora" />
      <div className="relative flex flex-wrap items-center gap-4">
        <span
          className="grid size-9 shrink-0 place-items-center rounded-xl border"
          style={{
            borderColor: "color-mix(in oklab, var(--brand) 35%, transparent)",
            background: "var(--brand-wash)",
          }}
        >
          <Sparkles className="size-4" style={{ color: "var(--brand)" }} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-ink text-sm font-medium">
            {needsProvider
              ? "Alfred isn't connected yet"
              : "Tell Alfred about yourself"}
          </p>
          <p className="text-ink-muted mt-0.5 text-xs leading-relaxed">{message}</p>
        </div>
        <Button asChild variant="primary">
          <Link href="/settings">
            Open settings
            <ArrowRight className="size-3.5" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
