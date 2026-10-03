"use client";

import { Sparkles, Wand2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
} from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import type { Application } from "@/db/schema";
import { ALL_STAGES, STAGE_META } from "@/lib/stages";
import { parseList } from "@/lib/utils";

const STAGE_OPTIONS = ALL_STAGES.map((stage) => ({
  value: stage,
  label: STAGE_META[stage].label,
}));

const WORK_MODES = [
  { value: "onsite", label: "Onsite" },
  { value: "hybrid", label: "Hybrid" },
  { value: "remote", label: "Remote" },
];

const SENIORITIES = [
  { value: "intern", label: "Intern" },
  { value: "junior", label: "Junior" },
  { value: "mid", label: "Mid" },
  { value: "senior", label: "Senior" },
  { value: "staff", label: "Staff" },
  { value: "principal", label: "Principal" },
  { value: "lead", label: "Lead" },
];

const PRIORITIES = [
  { value: "3", label: "High" },
  { value: "2", label: "Normal" },
  { value: "1", label: "Low" },
];

type FormState = {
  company: string;
  title: string;
  description: string;
  location: string;
  workMode: string;
  seniority: string;
  salaryMin: string;
  salaryMax: string;
  currency: string;
  jobUrl: string;
  stage: string;
  priority: string;
  tags: string;
  notes: string;
};

const EMPTY: FormState = {
  company: "",
  title: "",
  description: "",
  location: "",
  workMode: "",
  seniority: "",
  salaryMin: "",
  salaryMax: "",
  currency: "USD",
  jobUrl: "",
  stage: "wishlist",
  priority: "2",
  tags: "",
  notes: "",
};

function fromApplication(app: Application): FormState {
  return {
    company: app.company,
    title: app.title,
    description: app.description ?? "",
    location: app.location ?? "",
    workMode: app.workMode ?? "",
    seniority: app.seniority ?? "",
    salaryMin: app.salaryMin?.toString() ?? "",
    salaryMax: app.salaryMax?.toString() ?? "",
    currency: app.currency ?? "USD",
    jobUrl: app.jobUrl ?? "",
    stage: app.stage,
    priority: String(app.priority),
    tags: (app.tags ?? []).join(", "),
    notes: app.notes ?? "",
  };
}

function toNumber(value: string): number | null {
  const parsed = Number(value.replace(/[^\d.]/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
}

export function ApplicationForm({
  open,
  onOpenChange,
  application,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present when editing; absent when creating. */
  application?: Application;
}) {
  const router = useRouter();
  const toast = useToast();
  const editing = Boolean(application);

  const [form, setForm] = React.useState<FormState>(EMPTY);
  const [paste, setPaste] = React.useState("");
  const [parsing, setParsing] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [tab, setTab] = React.useState("manual");

  // Reset whenever the dialog opens so a stale draft never leaks between uses.
  React.useEffect(() => {
    if (!open) return;
    setForm(application ? fromApplication(application) : EMPTY);
    setPaste("");
    setTab(application ? "manual" : "paste");
  }, [open, application]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  async function runParse() {
    if (paste.trim().length < 40) {
      toast.error("Paste a bit more", "Alfred needs the posting body to work with.");
      return;
    }
    setParsing(true);
    try {
      const response = await fetch("/api/ai/parse-job", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ raw: paste }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not parse the posting.");

      const parsed = data.job;
      setForm((current) => ({
        ...current,
        company: parsed.company ?? current.company,
        title: parsed.title ?? current.title,
        description: parsed.description ?? current.description,
        location: parsed.location ?? "",
        workMode: parsed.workMode ?? "",
        seniority: parsed.seniority ?? "",
        salaryMin: parsed.salaryMin?.toString() ?? "",
        salaryMax: parsed.salaryMax?.toString() ?? "",
        currency: parsed.currency ?? "USD",
        tags: (parsed.tags ?? []).join(", "),
      }));
      setTab("manual");
      toast.success("Posting parsed", "Check the fields, then save.");
    } catch (error) {
      toast.error(
        "Parsing failed",
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setParsing(false);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!form.company.trim() || !form.title.trim()) {
      toast.error("Company and title are required");
      return;
    }

    setSaving(true);
    const payload = {
      company: form.company.trim(),
      title: form.title.trim(),
      description: form.description.trim() || null,
      location: form.location.trim() || null,
      workMode: form.workMode || null,
      seniority: form.seniority || null,
      salaryMin: toNumber(form.salaryMin),
      salaryMax: toNumber(form.salaryMax),
      currency: form.currency.trim() || "USD",
      jobUrl: form.jobUrl.trim() || null,
      stage: form.stage,
      priority: Number(form.priority),
      tags: parseList(form.tags),
      notes: form.notes.trim() || null,
    };

    try {
      const response = await fetch(
        editing ? `/api/applications/${application!.id}` : "/api/applications",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not save.");

      toast.success(editing ? "Application updated" : `Now tracking ${payload.company}`);
      onOpenChange(false);
      router.refresh();
      if (!editing && data.application?.id) {
        router.push(`/pipeline/${data.application.id}`);
      }
    } catch (error) {
      toast.error("Save failed", error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        width="xl"
        title={editing ? "Edit application" : "Track a new application"}
        description={
          editing
            ? `${application!.company} · ${application!.title}`
            : "Paste a posting and let Alfred fill the form, or enter it by hand."
        }
      >
        <form onSubmit={submit} id="application-form">
          <Tabs value={tab} onValueChange={setTab}>
            <div className="px-6 pt-4">
              <TabsList>
                {!editing ? (
                  <TabsTrigger value="paste">
                    <Sparkles className="size-3.5" />
                    Paste a posting
                  </TabsTrigger>
                ) : null}
                <TabsTrigger value="manual">Details</TabsTrigger>
                <TabsTrigger value="more">Compensation &amp; notes</TabsTrigger>
              </TabsList>
            </div>

            {!editing ? (
              <TabsContent value="paste" className="space-y-3 px-6 py-4">
                <Field
                  label="Job posting"
                  hint="Paste the whole thing — title, company, requirements. Alfred extracts the fields."
                >
                  <Textarea
                    value={paste}
                    onChange={(event) => setPaste(event.target.value)}
                    placeholder="Senior Backend Engineer at Acme…"
                    className="min-h-56 font-mono text-xs"
                  />
                </Field>
                <Button
                  type="button"
                  variant="primary"
                  onClick={runParse}
                  loading={parsing}
                  className="w-full"
                >
                  <Wand2 className="size-3.5" />
                  {parsing ? "Reading the posting…" : "Extract fields"}
                </Button>
              </TabsContent>
            ) : null}

            <TabsContent value="manual" className="space-y-4 px-6 py-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Company *">
                  <Input
                    value={form.company}
                    onChange={(event) => set("company", event.target.value)}
                    placeholder="Acme"
                    required
                  />
                </Field>
                <Field label="Title *">
                  <Input
                    value={form.title}
                    onChange={(event) => set("title", event.target.value)}
                    placeholder="Senior Backend Engineer"
                    required
                  />
                </Field>
                <Field label="Location">
                  <Input
                    value={form.location}
                    onChange={(event) => set("location", event.target.value)}
                    placeholder="Berlin, DE"
                  />
                </Field>
                <Field label="Work mode">
                  <Select
                    value={form.workMode}
                    onValueChange={(value) => set("workMode", value)}
                    options={WORK_MODES}
                    placeholder="Not specified"
                    ariaLabel="Work mode"
                  />
                </Field>
                <Field label="Seniority">
                  <Select
                    value={form.seniority}
                    onValueChange={(value) => set("seniority", value)}
                    options={SENIORITIES}
                    placeholder="Not specified"
                    ariaLabel="Seniority"
                  />
                </Field>
                <Field label="Stage">
                  <Select
                    value={form.stage}
                    onValueChange={(value) => set("stage", value)}
                    options={STAGE_OPTIONS}
                    ariaLabel="Stage"
                  />
                </Field>
              </div>

              <Field
                label="Job description"
                hint="The single biggest driver of analysis quality. Keep the requirements."
              >
                <Textarea
                  value={form.description}
                  onChange={(event) => set("description", event.target.value)}
                  className="min-h-40"
                  placeholder="Responsibilities, requirements, stack…"
                />
              </Field>
            </TabsContent>

            <TabsContent value="more" className="space-y-4 px-6 py-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Salary min">
                  <Input
                    value={form.salaryMin}
                    onChange={(event) => set("salaryMin", event.target.value)}
                    placeholder="150000"
                    inputMode="numeric"
                  />
                </Field>
                <Field label="Salary max">
                  <Input
                    value={form.salaryMax}
                    onChange={(event) => set("salaryMax", event.target.value)}
                    placeholder="190000"
                    inputMode="numeric"
                  />
                </Field>
                <Field label="Currency">
                  <Input
                    value={form.currency}
                    onChange={(event) => set("currency", event.target.value)}
                    placeholder="USD"
                    maxLength={3}
                  />
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Posting URL">
                  <Input
                    value={form.jobUrl}
                    onChange={(event) => set("jobUrl", event.target.value)}
                    placeholder="https://…"
                    type="url"
                  />
                </Field>
                <Field label="Priority">
                  <Select
                    value={form.priority}
                    onValueChange={(value) => set("priority", value)}
                    options={PRIORITIES}
                    ariaLabel="Priority"
                  />
                </Field>
              </div>

              <Field label="Tags" hint="Comma separated.">
                <Input
                  value={form.tags}
                  onChange={(event) => set("tags", event.target.value)}
                  placeholder="go, kubernetes, fintech"
                />
              </Field>

              <Field label="Your notes" hint="Referrals, context, why you want it.">
                <Textarea
                  value={form.notes}
                  onChange={(event) => set("notes", event.target.value)}
                  placeholder="Referred by…"
                />
              </Field>
            </TabsContent>
          </Tabs>
        </form>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="application-form" variant="primary" loading={saving}>
            {editing ? "Save changes" : "Start tracking"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
