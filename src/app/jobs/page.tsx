import type { Metadata } from "next";
import * as React from "react";
import { JobsTable } from "@/components/jobs/jobs-table";
import { PageHeader } from "@/components/shell/app-shell";
import { requireUserForPage } from "@/lib/auth";
import { listJobsWithContext } from "@/lib/queries";

export const metadata: Metadata = { title: "Jobs" };
export const dynamic = "force-dynamic";

/**
 * Every job, in one table.
 *
 * Deliberately not the board. The board answers "what do I do next" and hides
 * what is closed; this answers "what have I got", archived rows included, and
 * sorts by whichever column matters today.
 *
 * Ordinary document flow — no fixed height anywhere — so filter chrome can
 * never squeeze the rows, and the table carries its own horizontal scroll.
 */
export default async function JobsPage() {
  const user = await requireUserForPage();
  const jobs = listJobsWithContext(user.id);

  return (
    <div className="mx-auto max-w-7xl p-4 lg:p-6">
      <PageHeader
        title="Jobs"
        description="Everything you have tracked, open and closed. Sort by any column."
      />
      <JobsTable jobs={jobs} />
    </div>
  );
}
