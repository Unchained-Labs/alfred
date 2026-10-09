import type { Metadata } from "next";
import * as React from "react";
import { PrepBoard } from "@/components/prep/prep-board";
import { PageHeader } from "@/components/shell/app-shell";
import { requireUserForPage } from "@/lib/auth";
import { listPrepItems } from "@/lib/queries";

export const metadata: Metadata = { title: "Prep" };
export const dynamic = "force-dynamic";

export default async function PrepPage() {
  const user = await requireUserForPage();
  const items = listPrepItems(user.id);

  return (
    <div className="mx-auto flex h-dvh max-w-7xl flex-col gap-4 p-4 lg:p-6">
      <PageHeader
        className="mb-0 shrink-0"
        title="Prep"
        description="Every actionable Alfred generated, across all your applications."
      />
      <PrepBoard items={items} />
    </div>
  );
}
