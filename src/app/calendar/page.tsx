import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays } from "lucide-react";

import { PageHeader } from "@/components/shell/app-shell";
import { MonthGrid, type CalendarRow } from "@/components/calendar/month-grid";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { requireUserForPage } from "@/lib/auth";
import { agenda, calendarItems } from "@/lib/queries";

export const metadata: Metadata = { title: "Calendar" };
export const dynamic = "force-dynamic";

type Search = { searchParams: Promise<{ y?: string; m?: string }> };

export default async function CalendarPage({ searchParams }: Search) {
  const user = await requireUserForPage();
  const sp = await searchParams;

  const now = new Date();
  const year =
    Number.isFinite(Number(sp.y)) && sp.y ? Number(sp.y) : now.getFullYear();
  const month =
    sp.m !== undefined && Number.isFinite(Number(sp.m))
      ? Number(sp.m)
      : now.getMonth();

  // One week either side, so the leading and trailing cells of the grid are
  // not mysteriously empty when something sits just outside the month.
  const from = new Date(year, month, 1);
  from.setDate(from.getDate() - 7);
  const to = new Date(year, month + 1, 0);
  to.setDate(to.getDate() + 7);

  const rows: CalendarRow[] = calendarItems(user.id, from, to).map((i) => ({
    id: i.id,
    kind: i.kind,
    day: i.day,
    at: i.at.toISOString(),
    title: i.title,
    detail: i.detail,
    company: i.company,
    applicationId: i.applicationId,
    done: i.done,
  }));

  const next = agenda(user.id, 30, 8);
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  return (
    // h-dvh with min-h-0 children: the page itself never scrolls, the grid does.
    <div className="mx-auto flex h-dvh max-w-6xl flex-col gap-4 p-4 lg:p-6">
      <PageHeader
        title="Calendar"
        description="Interviews, prep deadlines and what already happened — on one axis."
      />

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[1fr_320px]">
        <MonthGrid rows={rows} year={year} month={month} today={todayKey} />

        <Card className="flex min-h-0 flex-col">
          <CardHeader>
            <div>
              <CardTitle>Coming up</CardTitle>
              <p className="text-ink-muted mt-0.5 text-xs">Next 30 days</p>
            </div>
          </CardHeader>
          <CardBody className="min-h-0 flex-1 overflow-auto">
            {next.length === 0 ? (
              <EmptyState
                icon={CalendarDays}
                title="Nothing scheduled"
                description="Add an interview date to an application and it shows up here, with its prep work counting down to it."
              />
            ) : (
              <ul className="divide-line divide-y">
                {next.map((i) => (
                  <li key={i.id} className="py-2.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-ink truncate text-sm">
                        {i.applicationId ? (
                          <Link
                            href={`/pipeline/${i.applicationId}`}
                            className="underline-offset-2 hover:underline"
                          >
                            {i.title}
                          </Link>
                        ) : (
                          i.title
                        )}
                      </span>
                      <span className="text-ink-muted shrink-0 text-[11px]">
                        {i.at.toLocaleDateString(undefined, {
                          day: "numeric",
                          month: "short",
                        })}
                      </span>
                    </div>
                    <p className="text-ink-muted text-[11px]">
                      {i.company ? `${i.company} · ` : ""}
                      {i.kind === "interview" ? "Interview" : "Prep due"}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
