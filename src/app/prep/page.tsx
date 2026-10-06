import type { Metadata } from "next";
import * as React from "react";
import { PrepBoard } from "@/components/prep/prep-board";
import { PageHeader } from "@/components/shell/app-shell";
import { requireUser } from "@/lib/auth";
import { listPrepItems } from "@/lib/queries";

export const metadata: Metadata = { title: "Prep" };
export const dynamic = "force-dynamic";

export default async function PrepPage() {
  const user = await requireUser();
  const items = listPrepItems(user.id);

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
