import type { Metadata } from "next";
import * as React from "react";
import { PageHeader } from "@/components/shell/app-shell";
import { SettingsView } from "@/components/settings/settings-view";
import { getSettings, redactSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-4xl p-4 lg:p-6">
      <PageHeader
        title="Settings"
        description="Who you are, which AI powers Alfred, and where your mail comes from."
      />
      <SettingsView initial={redactSettings(getSettings())} />
    </div>
  );
}
