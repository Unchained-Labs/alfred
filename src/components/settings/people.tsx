"use client";

import { Check, Copy, Link2, Trash2, UserPlus } from "lucide-react";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { formatDate, initials, relativeDay } from "@/lib/utils";

export type PersonRow = {
  id: string;
  email: string;
  name: string;
  role: string;
  createdAt: number;
  isYou: boolean;
};

export type InviteRow = {
  id: string;
  email: string;
  role: string;
  expiresAt: number;
};

export function People({
  people,
  invites: initialInvites,
}: {
  people: PersonRow[];
  invites: InviteRow[];
}) {
  const toast = useToast();
  const [invites, setInvites] = React.useState(initialInvites);
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState("member");
  const [busy, setBusy] = React.useState(false);
  const [link, setLink] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  async function refresh() {
    const response = await fetch("/api/auth/invite");
    if (response.ok) setInvites((await response.json()).invites ?? []);
  }

  async function invite(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setLink(null);
    try {
      const response = await fetch("/api/auth/invite", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, role }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error ?? "Could not create the invitation.");

      setLink(new URL(data.path, window.location.origin).toString());
      setEmail("");
      await refresh();
      toast.success("Invitation created", "Copy the link and send it to them.");
    } catch (error) {
      toast.error("Invite failed", error instanceof Error ? error.message : "");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    try {
      const response = await fetch("/api/auth/invite", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!response.ok) throw new Error("Could not revoke it.");
      await refresh();
      toast.success("Invitation revoked");
    } catch (error) {
      toast.error("Revoke failed", error instanceof Error ? error.message : "");
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>People</CardTitle>
            <p className="text-ink-muted mt-0.5 text-xs">
              Everyone here has their own pipeline, résumé, provider keys and
              mailbox. Nobody can see anyone else&apos;s.
            </p>
          </div>
        </CardHeader>
        <ul className="border-line divide-y divide-[var(--border)] border-t">
          {people.map((person) => (
            <li key={person.id} className="flex items-center gap-3 px-5 py-3">
              <span className="bg-surface-3 text-ink-2 grid size-8 shrink-0 place-items-center rounded-lg text-[10px] font-semibold">
                {initials(person.name || person.email)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-ink truncate text-xs font-medium">
                  {person.name || person.email}
                  {person.isYou ? (
                    <span className="text-ink-muted"> · you</span>
                  ) : null}
                </p>
                <p className="text-ink-muted truncate text-[11px]">
                  {person.email} · joined {formatDate(person.createdAt)}
                </p>
              </div>
              <Badge tint={person.role === "owner" ? "var(--brand)" : undefined}>
                {person.role === "owner" ? "Owner" : "Member"}
              </Badge>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Invite someone</CardTitle>
            <p className="text-ink-muted mt-0.5 text-xs">
              There is no public sign-up. Alfred creates a one-time link that you
              pass on however you like — it is never emailed from here.
            </p>
          </div>
        </CardHeader>
        <CardBody className="space-y-4">
          <form onSubmit={invite} className="flex flex-wrap items-end gap-3">
            <Field label="Email" className="min-w-56 flex-1">
              <Input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="them@example.com"
                required
              />
            </Field>
            <Field label="Role" className="w-36">
              <Select
                value={role}
                onValueChange={setRole}
                options={[
                  { value: "member", label: "Member" },
                  { value: "owner", label: "Owner" },
                ]}
                ariaLabel="Role"
              />
            </Field>
            <Button type="submit" variant="primary" loading={busy}>
              <UserPlus className="size-3.5" />
              Create invitation
            </Button>
          </form>

          {link ? (
            <div className="border-line bg-surface-2 rounded-lg border p-3">
              <p className="label-eyebrow mb-1.5 flex items-center gap-1.5">
                <Link2 className="size-3" />
                One-time link — shown once
              </p>
              <div className="flex items-center gap-2">
                <code className="bg-surface text-ink-2 min-w-0 flex-1 truncate rounded px-2 py-1.5 text-[11px]">
                  {link}
                </code>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(link);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    } catch {
                      toast.info(
                        "Copy it manually",
                        "Clipboard access was refused.",
                      );
                    }
                  }}
                >
                  {copied ? (
                    <Check className="size-3.5" />
                  ) : (
                    <Copy className="size-3.5" />
                  )}
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
            </div>
          ) : null}

          {invites.length ? (
            <div className="border-line border-t pt-3.5">
              <p className="label-eyebrow mb-2">Pending invitations</p>
              <ul className="space-y-1.5">
                {invites.map((pending) => (
                  <li
                    key={pending.id}
                    className="text-ink-2 flex items-center gap-3 text-xs"
                  >
                    <span className="min-w-0 flex-1 truncate">{pending.email}</span>
                    <Badge>{pending.role === "owner" ? "Owner" : "Member"}</Badge>
                    <span className="text-ink-muted text-[10px]">
                      expires {relativeDay(pending.expiresAt)}
                    </span>
                    <button
                      type="button"
                      onClick={() => revoke(pending.id)}
                      aria-label={`Revoke the invitation for ${pending.email}`}
                      className="text-ink-muted hover:text-ink cursor-pointer rounded p-1 transition-colors"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </CardBody>
      </Card>
    </div>
  );
}
