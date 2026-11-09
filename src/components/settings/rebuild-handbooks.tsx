"use client";

import { BookOpen, Sparkles } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";

/**
 * Queue every handbook for a rebuild. "Add scenes and labs" keeps the text and
 * fills in what an older handbook is missing; "Rewrite all" starts each one
 * again from its outline. Both are ordinary queued jobs.
 */
export function RebuildHandbooksCard() {
  const toast = useToast();
  const [busy, setBusy] = React.useState<"upgrade" | "rewrite" | null>(null);
  const [confirming, setConfirming] = React.useState(false);

  async function rebuild(mode: "upgrade" | "rewrite") {
    setBusy(mode);
    setConfirming(false);
    try {
      const response = await fetch("/api/handbooks/rebuild", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const data = (await response.json()) as {
        handbooks?: number;
        error?: string;
      };
      if (!response.ok)
        throw new Error(data.error ?? "Could not queue the rebuild.");
      toast.success(
        data.handbooks ? "Queued" : "No handbooks yet",
        data.handbooks
          ? `${data.handbooks} handbook${data.handbooks === 1 ? "" : "s"} — watch them in the queue below.`
          : "Build one from an application first.",
      );
    } catch (error) {
      toast.error(
        "Rebuild failed",
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="size-4" style={{ color: "var(--brand)" }} />
            Handbooks
          </CardTitle>
          <p className="text-ink-muted mt-0.5 text-xs">
            Handbooks now come with animated scenes, Python you can run, and
            practice problems with tests. Older ones can get them added, or be
            rewritten from scratch with them in mind.
          </p>
        </div>
      </CardHeader>
      <CardBody className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => rebuild("upgrade")}
          loading={busy === "upgrade"}
          disabled={busy !== null}
        >
          <Sparkles className="size-3.5" />
          Add scenes and labs
        </Button>
        {confirming ? (
          <>
            <Button
              size="sm"
              variant="danger"
              onClick={() => rebuild("rewrite")}
              loading={busy === "rewrite"}
            >
              Rewrite every handbook
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              Keep them
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setConfirming(true)}
            disabled={busy !== null}
          >
            Rewrite all
          </Button>
        )}
      </CardBody>
    </Card>
  );
}
