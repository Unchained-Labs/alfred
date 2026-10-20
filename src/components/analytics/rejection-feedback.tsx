import { MessageSquareQuote } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import type { RejectionSummary } from "@/lib/analytics/compute";
import { STAGE_META } from "@/lib/stages";
import { formatDate, initials } from "@/lib/utils";

/*
 * Every rejection, newest first, with whatever the company actually said.
 *
 * This is the only panel on the page built from outside information. Every
 * other number is Alfred measuring its own records; this is the employer's
 * side of it, which makes it worth more than the rest put together and also
 * explains the coverage line at the top. "4 of 9 said why" is a prompt to ask
 * the other five — the feedback you never requested is the cheapest signal you
 * are leaving on the table.
 */
export function RejectionFeedback({
  rejections,
}: {
  rejections: RejectionSummary;
}) {
  if (!rejections.total) {
    return (
      <EmptyState
        icon={MessageSquareQuote}
        title="No rejections yet"
        description="When one comes, closing it out stores what they said here — the one part of a dead application that still changes what you do next."
        compact
      />
    );
  }

  const silent = rejections.total - rejections.withFeedback;

  return (
    <div>
      <div className="border-line bg-surface-2/40 border-b px-5 py-3">
        <p className="text-ink-2 text-xs">
          <strong className="text-ink tnum">{rejections.withFeedback}</strong> of{" "}
          <strong className="text-ink tnum">{rejections.total}</strong>{" "}
          {rejections.total === 1 ? "rejection" : "rejections"} said why.
          {silent > 0 ? (
            <span className="text-ink-muted">
              {" "}
              Worth asking the other {silent} — most will answer a short, polite
              reply.
            </span>
          ) : null}
        </p>
      </div>

      <ul className="divide-y divide-[var(--border)]">
        {rejections.items.map((item) => (
          <li key={item.id} className="px-5 py-3.5">
            <div className="flex items-start gap-3">
              <span className="bg-surface-3 text-ink-2 mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg text-[10px] font-semibold">
                {initials(item.company)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <Link
                    href={`/pipeline/${item.id}`}
                    className="text-ink hover:text-brand truncate text-xs font-medium transition-colors"
                  >
                    {item.title}
                  </Link>
                  <span className="text-ink-muted truncate text-[11px]">
                    {item.company}
                  </span>
                  {item.closedFrom ? (
                    <Badge tint={`var(${STAGE_META[item.closedFrom].token})`}>
                      out at {STAGE_META[item.closedFrom].label.toLowerCase()}
                    </Badge>
                  ) : (
                    /* No stage history on the record, so attributing this to a
                       round would be a guess dressed as a fact. */
                    <Badge>stage unrecorded</Badge>
                  )}
                  {item.at ? (
                    <span className="text-ink-muted ml-auto shrink-0 text-[11px]">
                      {formatDate(item.at)}
                    </span>
                  ) : null}
                </div>

                {item.note ? (
                  <blockquote
                    className="text-ink-2 mt-2 border-l-2 pl-2.5 text-xs leading-relaxed"
                    style={{ borderColor: "var(--critical)" }}
                  >
                    {item.note}
                  </blockquote>
                ) : (
                  <p className="text-ink-muted mt-1.5 text-[11px] italic">
                    No reason recorded.
                  </p>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
