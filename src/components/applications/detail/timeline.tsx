"use client";

import {
  ArrowRight,
  Mail,
  MessageSquarePlus,
  Plus,
  Sparkles,
  StickyNote,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import type { Event } from "@/db/schema";
import { formatDateTime } from "@/lib/utils";

const EVENT_STYLE = {
  created: { Icon: Plus, tint: "var(--ink-muted)" },
  stage_change: { Icon: ArrowRight, tint: "var(--series-1)" },
  note: { Icon: StickyNote, tint: "var(--series-4)" },
  email: { Icon: Mail, tint: "var(--series-3)" },
  interview: { Icon: Users, tint: "var(--series-7)" },
  task: { Icon: Plus, tint: "var(--series-2)" },
  ai: { Icon: Sparkles, tint: "var(--brand)" },
} as const;

export function Timeline({
  applicationId,
  events,
}: {
  applicationId: string;
  events: Event[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [note, setNote] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [composing, setComposing] = React.useState(false);

  async function addNote() {
    if (!note.trim()) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/applications/${applicationId}/notes`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: note }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? "Could not add the note.");
      }
      setNote("");
      setComposing(false);
      router.refresh();
    } catch (error) {
      toast.error("Note failed", error instanceof Error ? error.message : "");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Timeline</CardTitle>
        {!composing ? (
          <Button size="sm" variant="ghost" onClick={() => setComposing(true)}>
            <MessageSquarePlus className="size-3.5" />
            Note
          </Button>
        ) : null}
      </CardHeader>

      <CardBody>
        {composing ? (
          <div className="mb-4 space-y-2">
            <Textarea
              autoFocus
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Recruiter said the loop is three rounds…"
              className="min-h-16 text-xs"
            />
            <div className="flex justify-end gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setComposing(false);
                  setNote("");
                }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                variant="primary"
                onClick={addNote}
                loading={saving}
                disabled={!note.trim()}
              >
                Add note
              </Button>
            </div>
          </div>
        ) : null}

        {events.length === 0 ? (
          <p className="text-ink-muted py-4 text-center text-xs">
            Nothing logged yet.
          </p>
        ) : (
          <ol className="relative space-y-4">
            {/* The spine sits behind the markers, stopping at the last one. */}
            <span
              aria-hidden
              className="absolute top-2 bottom-2 left-[0.6875rem] w-px bg-[var(--border)]"
            />
            {events.map((event) => {
              const style = EVENT_STYLE[event.type] ?? EVENT_STYLE.task;
              return (
                <li key={event.id} className="relative flex gap-3">
                  <span
                    className="border-line bg-surface z-10 grid size-6 shrink-0 place-items-center rounded-full border"
                    aria-hidden
                  >
                    <style.Icon className="size-3" style={{ color: style.tint }} />
                  </span>
                  <div className="min-w-0 flex-1 pt-0.5">
                    <p className="text-ink text-xs font-medium">{event.title}</p>
                    {event.body ? (
                      <p className="text-ink-2 mt-0.5 text-[11px] leading-relaxed whitespace-pre-wrap">
                        {event.body}
                      </p>
                    ) : null}
                    <p className="text-ink-muted mt-1 text-[10px]">
                      {formatDateTime(event.occurredAt)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </CardBody>
    </Card>
  );
}
