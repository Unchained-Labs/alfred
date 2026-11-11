import type { Metadata } from "next";
import { QueueView } from "@/components/queue/queue-view";
import { PageHeader } from "@/components/shell/app-shell";
import { requireUserForPage } from "@/lib/auth";

export const metadata: Metadata = { title: "AI queue" };
export const dynamic = "force-dynamic";

export default async function QueuePage() {
  await requireUserForPage();
  return (
    <div className="mx-auto max-w-7xl p-4 lg:p-6">
      <PageHeader
        title="AI queue"
        description="Every generation Alfred runs: what needs your answer, what is running, what is next, and how each kind has gone."
      />
      <QueueView />
    </div>
  );
}
