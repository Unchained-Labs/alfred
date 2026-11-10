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
import { CheckIns } from "@/components/jobs/application-jobs";
import { useApplicationJobsContext } from "@/components/jobs/jobs-context";
import { isPending } from "@/components/jobs/use-queued-job";
import { relativeDay } from "@/lib/utils";

export type HandbookSummary = {
  id: string;
  title: string;
  parts: number;
  createdAt: Date | null;
  model: string | null;
  /** False when something is unwritten: prose, a part's lab, or the drills. */
  complete: boolean;
};

const HANDBOOK_KINDS = new Set([
  "handbook_outline",
  "handbook_part",
  "handbook_lab",
  "handbook_drills",
]);

/**
 * The learning handbook: one long-form study document per application.
 *
 * It opens in a new tab rather than inside the app, because it is a whole
 * document with its own navigation, and the download is the same bytes — what
 * the reader keeps is exactly what they read.
 *
 * Building it is a chain of queued jobs (outline → each part → drills) that
 * the server runs whether or not this page is open; this panel only starts the
 * chain and reports on it, from the page's shared job poller.
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
  const shared = useApplicationJobsContext();
  const [starting, setStarting] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);

  const chain = (shared?.jobs ?? []).filter((j) => HANDBOOK_KINDS.has(j.kind));
  const pending = chain.filter(isPending);
  const running = pending.find((j) => j.status === "running");
  const parts = chain.filter(
    (j) => j.kind === "handbook_part" && j.status !== "cancelled",
  );
  const partsDone = parts.filter((j) => j.status === "succeeded").length;
  const busy = starting || pending.length > 0;
  const progress = !busy
    ? null
    : running?.label
      ? `${running.label}${parts.length ? ` · ${partsDone} of ${parts.length} parts written` : ""}`
      : pending.length
        ? pending[0].dependsOn.length
          ? "Queued — waiting for the prep plan it teaches from"
          : "Queued"
        : "Queuing";

  // Toast once when a chain this panel watched settles.
  const wasBusy = React.useRef(busy);
  React.useEffect(() => {
    if (wasBusy.current && !busy && chain.length) {
      const failed = chain.find((j) => j.status === "failed");
      if (failed) toast.error("Handbook step failed", failed.error ?? "");
      else toast.success("Handbook ready");
    }
    wasBusy.current = busy;
  }, [busy, chain, toast]);

  /**
   * Queues the outline; its job queues the parts and the drills. Without
   * `regenerate`, an existing outline is kept and only the unwritten steps are
   * queued — which is how a half-built handbook gets finished.
   */
  async function build(regenerate: boolean) {
    setStarting(true);
    setConfirming(false);
    try {
      const response = await fetch(`/api/applications/${applicationId}/handbook`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ regenerate }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error ?? "Could not build the handbook.");
      shared?.refresh();
      if (!shared) router.refresh();
    } catch (error) {
      toast.error(
        "Could not build it",
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setStarting(false);
    }
  }

  async function remove() {
    setDeleting(true);
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
      setDeleting(false);
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
          {shared ? <CheckIns jobs={chain} onChange={shared.refresh} /> : null}
          <p className="text-ink-muted text-xs leading-relaxed">
            The parts get written first, one at a time, then the cards and glossary
            drill the ground they actually cover. It is the longest thing Alfred
            writes, and it carries on if you close this page.
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
          {!handbook.complete && !busy ? (
            <div className="space-y-2 rounded-md border p-3 text-xs">
              <p className="text-ink-muted leading-relaxed">
                Something is missing: some parts, their animated scenes and Python
                lab, or the practice cards. Handbooks written before scenes existed
                show this too. Finishing fills in only what is missing; Rebuild
                rewrites it all.
              </p>
              <Button variant="primary" size="sm" onClick={() => build(false)}>
                <Sparkles className="size-3.5" />
                Finish it
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
                <Button
                  size="sm"
                  variant="danger"
                  onClick={remove}
                  loading={deleting}
                >
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
