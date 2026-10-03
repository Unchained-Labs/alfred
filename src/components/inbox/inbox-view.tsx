"use client";

import {
  Check,
  Inbox as InboxIcon,
  Link2,
  Mail,
  MailX,
  Plus,
  RefreshCw,
  Settings,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/states";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import type { Application, MailMessage } from "@/db/schema";
import { MAIL_CLASS_LABELS, STAGE_META } from "@/lib/stages";
import { formatDateTime } from "@/lib/utils";

const CLASS_TINT: Record<string, string> = {
  application_confirmation: "var(--series-1)",
  interview_invite: "var(--good)",
  rejection: "var(--critical)",
  offer: "var(--series-6)",
  recruiter_outreach: "var(--series-2)",
  assessment: "var(--series-4)",
  other: "var(--ink-muted)",
};

function MailRow({
  mail,
  applications,
  busy,
  onLink,
  onCreate,
  onIgnore,
}: {
  mail: MailMessage;
  applications: Application[];
  busy: boolean;
  onLink: (mailId: string, applicationId: string) => void;
  onCreate: (mailId: string) => void;
  onIgnore: (mailId: string) => void;
}) {
  const [target, setTarget] = React.useState("");
  const linked = applications.find((app) => app.id === mail.applicationId);

  const options = applications.map((app) => ({
    value: app.id,
    label: `${app.company} — ${app.title}`,
  }));

  // Below this, the model said it was guessing, so Alfred asks rather than acts.
  const lowConfidence = mail.confidence != null && mail.confidence < 0.5;

  return (
    <li className="hover:bg-surface-2 px-4 py-3.5 transition-colors">
      <div className="flex items-start gap-3">
        <span className="bg-surface-3 mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg">
          <Mail className="text-ink-muted size-3.5" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="text-ink truncate text-xs font-medium">
              {mail.subject ?? "(no subject)"}
            </p>
            {mail.classification ? (
              <Badge tint={CLASS_TINT[mail.classification]}>
                {MAIL_CLASS_LABELS[mail.classification]}
              </Badge>
            ) : (
              <Badge>Not triaged</Badge>
            )}
            {lowConfidence ? (
              <Badge tint="var(--warning)">Low confidence</Badge>
            ) : null}
          </div>

          <p className="text-ink-muted mt-0.5 truncate text-[11px]">
            {mail.fromName ?? mail.fromAddress ?? "unknown sender"} ·{" "}
            {formatDateTime(mail.receivedAt)}
          </p>

          {mail.snippet ? (
            <p className="text-ink-2 mt-1.5 line-clamp-2 text-[11px] leading-relaxed">
              {mail.snippet}
            </p>
          ) : null}

          {mail.detectedCompany || mail.suggestedStage ? (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {mail.detectedCompany ? (
                <Badge tint="var(--series-1)">{mail.detectedCompany}</Badge>
              ) : null}
              {mail.detectedTitle ? <Badge>{mail.detectedTitle}</Badge> : null}
              {mail.suggestedStage ? (
                <Badge tint={`var(${STAGE_META[mail.suggestedStage].token})`}>
                  suggests {STAGE_META[mail.suggestedStage].label}
                </Badge>
              ) : null}
            </div>
          ) : null}

          {mail.status === "pending" ? (
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <Select
                value={target}
                onValueChange={(value) => {
                  setTarget(value);
                  onLink(mail.id, value);
                }}
                options={options}
                placeholder="Link to an application…"
                className="h-8 w-56 text-xs"
                disabled={busy || !options.length}
                ariaLabel="Link to an application"
              />
              {mail.detectedCompany ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onCreate(mail.id)}
                  disabled={busy}
                >
                  <Plus className="size-3" />
                  New application
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onIgnore(mail.id)}
                disabled={busy}
              >
                <MailX className="size-3" />
                Ignore
              </Button>
            </div>
          ) : linked ? (
            <Link
              href={`/pipeline/${linked.id}`}
              className="text-ink-muted hover:text-ink mt-2 inline-flex items-center gap-1.5 text-[11px] underline-offset-2 hover:underline"
            >
              <Link2 className="size-3" />
              {linked.company} — {linked.title}
            </Link>
          ) : (
            <p className="text-ink-muted mt-2 inline-flex items-center gap-1.5 text-[11px]">
              <Check className="size-3" />
              Ignored
            </p>
          )}
        </div>
      </div>
    </li>
  );
}

export function InboxView({
  mail,
  applications,
  mailEnabled,
}: {
  mail: MailMessage[];
  applications: Application[];
  mailEnabled: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [filter, setFilter] = React.useState<"pending" | "linked" | "ignored">(
    "pending",
  );
  const [syncing, setSyncing] = React.useState(false);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const counts = {
    pending: mail.filter((item) => item.status === "pending").length,
    linked: mail.filter((item) => item.status === "linked").length,
    ignored: mail.filter((item) => item.status === "ignored").length,
  };

  const visible = mail.filter((item) => item.status === filter);

  async function sync() {
    setSyncing(true);
    try {
      const response = await fetch("/api/mail/sync", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Sync failed.");

      const report = data.report;
      toast.success(
        report.inserted
          ? `${report.inserted} new ${report.inserted === 1 ? "email" : "emails"}`
          : "Mailbox is up to date",
        [
          report.triaged ? `${report.triaged} triaged` : null,
          report.autoLinked ? `${report.autoLinked} auto-linked` : null,
        ]
          .filter(Boolean)
          .join(" · ") || undefined,
      );
      for (const warning of report.warnings ?? []) {
        toast.info("Triage skipped an email", warning);
      }
      router.refresh();
    } catch (error) {
      toast.error(
        "Sync failed",
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setSyncing(false);
    }
  }

  async function act(
    mailId: string,
    body: Record<string, unknown>,
    path: "link" | "ignore",
  ) {
    setBusyId(mailId);
    try {
      const response = await fetch(`/api/mail/${mailId}/${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error ?? "Could not update the email.");
      router.refresh();
    } catch (error) {
      toast.error("Failed", error instanceof Error ? error.message : String(error));
    } finally {
      setBusyId(null);
    }
  }

  if (!mailEnabled && !mail.length) {
    return (
      <Card>
        <EmptyState
          icon={InboxIcon}
          title="Mailbox not connected"
          description="Connect an IMAP mailbox in Settings and Alfred will pull in recruiter mail, classify it, and match it to your applications."
          action={
            <Button asChild variant="primary">
              <Link href="/settings">
                <Settings className="size-3.5" />
                Connect a mailbox
              </Link>
            </Button>
          }
        />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={filter} onValueChange={(value) => setFilter(value as never)}>
          <TabsList>
            <TabsTrigger value="pending">
              Needs review ({counts.pending})
            </TabsTrigger>
            <TabsTrigger value="linked">Linked ({counts.linked})</TabsTrigger>
            <TabsTrigger value="ignored">Ignored ({counts.ignored})</TabsTrigger>
          </TabsList>
        </Tabs>

        <Button
          variant="primary"
          onClick={sync}
          loading={syncing}
          disabled={!mailEnabled}
        >
          <RefreshCw className="size-3.5" />
          {syncing ? "Syncing…" : "Sync mailbox"}
        </Button>
      </div>

      <Card className="overflow-hidden">
        {visible.length === 0 ? (
          <EmptyState
            icon={InboxIcon}
            title={
              filter === "pending"
                ? "Nothing to review"
                : filter === "linked"
                  ? "No linked email yet"
                  : "Nothing ignored"
            }
            description={
              filter === "pending"
                ? "Sync the mailbox to pull in anything new."
                : undefined
            }
            compact
          />
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {visible.map((item) => (
              <MailRow
                key={item.id}
                mail={item}
                applications={applications}
                busy={busyId === item.id}
                onLink={(mailId, applicationId) =>
                  act(mailId, { applicationId }, "link")
                }
                onCreate={(mailId) => act(mailId, { createNew: true }, "link")}
                onIgnore={(mailId) => act(mailId, {}, "ignore")}
              />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
