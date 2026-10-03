import { desc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import * as React from "react";
import { PrepBoard } from "@/components/prep/prep-board";
import { PageHeader } from "@/components/shell/app-shell";
import { db } from "@/db";
import { actionables, applications } from "@/db/schema";

export const metadata: Metadata = { title: "Prep" };
export const dynamic = "force-dynamic";

export default function PrepPage() {
  const rows = db
    .select({
      actionable: actionables,
      company: applications.company,
      role: applications.title,
    })
    .from(actionables)
    .leftJoin(applications, eq(actionables.applicationId, applications.id))
    .orderBy(desc(actionables.priority), actionables.createdAt)
    .all();

  const items = rows.map((row) => ({
    ...row.actionable,
    company: row.company,
    role: row.role,
  }));

  return (
    <div className="mx-auto max-w-7xl p-4 lg:p-6">
      <PageHeader
        title="Prep"
        description="Every actionable Alfred generated, across all your applications."
      />
      <PrepBoard items={items} />
    </div>
  );
}
