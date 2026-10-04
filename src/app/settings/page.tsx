import { requireUser } from "@/lib/auth";
import type { Metadata } from "next";
import * as React from "react";
import { PageHeader } from "@/components/shell/app-shell";
import { SettingsView } from "@/components/settings/settings-view";
import { PasskeysCard } from "@/components/settings/passkeys-card";
import { listInvites, listUsers } from "@/lib/auth";
import { getSettings, redactSettings } from "@/lib/settings";
import { listPasskeys } from "@/lib/passkeys";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireUser();
  return (
    <div className="mx-auto max-w-4xl p-4 lg:p-6">
      <PageHeader
        title="Settings"
        description="Who you are, which AI powers Alfred, and where your mail comes from."
      />
      <SettingsView
        initial={redactSettings(getSettings(user.id))}
        isOwner={user.role === "owner"}
        people={
          user.role === "owner"
            ? listUsers().map((person) => ({
                id: person.id,
                email: person.email,
                name: person.name,
                role: person.role,
                createdAt: person.createdAt.getTime(),
                isYou: person.id === user.id,
              }))
            : []
        }
        invites={
          user.role === "owner"
            ? listInvites().map((invite) => ({
                id: invite.id,
                email: invite.email,
                role: invite.role,
                expiresAt: invite.expiresAt.getTime(),
              }))
            : []
        }
      />
      <div className="mt-6">
        <PasskeysCard
          initial={listPasskeys(user.id).map((row) => ({
            id: row.id,
            name: row.name,
            deviceType: row.deviceType,
            backedUp: row.backedUp,
            createdAt: row.createdAt.getTime(),
            lastUsedAt: row.lastUsedAt ? row.lastUsedAt.getTime() : null,
          }))}
          hasPassword={Boolean(user.passwordHash)}
        />
      </div>
    </div>
  );
}
