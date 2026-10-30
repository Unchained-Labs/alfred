"use client";

import {
  BookOpen,
  Download,
  ExternalLink,
  RefreshCw,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, ThinkingRows } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { relativeDay } from "@/lib/utils";

export type HandbookSummary = {
  id: string;
  title: string;
  parts: number;
  createdAt: Date | null;
  model: string | null;
  /** False when a build stopped partway: an outline with parts unwritten. */
  complete: boolean;
};

/** What the server says is left to do, after every step. */
type HandbookStep = {
  title: string;
  parts: number;
  partsWritten: number;
  partTitles: string[];
  nextStep: { step: "part"; index: number } | { step: "drills" } | null;
  cards?: number;
};

/**
 * The learning handbook: one long-form study document per application.
 *
 * It opens in a new tab rather than inside the app, because it is a whole
 * document with its own navigation, and the download is the same bytes — what
 * the reader keeps is exactly what they read.
 */
export function HandbookPanel({
  applicationId,
  handbook,
  hasDescription,
}: {
  applicationId: string;
  handbook: HandbookSummary | null;
  hasDescription: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  const [progress, setProgress] = React.useState<string | null>(null);

  async function step(body: Record<string, unknown>): Promise<HandbookStep> {
    const response = await fetch(`/api/applications/${applicationId}/handbook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error ?? "Could not build the handbook.");
    }
    return data as HandbookStep;
  }

  /**
   * The server builds a handbook one step per request — outline, each part,
   * then the drills — and says after each what is left. Drive it to the end.
   * Without `regenerate`, an existing outline is reused, so a build that
   * stopped partway resumes at the first unwritten part.
   */
  async function build(regenerate: boolean) {
    setBusy(true);
    setConfirming(false);
    setProgress("Planning the parts");
    try {
      let state = await step({ step: "outline", regenerate });
      while (state.nextStep) {
        const next = state.nextStep;
        setProgress(
          next.step === "part"
            ? `Writing part ${next.index + 1} of ${state.parts}: ${state.partTitles[next.index] ?? ""}`
            : "Writing the cards, glossary and checklist",
        );
        // One retry per step: a single clipped or malformed response should
        // not cost the parts already written.
        try {
          state = await step(next);
        } catch {
          state = await step(next);
        }
      }
      toast.success(
        "Handbook ready",
        `${state.parts} parts${state.cards ? `, ${state.cards} cards` : ""}`,
      );
      router.refresh();
    } catch (error) {
      toast.error(
        "Could not build it",
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      const response = await fetch(`/api/applications/${applicationId}/handbook`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Could not delete the handbook.");
      setConfirming(false);
      router.refresh();
    } catch (error) {
      toast.error("Delete failed", error instanceof Error ? error.message : "");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="size-4" style={{ color: "var(--brand)" }} />
            Learning handbook
          </CardTitle>
          <p className="text-ink-muted mt-0.5 text-xs">
            {handbook
              ? `${handbook.parts} parts · built ${handbook.createdAt ? relativeDay(handbook.createdAt) : "recently"}`
              : "A long-form study guide for this role, with cards and a glossary"}
          </p>
        </div>
        {handbook ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => build(true)}
            loading={busy}
          >
            <RefreshCw className="size-3.5" />
            Rebuild
          </Button>
        ) : null}
      </CardHeader>

      {busy && progress ? (
        <CardBody className="space-y-3">
          <p className="text-ink text-sm font-medium">{progress}</p>
          <p className="text-ink-muted text-xs leading-relaxed">
            Two passes: the parts get written first, then the cards and glossary
            drill the ground they actually cover. This takes a couple of minutes —
            it is the longest thing Alfred writes.
          </p>
          <ThinkingRows rows={5} />
        </CardBody>
      ) : !handbook ? (
        <EmptyState
          icon={BookOpen}
          title="No handbook yet"
          description={
            hasDescription
              ? "Alfred will teach what this interview tests — the company, the substance, their hard problems, and what to say — then add flashcards, a glossary and a story bank."
              : "Paste the job description first. A handbook built without the posting is generic advice."
          }
          action={
            <Button
              variant="primary"
              onClick={() => build(false)}
              disabled={!hasDescription}
            >
              <Sparkles className="size-3.5" />
              Build the handbook
            </Button>
          }
          compact
        />
      ) : (
        <CardBody className="space-y-3">
          <p className="text-ink text-sm font-medium">{handbook.title}</p>
          {!handbook.complete ? (
            <div className="space-y-2 rounded-md border p-3 text-xs">
              <p className="text-ink-muted leading-relaxed">
                This build stopped partway: the outline is there, but some parts
                or the practice material are not written yet.
              </p>
              <Button variant="primary" size="sm" onClick={() => build(false)}>
                <Sparkles className="size-3.5" />
                Finish writing it
              </Button>
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tint="var(--brand-accent)">{handbook.parts} parts</Badge>
            {handbook.model ? <Badge>{handbook.model}</Badge> : null}
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {/* A new tab, not a route change: it is its own document, and
                losing your place in it to the back button is annoying. */}
            <Button variant="primary" size="sm" asChild>
              <a
                href={`/handbook/${applicationId}`}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink className="size-3.5" />
                Open handbook
              </a>
            </Button>
            <Button variant="secondary" size="sm" asChild>
              <a href={`/handbook/${applicationId}?download=1`}>
                <Download className="size-3.5" />
                Download
              </a>
            </Button>
            {confirming ? (
              <>
                <Button size="sm" variant="danger" onClick={remove} loading={busy}>
                  Delete it
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setConfirming(false)}
                >
                  Keep
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setConfirming(true)}
                aria-label="Delete handbook"
              >
                <Trash2 className="size-3.5" />
              </Button>
            )}
          </div>
          <p className="text-ink-muted text-[11px] leading-relaxed">
            The downloaded file works offline and keeps your progress, ticks and
            drafted stories in whichever browser you open it in.
          </p>
        </CardBody>
      )}
    </Card>
  );
}
