"use client";

import {
  Bot,
  Check,
  CircleAlert,
  Cpu,
  Mail,
  Plug,
  Save,
  Server,
  Sparkles,
  User,
  Zap,
} from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Switch, Textarea } from "@/components/ui/field";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { ANTHROPIC_MODELS } from "@/lib/ai/providers/anthropic";
import type { ProviderKind } from "@/lib/ai/types";
import type { RedactedSettings } from "@/lib/settings";
import { cn, parseList } from "@/lib/utils";

const EFFORTS = [
  { value: "low", label: "Low", hint: "Fastest" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High", hint: "Default" },
  { value: "xhigh", label: "Extra high" },
  { value: "max", label: "Max", hint: "Most thorough" },
];

const PROVIDERS: {
  id: ProviderKind;
  label: string;
  blurb: string;
  Icon: typeof Sparkles;
}[] = [
  {
    id: "anthropic",
    label: "Claude",
    blurb: "Anthropic's API. Best results, structured output guaranteed.",
    Icon: Sparkles,
  },
  {
    id: "openai-compat",
    label: "LLM endpoint",
    blurb: "Any OpenAI-compatible server — Ollama, vLLM, LM Studio, OpenRouter.",
    Icon: Server,
  },
  {
    id: "agent",
    label: "Custom agent",
    blurb: "Your own agent over HTTP. Alfred POSTs a task envelope.",
    Icon: Bot,
  },
];

type TestResult = {
  ok: boolean;
  message: string;
  detail?: string;
};

function TestBadge({ result }: { result: TestResult | null }) {
  if (!result) return null;
  return (
    <div
      className="flex items-start gap-2 rounded-lg border p-2.5 text-xs"
      style={{
        borderColor: `color-mix(in oklab, ${result.ok ? "var(--good)" : "var(--critical)"} 30%, transparent)`,
        background: `color-mix(in oklab, ${result.ok ? "var(--good)" : "var(--critical)"} 10%, transparent)`,
      }}
    >
      {result.ok ? (
        <Check className="mt-px size-3.5 shrink-0" style={{ color: "var(--good)" }} />
      ) : (
        <CircleAlert
          className="mt-px size-3.5 shrink-0"
          style={{ color: "var(--critical)" }}
        />
      )}
      <div className="min-w-0">
        <p className="font-medium text-ink">{result.message}</p>
        {result.detail ? (
          <p className="mt-0.5 leading-relaxed break-words text-ink-2">
            {result.detail}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function SettingsView({ initial }: { initial: RedactedSettings }) {
  const router = useRouter();
  const toast = useToast();

  const [profile, setProfile] = React.useState({
    ...initial.profile,
    skillsText: initial.profile.skills.join(", "),
    rolesText: initial.profile.targetRoles.join(", "),
    locationsText: initial.profile.locations.join(", "),
  });
  const [ai, setAi] = React.useState(initial.ai);
  const [mail, setMail] = React.useState(initial.mail);

  const [saving, setSaving] = React.useState(false);
  const [testing, setTesting] = React.useState(false);
  const [aiResult, setAiResult] = React.useState<TestResult | null>(null);
  const [mailResult, setMailResult] = React.useState<TestResult | null>(null);

  async function save() {
    setSaving(true);
    try {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          profile: {
            name: profile.name,
            headline: profile.headline,
            yearsExperience:
              profile.yearsExperience === null || profile.yearsExperience === ("" as never)
                ? null
                : Number(profile.yearsExperience),
            resume: profile.resume,
            skills: parseList(profile.skillsText),
            targetRoles: parseList(profile.rolesText),
            locations: parseList(profile.locationsText),
            compensationTarget: profile.compensationTarget,
          },
          ai,
          mail,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not save settings.");
      toast.success("Settings saved");
      router.refresh();
    } catch (error) {
      toast.error("Save failed", error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }

  async function testAi() {
    setTesting(true);
    setAiResult(null);
    try {
      const config =
        ai.provider === "anthropic"
          ? ai.anthropic
          : ai.provider === "openai-compat"
            ? ai.openaiCompat
            : ai.agent;

      const response = await fetch("/api/ai/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: ai.provider, config }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "The provider did not respond.");

      setAiResult({
        ok: data.ok,
        message: data.ok
          ? `Connected in ${data.latencyMs}ms`
          : "Responded, but not as expected",
        detail: data.ok
          ? `Model: ${data.model}`
          : `Replied: "${data.reply}" — the connection works, but the model ignored a simple instruction.`,
      });
    } catch (error) {
      setAiResult({
        ok: false,
        message: "Connection failed",
        detail: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setTesting(false);
    }
  }

  async function testMail() {
    setTesting(true);
    setMailResult(null);
    try {
      const response = await fetch("/api/mail/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(mail),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not reach the mailbox.");
      setMailResult({
        ok: true,
        message: `Connected to ${data.folder}`,
        detail: `${data.messages} messages in the folder.`,
      });
    } catch (error) {
      setMailResult({
        ok: false,
        message: "Mailbox connection failed",
        detail: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setTesting(false);
    }
  }

  const activeProvider = PROVIDERS.find((item) => item.id === ai.provider)!;

  return (
    <div className="space-y-4">
      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">
            <User className="size-3.5" />
            You
          </TabsTrigger>
          <TabsTrigger value="ai">
            <Cpu className="size-3.5" />
            AI layer
          </TabsTrigger>
          <TabsTrigger value="mail">
            <Mail className="size-3.5" />
            Mailbox
          </TabsTrigger>
        </TabsList>

        {/* ---------------- Profile ---------------- */}
        <TabsContent value="profile" className="mt-4">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Your background</CardTitle>
                <p className="mt-0.5 text-xs text-ink-muted">
                  Everything Alfred says about a role is measured against this.
                  The résumé field matters most.
                </p>
              </div>
            </CardHeader>
            <CardBody className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Name">
                  <Input
                    value={profile.name}
                    onChange={(event) =>
                      setProfile({ ...profile, name: event.target.value })
                    }
                    placeholder="Your name"
                  />
                </Field>
                <Field label="Headline">
                  <Input
                    value={profile.headline}
                    onChange={(event) =>
                      setProfile({ ...profile, headline: event.target.value })
                    }
                    placeholder="Senior backend engineer, distributed systems"
                  />
                </Field>
                <Field label="Years of experience">
                  <Input
                    value={profile.yearsExperience ?? ""}
                    onChange={(event) =>
                      setProfile({
                        ...profile,
                        yearsExperience: event.target.value
                          ? Number(event.target.value)
                          : null,
                      })
                    }
                    placeholder="7"
                    inputMode="numeric"
                  />
                </Field>
                <Field label="Compensation target">
                  <Input
                    value={profile.compensationTarget}
                    onChange={(event) =>
                      setProfile({
                        ...profile,
                        compensationTarget: event.target.value,
                      })
                    }
                    placeholder="170–200k USD base"
                  />
                </Field>
              </div>

              <Field
                label="Résumé / background"
                hint="Paste it in full. Projects, metrics, and stack detail are what make the analysis specific instead of generic."
              >
                <Textarea
                  value={profile.resume}
                  onChange={(event) =>
                    setProfile({ ...profile, resume: event.target.value })
                  }
                  className="min-h-48 text-xs"
                  placeholder="Senior engineer with 7 years building…"
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Core skills" hint="Comma separated.">
                  <Input
                    value={profile.skillsText}
                    onChange={(event) =>
                      setProfile({ ...profile, skillsText: event.target.value })
                    }
                    placeholder="Go, Postgres, Kubernetes"
                  />
                </Field>
                <Field label="Target roles">
                  <Input
                    value={profile.rolesText}
                    onChange={(event) =>
                      setProfile({ ...profile, rolesText: event.target.value })
                    }
                    placeholder="Staff Engineer, Tech Lead"
                  />
                </Field>
                <Field label="Preferred locations">
                  <Input
                    value={profile.locationsText}
                    onChange={(event) =>
                      setProfile({ ...profile, locationsText: event.target.value })
                    }
                    placeholder="Remote EU, Berlin"
                  />
                </Field>
              </div>
            </CardBody>
          </Card>
        </TabsContent>

        {/* ---------------- AI ---------------- */}
        <TabsContent value="ai" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Provider</CardTitle>
                <p className="mt-0.5 text-xs text-ink-muted">
                  Alfred speaks to all three through the same interface — switch
                  freely, nothing else changes.
                </p>
              </div>
            </CardHeader>
            <CardBody>
              <div
                className="grid gap-2.5 sm:grid-cols-3"
                role="radiogroup"
                aria-label="AI provider"
              >
                {PROVIDERS.map(({ id, label, blurb, Icon }) => {
                  const active = ai.provider === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => {
                        setAi({ ...ai, provider: id });
                        setAiResult(null);
                      }}
                      className={cn(
                        "cursor-pointer rounded-xl border p-3 text-left transition-colors",
                        active
                          ? "border-[var(--brand)] bg-brand-wash"
                          : "border-line bg-surface-2 hover:border-line-strong",
                      )}
                    >
                      <span className="flex items-center gap-2">
                        <Icon
                          className="size-4 shrink-0"
                          style={{
                            color: active ? "var(--brand)" : "var(--ink-muted)",
                          }}
                        />
                        <span className="text-xs font-semibold text-ink">
                          {label}
                        </span>
                      </span>
                      <span className="mt-1.5 block text-[11px] leading-relaxed text-ink-muted">
                        {blurb}
                      </span>
                    </button>
                  );
                })}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle className="flex items-center gap-2">
                  <activeProvider.Icon
                    className="size-4"
                    style={{ color: "var(--brand)" }}
                  />
                  {activeProvider.label} configuration
                </CardTitle>
                <p className="mt-0.5 text-xs text-ink-muted">
                  Credentials are stored in your local SQLite database and never
                  leave this machine except to reach the provider.
                </p>
              </div>
            </CardHeader>
            <CardBody className="space-y-4">
              {ai.provider === "anthropic" ? (
                <>
                  <Field
                    label="API key"
                    hint={
                      initial.ai.anthropic.hasApiKey
                        ? "A key is already stored. Leave blank to keep it."
                        : "From console.anthropic.com. Or set ANTHROPIC_API_KEY in the environment."
                    }
                  >
                    <Input
                      type="password"
                      value={ai.anthropic.apiKey}
                      onChange={(event) =>
                        setAi({
                          ...ai,
                          anthropic: { ...ai.anthropic, apiKey: event.target.value },
                        })
                      }
                      placeholder={
                        initial.ai.anthropic.hasApiKey ? "••••••••" : "sk-ant-…"
                      }
                      autoComplete="off"
                    />
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Model">
                      <Select
                        value={ai.anthropic.model}
                        onValueChange={(model) =>
                          setAi({ ...ai, anthropic: { ...ai.anthropic, model } })
                        }
                        options={ANTHROPIC_MODELS.map((model) => ({
                          value: model.id,
                          label: model.label,
                          hint: model.hint,
                        }))}
                        ariaLabel="Claude model"
                      />
                    </Field>
                    <Field
                      label="Reasoning effort"
                      hint="Higher effort means more thinking and better analysis, at more cost."
                    >
                      <Select
                        value={ai.anthropic.effort}
                        onValueChange={(effort) =>
                          setAi({
                            ...ai,
                            anthropic: { ...ai.anthropic, effort: effort as never },
                          })
                        }
                        options={EFFORTS}
                        ariaLabel="Reasoning effort"
                      />
                    </Field>
                  </div>
                </>
              ) : ai.provider === "openai-compat" ? (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field
                      label="Base URL"
                      hint="e.g. http://localhost:11434 for Ollama. /v1 is added if missing."
                    >
                      <Input
                        value={ai.openaiCompat.baseUrl}
                        onChange={(event) =>
                          setAi({
                            ...ai,
                            openaiCompat: {
                              ...ai.openaiCompat,
                              baseUrl: event.target.value,
                            },
                          })
                        }
                        placeholder="http://localhost:11434"
                      />
                    </Field>
                    <Field label="Model">
                      <Input
                        value={ai.openaiCompat.model}
                        onChange={(event) =>
                          setAi({
                            ...ai,
                            openaiCompat: {
                              ...ai.openaiCompat,
                              model: event.target.value,
                            },
                          })
                        }
                        placeholder="qwen2.5:14b"
                      />
                    </Field>
                  </div>
                  <Field
                    label="API key"
                    hint={
                      initial.ai.openaiCompat.hasApiKey
                        ? "A key is already stored. Leave blank to keep it."
                        : "Optional — local servers usually don't need one."
                    }
                  >
                    <Input
                      type="password"
                      value={ai.openaiCompat.apiKey}
                      onChange={(event) =>
                        setAi({
                          ...ai,
                          openaiCompat: {
                            ...ai.openaiCompat,
                            apiKey: event.target.value,
                          },
                        })
                      }
                      placeholder={
                        initial.ai.openaiCompat.hasApiKey ? "••••••••" : "Optional"
                      }
                      autoComplete="off"
                    />
                  </Field>
                  <Switch
                    checked={ai.openaiCompat.supportsJsonSchema}
                    onCheckedChange={(supportsJsonSchema) =>
                      setAi({
                        ...ai,
                        openaiCompat: { ...ai.openaiCompat, supportsJsonSchema },
                      })
                    }
                    label="Server supports JSON schema"
                    hint="Leave on unless structured calls fail. Alfred falls back to prompt-coerced JSON automatically."
                  />
                </>
              ) : (
                <>
                  <Field
                    label="Agent endpoint"
                    hint="Alfred POSTs { task, system, prompt, responseType, schema } and expects { text } or { object }."
                  >
                    <Input
                      value={ai.agent.endpoint}
                      onChange={(event) =>
                        setAi({
                          ...ai,
                          agent: { ...ai.agent, endpoint: event.target.value },
                        })
                      }
                      placeholder="https://my-agent.example.com/alfred"
                    />
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field
                      label="Agent name"
                      hint="Optional. Passed through as `agent`."
                    >
                      <Input
                        value={ai.agent.agentName}
                        onChange={(event) =>
                          setAi({
                            ...ai,
                            agent: { ...ai.agent, agentName: event.target.value },
                          })
                        }
                        placeholder="job-coach"
                      />
                    </Field>
                    <Field
                      label="Bearer token"
                      hint={
                        initial.ai.agent.hasApiKey
                          ? "A token is already stored. Leave blank to keep it."
                          : "Sent as Authorization: Bearer."
                      }
                    >
                      <Input
                        type="password"
                        value={ai.agent.apiKey}
                        onChange={(event) =>
                          setAi({
                            ...ai,
                            agent: { ...ai.agent, apiKey: event.target.value },
                          })
                        }
                        placeholder={
                          initial.ai.agent.hasApiKey ? "••••••••" : "Optional"
                        }
                        autoComplete="off"
                      />
                    </Field>
                  </div>
                </>
              )}

              <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
                <Button variant="outline" onClick={testAi} loading={testing}>
                  <Plug className="size-3.5" />
                  Test connection
                </Button>
                <span className="text-[11px] text-ink-muted">
                  Save first if you just changed a credential.
                </span>
              </div>

              <TestBadge result={aiResult} />
            </CardBody>
          </Card>
        </TabsContent>

        {/* ---------------- Mail ---------------- */}
        <TabsContent value="mail" className="mt-4">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>IMAP mailbox</CardTitle>
                <p className="mt-0.5 text-xs text-ink-muted">
                  Read-only. Alfred never marks, moves, or deletes anything in
                  your mailbox.
                </p>
              </div>
              <Badge tint={mail.enabled ? "var(--good)" : undefined}>
                {mail.enabled ? "Enabled" : "Off"}
              </Badge>
            </CardHeader>
            <CardBody className="space-y-4">
              <Switch
                checked={mail.enabled}
                onCheckedChange={(enabled) => setMail({ ...mail, enabled })}
                label="Sync my mailbox"
                hint="When off, the Inbox page stays empty and no connection is made."
              />

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="IMAP host">
                  <Input
                    value={mail.host}
                    onChange={(event) => setMail({ ...mail, host: event.target.value })}
                    placeholder="imap.gmail.com"
                  />
                </Field>
                <Field label="Port">
                  <Input
                    value={mail.port}
                    onChange={(event) =>
                      setMail({ ...mail, port: Number(event.target.value) || 993 })
                    }
                    placeholder="993"
                    inputMode="numeric"
                  />
                </Field>
                <Field label="Username">
                  <Input
                    value={mail.user}
                    onChange={(event) => setMail({ ...mail, user: event.target.value })}
                    placeholder="you@gmail.com"
                    autoComplete="off"
                  />
                </Field>
                <Field
                  label="Password"
                  hint={
                    initial.mail.hasPassword
                      ? "A password is already stored. Leave blank to keep it."
                      : "For Gmail and Outlook, use an app password — not your account password."
                  }
                >
                  <Input
                    type="password"
                    value={mail.password}
                    onChange={(event) =>
                      setMail({ ...mail, password: event.target.value })
                    }
                    placeholder={initial.mail.hasPassword ? "••••••••" : "App password"}
                    autoComplete="off"
                  />
                </Field>
                <Field label="Folder">
                  <Input
                    value={mail.folder}
                    onChange={(event) =>
                      setMail({ ...mail, folder: event.target.value })
                    }
                    placeholder="INBOX"
                  />
                </Field>
                <Field
                  label="Look back (days)"
                  hint="How far back each sync reaches."
                >
                  <Input
                    value={mail.lookbackDays}
                    onChange={(event) =>
                      setMail({
                        ...mail,
                        lookbackDays: Number(event.target.value) || 30,
                      })
                    }
                    placeholder="30"
                    inputMode="numeric"
                  />
                </Field>
              </div>

              <Switch
                checked={mail.autoTriage}
                onCheckedChange={(autoTriage) => setMail({ ...mail, autoTriage })}
                label="Classify new mail with AI"
                hint="Each new email costs one small AI call. High-confidence matches to a tracked company get linked automatically; stage changes always stay manual."
              />

              <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
                <Button variant="outline" onClick={testMail} loading={testing}>
                  <Zap className="size-3.5" />
                  Test mailbox
                </Button>
              </div>

              <TestBadge result={mailResult} />
            </CardBody>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Sticky save bar — the form is long enough that a footer button would hide. */}
      <div className="sticky bottom-20 z-20 flex justify-end lg:bottom-4">
        <Button
          variant="primary"
          size="lg"
          onClick={save}
          loading={saving}
          className="shadow-[var(--shadow-pop)]"
        >
          <Save className="size-4" />
          Save settings
        </Button>
      </div>
    </div>
  );
}
