import { requireUserForPage } from "@/lib/auth";
import type { Metadata } from "next";
import * as React from "react";
import { InboxView } from "@/components/inbox/inbox-view";
import { PageHeader } from "@/components/shell/app-shell";
import { listApplications, listMail } from "@/lib/queries";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Inbox" };
export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const user = await requireUserForPage();
  const { mail } = getSettings(user.id);

  return (
    <div className="mx-auto max-w-5xl p-4 lg:p-6">
      <PageHeader
        title="Inbox"
        description="Recruiter mail, classified and matched to your pipeline. Alfred never changes a stage without you."
      />
      <InboxView
        mail={listMail(user.id, undefined, 150)}
        applications={listApplications(user.id, { includeArchived: true })}
        mailEnabled={mail.enabled}
      />
    </div>
  );
}
