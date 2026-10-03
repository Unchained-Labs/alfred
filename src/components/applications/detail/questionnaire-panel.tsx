"use client";

import { Accordion as RAccordion } from "radix-ui";
import {
  ChevronDown,
  MessagesSquare,
  RefreshCw,
  Save,
  Sparkles,
} from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/field";
import { EmptyState, ThinkingRows } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import type { Question } from "@/db/schema";
import { cn } from "@/lib/utils";

const CATEGORY_TINT: Record<string, string> = {
  technical: "var(--series-1)",
  behavioral: "var(--series-2)",
  system_design: "var(--series-3)",
  culture: "var(--series-5)",
  compensation: "var(--series-7)",
};

const CATEGORY_LABEL: Record<string, string> = {
  technical: "Technical",
  behavioral: "Behavioral",
  system_design: "System design",
  culture: "Culture",
  compensation: "Compensation",
};

const CONFIDENCE_LABELS = ["Shaky", "Rough", "Okay", "Solid", "Nailed it"];

function ConfidencePicker({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (value: number) => void;
}) {
  return (
    <div
      className="flex items-center gap-1"
      role="radiogroup"
      aria-label="How ready do you feel on this question?"
    >
      {[1, 2, 3, 4, 5].map((level) => {
        const active = value != null && level <= value;
        return (
          <button
            key={level}
            type="button"
            role="radio"
            aria-checked={value === level}
            aria-label={CONFIDENCE_LABELS[level - 1]}
            onClick={() => onChange(level)}
            className="h-4 w-5 cursor-pointer rounded-sm transition-colors"
            style={{
              background: active ? "var(--good)" : "var(--surface-3)",
            }}
          />
        );
      })}
      <span className="text-ink-muted ml-1.5 text-[10px]">
        {value != null ? CONFIDENCE_LABELS[value - 1] : "Rate your readiness"}
      </span>
    </div>
  );
}

function QuestionItem({ question }: { question: Question }) {
  const router = useRouter();
  const toast = useToast();
  const [answer, setAnswer] = React.useState(question.userAnswer ?? "");
  const [saving, setSaving] = React.useState(false);
  const dirty = answer !== (question.userAnswer ?? "");

  async function persist(patch: { userAnswer?: string; confidence?: number }) {
    setSaving(true);
    try {
      const response = await fetch(`/api/questions/${question.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!response.ok) throw new Error("Could not save.");
      router.refresh();
    } catch (error) {
      toast.error("Save failed", error instanceof Error ? error.message : "");
    } finally {
      setSaving(false);
    }
  }

  const tint = CATEGORY_TINT[question.category] ?? "var(--series-1)";

  return (
    <RAccordion.Item
      value={question.id}
      className="border-line border-b last:border-0"
    >
      <RAccordion.Header>
        <RAccordion.Trigger className="group hover:bg-surface-2 flex w-full cursor-pointer items-start gap-3 px-5 py-3 text-left transition-colors">
          <ChevronDown className="text-ink-muted mt-0.5 size-3.5 shrink-0 transition-transform group-data-[state=open]:rotate-180" />
          <div className="min-w-0 flex-1">
            <p className="text-ink text-xs font-medium">{question.question}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Badge tint={tint}>
                {CATEGORY_LABEL[question.category] ?? question.category}
              </Badge>
              {question.userAnswer ? (
                <Badge tint="var(--good)">Answered</Badge>
              ) : null}
              {question.confidence ? (
                <span className="text-ink-muted text-[10px]">
                  {CONFIDENCE_LABELS[question.confidence - 1]}
                </span>
              ) : null}
            </div>
          </div>
        </RAccordion.Trigger>
      </RAccordion.Header>

      <RAccordion.Content className="overflow-hidden">
        <div className="space-y-3 px-5 pb-4 pl-11.5">
          {question.probing ? (
            <p className="text-ink-muted text-[11px] leading-relaxed">
              <span className="text-ink-2 font-medium">
                They&apos;re really asking:
              </span>{" "}
              {question.probing}
            </p>
          ) : null}

          {question.suggestedAnswer ? (
            <div className="border-line bg-surface-2 rounded-lg border p-3">
              <p className="label-eyebrow mb-1.5">Alfred&apos;s draft</p>
              <p className="text-ink-2 text-xs leading-relaxed whitespace-pre-wrap">
                {question.suggestedAnswer}
              </p>
            </div>
          ) : null}

          <div>
            <p className="label-eyebrow mb-1.5">Your version</p>
            <Textarea
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              placeholder="Rewrite it in your own words — that's what makes it stick."
              className="min-h-20 text-xs"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <ConfidencePicker
              value={question.confidence}
              onChange={(confidence) => persist({ confidence })}
            />
            <Button
              size="sm"
              variant={dirty ? "primary" : "ghost"}
              disabled={!dirty}
              loading={saving}
              onClick={() => persist({ userAnswer: answer })}
            >
              <Save className="size-3.5" />
              {dirty ? "Save answer" : "Saved"}
            </Button>
          </div>
        </div>
      </RAccordion.Content>
    </RAccordion.Item>
  );
}

export function QuestionnairePanel({
  applicationId,
  questions,
}: {
  applicationId: string;
  questions: Question[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [generating, setGenerating] = React.useState(false);

  const answered = questions.filter((question) => question.userAnswer).length;

  async function generate() {
    setGenerating(true);
    try {
      const response = await fetch(
        `/api/applications/${applicationId}/questionnaire`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ count: 12 }),
        },
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Could not draft the questionnaire.");
      }
      toast.success(`${data.questions.length} questions ready`);
      router.refresh();
    } catch (error) {
      toast.error(
        "Questionnaire failed",
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setGenerating(false);
    }
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2">
            <MessagesSquare className="size-4" style={{ color: "var(--brand)" }} />
            Interview questionnaire
          </CardTitle>
          <p className="text-ink-muted mt-0.5 text-xs">
            {questions.length
              ? `${answered} of ${questions.length} answered in your own words`
              : "The questions this loop will probably ask, with drafted answers"}
          </p>
        </div>
        {questions.length ? (
          <Button size="sm" variant="ghost" onClick={generate} loading={generating}>
            <RefreshCw className="size-3.5" />
            Regenerate
          </Button>
        ) : null}
      </CardHeader>

      {generating && !questions.length ? (
        <CardBody>
          <ThinkingRows rows={4} />
        </CardBody>
      ) : !questions.length ? (
        <EmptyState
          icon={MessagesSquare}
          title="No questionnaire yet"
          description="Alfred predicts the questions and drafts answers grounded in your real background."
          action={
            <Button variant="primary" onClick={generate} loading={generating}>
              <Sparkles className="size-3.5" />
              Draft the questions
            </Button>
          }
          compact
        />
      ) : (
        <RAccordion.Root type="multiple" className={cn("border-line border-t")}>
          {questions.map((question) => (
            <QuestionItem key={question.id} question={question} />
          ))}
        </RAccordion.Root>
      )}
    </Card>
  );
}
