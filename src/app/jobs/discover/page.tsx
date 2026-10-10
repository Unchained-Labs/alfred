import type { Metadata } from "next";
import * as React from "react";
import { DiscoverView } from "@/components/jobs/discover-view";
import { JobsTabs } from "@/components/jobs/jobs-tabs";
import { PageHeader } from "@/components/shell/app-shell";
import { requireUserForPage } from "@/lib/auth";
import {
  countNewJobHits,
  listJobBoards,
  listJobHits,
  listJobSearches,
} from "@/lib/queries";

export const metadata: Metadata = { title: "Discover" };
export const dynamic = "force-dynamic";

/**
 * What is out there, as opposed to what you already track.
 *
 * Standing searches run on a daily schedule and read either an employer's own
 * ATS board or one of the open job feeds. Everything they turn up lands here
 * until you track it or dismiss it.
 */
export default async function DiscoverPage() {
  const user = await requireUserForPage();
  const hits = listJobHits(user.id, { status: "new", limit: 120 });
  const searches = listJobSearches(user.id);
  const boards = listJobBoards(user.id);
  const newCount = countNewJobHits(user.id);

  return (
    <div className="mx-auto max-w-7xl p-4 lg:p-6">
      <PageHeader
        title="Discover"
        description="Standing searches, scanned daily. Track what is worth tracking."
      />
      <JobsTabs newCount={newCount} />
      <DiscoverView hits={hits} searches={searches} boards={boards} />
    </div>
  );
}
