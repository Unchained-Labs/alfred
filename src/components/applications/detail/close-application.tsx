"use client";

import { Archive, CircleSlash, Handshake, X } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Label, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import type { Application, ApplicationStage } from "@/db/schema";

const OUTCOMES: {
  stage: Extract<ApplicationStage, "rejected" | "withdrawn" | "accepted">;
  label: string;
  Icon: typeof X;
  tint: string;
  prompt: string;
  placeholder: string;
}[] = [
  {
    stage: "rejected",
    label: "Rejected",
    Icon: CircleSlash,
    tint: "var(--critical)",
    prompt: "What did they say?",
    placeholder:
      "Paste their email, or the gist of it. “Went with someone with more Kafka experience.”",
  },
  {
    stage: "withdrawn",
    label: "I withdrew",
    Icon: Archive,
    tint: "var(--stage-withdrawn)",
    prompt: "Why did you pull out?",
    placeholder:
      "Comp was too low, or the role drifted, or you took something else.",
  },
  {
    stage: "accepted",
    label: "Offer accepted",
    Icon: Handshake,
    tint: "var(--good)",
    prompt: "Anything worth remembering?",
    placeholder: "The final package, the start date, who to thank.",
  },
];

/**
 * Closing an application, in one decision.
 *
 * The feedback box is the reason this is a dialog rather than a stage change.
 * A rejection is the only time a company tells you anything true about your
 * application, and the moment it arrives is the only moment you will ever
 * bother writing it down.
 *
 * Clearing the prep is offered here for a practical reason: the dead work
 * piling up in the prep queue is what makes people avoid closing things at
 * all, which quietly ruins every number in the app.
 */
export function CloseApplication({
  app,
  openPrepCount,
  initialStage,
  open,
  onOpenChange,
}: {
  app: Application;
  openPrepCount: number;
  /** Preselected when the dialog is opened from the stage picker. */
  initialStage?: ApplicationStage;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const toast = useToast();

  const [stage, setStage] = React.useState<ApplicationStage>(
    initialStage ?? "rejected",
  );
  const [note, setNote] = React.useState("");
  const [clearTasks, setClearTasks] = React.useState(true);
  const [busy, setBusy] = React.useState(false);

  // The picker may name the outcome before the dialog opens; follow it without
  // clobbering a choice the user has since made in here.
  const [syncedInitial, setSyncedInitial] = React.useState(initialStage);
  if (initialStage !== syncedInitial) {
    setSyncedInitial(initialStage);
    if (initialStage) setStage(initialStage);
  }

  const outcome = OUTCOMES.find((o) => o.stage === stage) ?? OUTCOMES[0];

  async function submit() {
    setBusy(true);
    try {
      const response = await fetch(`/api/applications/${app.id}/close`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stage, outcomeNote: note, clearTasks }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Could not close it.");

      toast.success(
        `Closed as ${outcome.label.toLowerCase()}`,
        data.cleared
          ? `${data.cleared} prep item${data.cleared === 1 ? "" : "s"} cleared`
          : undefined,
      );
      onOpenChange(false);
      setNote("");
      router.refresh();
    } catch (error) {
      toast.error(
        "Could not close it",
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        width="md"
        title={`Close ${app.company}`}
        description="Record how it ended, and clear what it was costing you."
      >
        <div className="space-y-4">
          <div>
            <Label>Outcome</Label>
            <div className="mt-1 flex flex-wrap gap-2">
              {OUTCOMES.map(({ stage: value, label, Icon, tint }) => {
                const active = stage === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setStage(value)}
                    aria-pressed={active}
                    className="border-line inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors"
                    style={
                      active
                        ? {
                            borderColor: tint,
                            background: `color-mix(in oklab, ${tint} 12%, transparent)`,
                            color: tint,
                          }
                        : undefined
                    }
                  >
                    <Icon className="size-3.5" style={{ color: tint }} />
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <Label htmlFor="close-note">{outcome.prompt}</Label>
            <Textarea
              id="close-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={5}
              placeholder={outcome.placeholder}
              className="text-xs"
            />
            <p className="text-ink-muted mt-1 text-[11px]">
              Optional, and kept separate from your own notes. It is the only
              outside signal this application leaves behind — four of these side by
              side will tell you something.
            </p>
          </div>

          {openPrepCount > 0 ? (
            <label className="border-line bg-surface-2 flex cursor-pointer items-start gap-2.5 rounded-lg border p-3">
              <input
                type="checkbox"
                checked={clearTasks}
                onChange={(event) => setClearTasks(event.target.checked)}
                className="mt-0.5 size-4 cursor-pointer accent-[var(--brand)]"
              />
              <span className="min-w-0">
                <span className="text-ink block text-xs font-medium">
                  Clear the {openPrepCount} open prep item
                  {openPrepCount === 1 ? "" : "s"}
                </span>
                <span className="text-ink-muted block text-[11px] leading-relaxed">
                  Marked skipped, not deleted — they leave your queue and the
                  dashboard, and stay on the record so you can still see what this
                  loop was going to test.
                </span>
              </span>
            </label>
          ) : null}

          <div className="flex flex-wrap items-center justify-end gap-2">
            <DialogClose asChild>
              <Button variant="ghost" disabled={busy}>
                Cancel
              </Button>
            </DialogClose>
            <Button variant="primary" onClick={submit} loading={busy}>
              Close as {outcome.label.toLowerCase()}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
