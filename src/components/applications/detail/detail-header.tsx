"use client";

import { AlertDialog as RAlertDialog } from "radix-ui";
import {
  ArrowLeft,
  CalendarClock,
  ExternalLink,
  Pencil,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { ApplicationForm } from "@/components/applications/application-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import type { Application, ApplicationStage } from "@/db/schema";
import { ALL_STAGES, STAGE_META } from "@/lib/stages";
import { formatSalary, hueFromString, initials, relativeDay } from "@/lib/utils";

const STAGE_OPTIONS = ALL_STAGES.map((stage) => ({
  value: stage,
  label: STAGE_META[stage].label,
}));

export function DetailHeader({ app }: { app: Application }) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = React.useState(false);
  const [stage, setStage] = React.useState<string>(app.stage);
  const [moving, setMoving] = React.useState(false);

  // Keep the picker aligned with the server after a refresh.
  React.useEffect(() => setStage(app.stage), [app.stage]);

  const salary = formatSalary(app.salaryMin, app.salaryMax, app.currency ?? "USD");
  const hue = hueFromString(app.company);

  async function changeStage(next: string) {
    const previous = stage;
    setStage(next);
    setMoving(true);
    try {
      const response = await fetch(`/api/applications/${app.id}/move`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stage: next as ApplicationStage }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? "Could not change the stage.");
      }
      toast.success(`Moved to ${STAGE_META[next as ApplicationStage].label}`);
      router.refresh();
    } catch (error) {
      setStage(previous);
      toast.error("Stage change failed", error instanceof Error ? error.message : "");
    } finally {
      setMoving(false);
    }
  }

  async function remove() {
    try {
      const response = await fetch(`/api/applications/${app.id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Could not delete the application.");
      toast.success("Application deleted");
      router.push("/pipeline");
    } catch (error) {
      toast.error("Delete failed", error instanceof Error ? error.message : "");
    }
  }

  return (
    <>
      <Link
        href="/pipeline"
        className="mb-4 inline-flex items-center gap-1.5 text-xs text-ink-muted transition-colors hover:text-ink"
      >
        <ArrowLeft className="size-3.5" />
        Pipeline
      </Link>

      <div className="card card-lit relative mb-4 overflow-hidden">
        <div className="aurora" />
        <div className="relative flex flex-wrap items-start gap-4 p-5">
          <span
            className="grid size-12 shrink-0 place-items-center rounded-xl text-sm font-semibold"
            style={{
              background: `oklch(0.62 0.12 ${hue} / 0.18)`,
              color: `oklch(0.72 0.11 ${hue})`,
            }}
            aria-hidden
          >
            {initials(app.company)}
          </span>

          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold tracking-tight text-ink">
              {app.title}
            </h1>
            <p className="mt-0.5 text-sm text-ink-2">
              {app.company}
              {app.location ? ` · ${app.location}` : ""}
            </p>

            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              {app.workMode ? <Badge>{app.workMode}</Badge> : null}
              {app.seniority ? <Badge>{app.seniority}</Badge> : null}
              {salary ? <Badge tint="var(--series-3)">{salary}</Badge> : null}
              {(app.tags ?? []).map((tag) => (
                <Badge key={tag}>{tag}</Badge>
              ))}
              {app.nextActionAt ? (
                <span className="inline-flex items-center gap-1 text-[11px] text-ink-muted">
                  <CalendarClock className="size-3" />
                  {app.nextActionLabel ?? "Follow up"}{" "}
                  {relativeDay(app.nextActionAt)}
                </span>
              ) : null}
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Select
              value={stage}
              onValueChange={changeStage}
              options={STAGE_OPTIONS}
              disabled={moving}
              className="w-36"
              ariaLabel="Pipeline stage"
            />
            {app.jobUrl ? (
              <Button asChild variant="outline" size="icon" aria-label="Open posting">
                <a href={app.jobUrl} target="_blank" rel="noreferrer noopener">
                  <ExternalLink className="size-3.5" />
                </a>
              </Button>
            ) : null}
            <Button
              variant="outline"
              size="icon"
              onClick={() => setEditing(true)}
              aria-label="Edit application"
            >
              <Pencil className="size-3.5" />
            </Button>

            <RAlertDialog.Root>
              <RAlertDialog.Trigger asChild>
                <Button variant="ghost" size="icon" aria-label="Delete application">
                  <Trash2 className="size-3.5" />
                </Button>
              </RAlertDialog.Trigger>
              <RAlertDialog.Portal>
                <RAlertDialog.Overlay className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm" />
                <RAlertDialog.Content className="fixed top-1/2 left-1/2 z-50 w-[calc(100vw-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-line bg-surface p-5 shadow-[var(--shadow-pop)]">
                  <RAlertDialog.Title className="text-sm font-semibold text-ink">
                    Delete this application?
                  </RAlertDialog.Title>
                  <RAlertDialog.Description className="mt-1.5 text-xs leading-relaxed text-ink-muted">
                    {app.title} at {app.company}, along with its analysis, prep
                    plan, questionnaire, and timeline. This cannot be undone.
                  </RAlertDialog.Description>
                  <div className="mt-5 flex justify-end gap-2">
                    <RAlertDialog.Cancel asChild>
                      <Button variant="ghost" size="sm">
                        Keep it
                      </Button>
                    </RAlertDialog.Cancel>
                    <RAlertDialog.Action asChild>
                      <Button variant="danger" size="sm" onClick={remove}>
                        Delete
                      </Button>
                    </RAlertDialog.Action>
                  </div>
                </RAlertDialog.Content>
              </RAlertDialog.Portal>
            </RAlertDialog.Root>
          </div>
        </div>
      </div>

      <ApplicationForm
        open={editing}
        onOpenChange={setEditing}
        application={app}
      />
    </>
  );
}
