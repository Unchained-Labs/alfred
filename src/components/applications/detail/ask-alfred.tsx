"use client";

import { ArrowUp, Bot, Eraser } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Turn = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "What should I ask them at the end?",
  "How do I explain my biggest gap here?",
  "Draft a follow-up email.",
  "What salary should I anchor on?",
];

export function AskAlfred({ applicationId }: { applicationId: string }) {
  const [turns, setTurns] = React.useState<Turn[]>([]);
  const [draft, setDraft] = React.useState("");
  const [streaming, setStreaming] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  // Pin to the bottom as tokens arrive.
  React.useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [turns]);

  async function send(question: string) {
    const trimmed = question.trim();
    if (!trimmed || streaming) return;

    const history = turns;
    setDraft("");
    setTurns([...history, { role: "user", content: trimmed }, { role: "assistant", content: "" }]);
    setStreaming(true);

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ applicationId, question: trimmed, history }),
      });

      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? "Alfred could not answer.");
      }

      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let answer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        answer += value;
        // Replace only the trailing assistant turn as it fills in.
        setTurns((current) => [
          ...current.slice(0, -1),
          { role: "assistant", content: answer },
        ]);
      }
    } catch (error) {
      setTurns((current) => [
        ...current.slice(0, -1),
        {
          role: "assistant",
          content: `_${error instanceof Error ? error.message : "Something went wrong."}_`,
        },
      ]);
    } finally {
      setStreaming(false);
    }
  }

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2">
            <Bot className="size-4" style={{ color: "var(--brand)" }} />
            Ask Alfred
          </CardTitle>
          <p className="mt-0.5 text-xs text-ink-muted">
            He has the posting and your analysis in context.
          </p>
        </div>
        {turns.length ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setTurns([])}
            disabled={streaming}
          >
            <Eraser className="size-3.5" />
            Clear
          </Button>
        ) : null}
      </CardHeader>

      <CardBody className="flex flex-1 flex-col gap-3">
        {turns.length ? (
          <div
            ref={scrollRef}
            className="max-h-80 space-y-3 overflow-y-auto"
            aria-live="polite"
          >
            {turns.map((turn, index) => (
              <div
                key={index}
                className={cn(
                  "text-xs leading-relaxed",
                  turn.role === "user" ? "flex justify-end" : "",
                )}
              >
                <div
                  className={cn(
                    "max-w-[85%] rounded-xl px-3 py-2",
                    turn.role === "user"
                      ? "bg-brand-wash text-ink"
                      : "border border-line bg-surface-2 text-ink-2",
                  )}
                >
                  {turn.content ? (
                    <span className="whitespace-pre-wrap">{turn.content}</span>
                  ) : (
                    <span className="inline-flex gap-1" aria-label="Alfred is thinking">
                      {[0, 1, 2].map((dot) => (
                        <span
                          key={dot}
                          className="size-1.5 animate-bounce rounded-full bg-ink-muted"
                          style={{ animationDelay: `${dot * 120}ms` }}
                        />
                      ))}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => send(suggestion)}
                className="cursor-pointer rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-[11px] text-ink-2 transition-colors hover:border-line-strong hover:text-ink"
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}

        <form
          onSubmit={(event) => {
            event.preventDefault();
            send(draft);
          }}
          className="relative mt-auto"
        >
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Ask about this role…"
            aria-label="Ask Alfred about this role"
            disabled={streaming}
            className="h-9.5 w-full rounded-lg border border-line bg-surface-2 pr-10 pl-3 text-xs text-ink transition-colors placeholder:text-ink-muted hover:border-line-strong focus:border-brand focus:outline-none disabled:opacity-60"
          />
          <Button
            type="submit"
            size="icon"
            variant="primary"
            disabled={!draft.trim() || streaming}
            className="absolute top-1 right-1 size-7.5"
            aria-label="Send"
          >
            <ArrowUp className="size-3.5" />
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}
