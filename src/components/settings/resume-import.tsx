"use client";

import {
  AlertTriangle,
  Check,
  FileText,
  Loader2,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import type { ParsedResume } from "@/lib/ai/schemas";
import { cn } from "@/lib/utils";

type Source = {
  filename: string;
  kind: "pdf" | "text";
  pages: number;
  characters: number;
};

type Stage = "idle" | "reading" | "ready" | "error";

export function ResumeImport({
  onApply,
}: {
  /** Called when the user accepts the parsed profile. */
  onApply: (profile: ParsedResume) => void;
}) {
  const toast = useToast();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [stage, setStage] = React.useState<Stage>("idle");
  const [dragging, setDragging] = React.useState(false);
  const [parsed, setParsed] = React.useState<ParsedResume | null>(null);
  const [source, setSource] = React.useState<Source | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function upload(file: File) {
    setStage("reading");
    setError(null);
    setParsed(null);

    const body = new FormData();
    body.append("file", file);

    try {
      const response = await fetch("/api/profile/import", { method: "POST", body });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not read that CV.");
      setParsed(data.profile);
      setSource(data.source);
      setStage("ready");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setError(message);
      setStage("error");
      toast.error("Import failed", message);
    }
  }

  function pick(files: FileList | null) {
    const file = files?.[0];
    if (file) void upload(file);
  }

  /* ---------------- ready: show what was found ---------------- */
  if (stage === "ready" && parsed) {
    const counts: [string, number][] = [
      ["skills", parsed.skills.length],
      ["target roles", parsed.targetRoles.length],
      ["locations", parsed.locations.length],
    ];

    return (
      <div className="border-line bg-surface-2 rounded-xl border p-4">
        <div className="flex items-start gap-3">
          <span
            className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg"
            style={{
              background: "color-mix(in oklab, var(--good) 16%, transparent)",
            }}
          >
            <Check className="size-4" style={{ color: "var(--good)" }} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-ink text-sm font-medium">Read {source?.filename}</p>
            <p className="text-ink-muted mt-0.5 text-xs">
              {source?.kind === "pdf"
                ? `${source.pages} ${source.pages === 1 ? "page" : "pages"} · `
                : ""}
              {source?.characters.toLocaleString()} characters of text
            </p>
          </div>
        </div>

        <dl className="border-line mt-4 grid gap-x-4 gap-y-2.5 border-t pt-3.5 sm:grid-cols-2">
          {parsed.name ? <Row label="Name" value={parsed.name} /> : null}
          {parsed.headline ? (
            <Row label="Headline" value={parsed.headline} />
          ) : null}
          {parsed.yearsExperience != null ? (
            <Row label="Experience" value={`${parsed.yearsExperience} years`} />
          ) : null}
          {parsed.compensationTarget ? (
            <Row label="Compensation" value={parsed.compensationTarget} />
          ) : null}
        </dl>

        {parsed.skills.length ? (
          <div className="border-line mt-3 border-t pt-3.5">
            <p className="label-eyebrow mb-2">Skills found</p>
            <div className="flex flex-wrap gap-1.5">
              {parsed.skills.slice(0, 14).map((skill) => (
                <Badge key={skill} tint="var(--series-1)">
                  {skill}
                </Badge>
              ))}
              {parsed.skills.length > 14 ? (
                <Badge>+{parsed.skills.length - 14} more</Badge>
              ) : null}
            </div>
          </div>
        ) : null}

        <p className="text-ink-muted mt-3 text-[11px]">
          {counts
            .filter(([, n]) => n > 0)
            .map(([label, n]) => `${n} ${label}`)
            .join(" · ")}
          {parsed.summary
            ? ` · ${parsed.summary.length.toLocaleString()}-character résumé`
            : ""}
        </p>

        <div className="border-line mt-4 flex flex-wrap items-center gap-2 border-t pt-3.5">
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              onApply(parsed);
              setStage("idle");
              setParsed(null);
              toast.success("Profile filled in", "Review it, then save.");
            }}
          >
            <Check className="size-3.5" />
            Fill in my profile
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setStage("idle")}>
            <X className="size-3.5" />
            Discard
          </Button>
          <span className="text-ink-muted text-[11px]">
            This replaces the fields below — nothing is saved until you press Save.
          </span>
        </div>
      </div>
    );
  }

  /* ---------------- idle / reading / error ---------------- */
  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload your CV"
        onClick={() => stage !== "reading" && inputRef.current?.click()}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (stage !== "reading") pick(event.dataTransfer.files);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-7 text-center transition-colors",
          dragging
            ? "bg-brand-wash border-[var(--brand)]"
            : "border-line-strong bg-surface-2 hover:border-brand/50",
          stage === "reading" && "pointer-events-none opacity-70",
        )}
      >
        <span className="border-line bg-surface grid size-9 place-items-center rounded-xl border">
          {stage === "reading" ? (
            <Loader2
              className="size-4 animate-spin"
              style={{ color: "var(--brand)" }}
            />
          ) : (
            <Upload className="text-ink-muted size-4" />
          )}
        </span>

        {stage === "reading" ? (
          <>
            <p className="text-ink text-sm font-medium">Reading your CV…</p>
            <p className="text-ink-muted text-xs">
              Extracting the text, then asking Alfred to structure it. This takes a
              few seconds.
            </p>
          </>
        ) : (
          <>
            <p className="text-ink text-sm font-medium">
              Import your CV to fill this in
            </p>
            <p className="text-ink-muted max-w-sm text-xs leading-relaxed">
              Drop a PDF here, or click to choose one. Alfred reads it and fills in
              your name, headline, skills and résumé — you review before anything is
              saved.
            </p>
            <span className="text-ink-muted mt-1 inline-flex items-center gap-1.5 text-[11px]">
              <FileText className="size-3" />
              PDF, or .txt / .md
            </span>
          </>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf,.txt,.md,.markdown"
        className="sr-only"
        onChange={(event) => {
          pick(event.target.files);
          // Allow re-picking the same file after a failure.
          event.target.value = "";
        }}
      />

      {stage === "error" && error ? (
        <div
          className="mt-2.5 flex items-start gap-2 rounded-lg border p-2.5 text-xs"
          style={{
            borderColor: "color-mix(in oklab, var(--critical) 30%, transparent)",
            background: "color-mix(in oklab, var(--critical) 10%, transparent)",
          }}
        >
          <AlertTriangle
            className="mt-px size-3.5 shrink-0"
            style={{ color: "var(--critical)" }}
          />
          <p className="text-ink-2 leading-relaxed">{error}</p>
        </div>
      ) : null}

      <p className="text-ink-muted mt-2.5 flex items-start gap-1.5 text-[11px] leading-relaxed">
        <Sparkles className="mt-px size-3 shrink-0" />
        The text of your CV is sent to whichever AI provider you have configured. A
        local endpoint or the local Claude Code CLI keeps it on this machine.
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="label-eyebrow">{label}</dt>
      <dd className="text-ink-2 mt-0.5 truncate text-xs" title={value}>
        {value}
      </dd>
    </div>
  );
}
