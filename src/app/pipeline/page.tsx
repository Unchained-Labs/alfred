import type { Metadata } from "next";
import * as React from "react";
import { PipelineBoard } from "@/components/applications/pipeline-board";
import { PageHeader } from "@/components/shell/app-shell";
import { db } from "@/db";
import { analyses } from "@/db/schema";
import { listApplications } from "@/lib/queries";
import { desc } from "drizzle-orm";

export const metadata: Metadata = { title: "Pipeline" };
export const dynamic = "force-dynamic";

export default function PipelinePage() {
  const applications = listApplications({ includeArchived: false });

  // One query for every application's latest fit score, rather than N.
  const scores = new Map<string, number>();
  for (const row of db
    .select({
      applicationId: analyses.applicationId,
      fitScore: analyses.fitScore,
    })
    .from(analyses)
    .orderBy(desc(analyses.createdAt))
    .all()) {
    if (!scores.has(row.applicationId)) scores.set(row.applicationId, row.fitScore);
  }

  const cards = applications.map((app) => ({
    ...app,
    fitScore: scores.get(app.id) ?? null,
  }));

  return (
    <div className="mx-auto max-w-7xl p-4 lg:p-6">
      <PageHeader
        title="Pipeline"
        description="Drag a card to move it through the stages. Alfred logs every move."
      />
      <PipelineBoard applications={cards} />
    </div>
  );
}
