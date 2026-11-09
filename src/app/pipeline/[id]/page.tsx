import { currentUser, requireUserForPage } from "@/lib/auth";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import * as React from "react";
import { ActionablesPanel } from "@/components/applications/detail/actionables-panel";
import { AnalysisPanel } from "@/components/applications/detail/analysis-panel";
import { AskAlfred } from "@/components/applications/detail/ask-alfred";
import { DetailHeader } from "@/components/applications/detail/detail-header";
import { HandbookPanel } from "@/components/applications/detail/handbook-panel";
import { QuestionnairePanel } from "@/components/applications/detail/questionnaire-panel";
import { Timeline } from "@/components/applications/detail/timeline";
import {
  ApplicationJobsProvider,
  GenerationStrip,
} from "@/components/jobs/application-jobs";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { handbookComplete } from "@/lib/handbook/render";
import { listJobs, pendingOf } from "@/lib/jobs/queue";
import {
  getApplication,
  getHandbook,
  getLatestAnalysis,
  listActionables,
  listEvents,
  listQuestions,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  // Metadata runs outside the page render, so it resolves the user itself; an
  // unauthenticated request simply gets the generic title.
  const viewer = await currentUser();
  const app = viewer ? getApplication(viewer.id, id) : undefined;
  return { title: app ? `${app.title} · ${app.company}` : "Application" };
}

export default async function ApplicationPage({ params }: Params) {
  const user = await requireUserForPage();
  const { id } = await params;
  const app = getApplication(user.id, id);
  if (!app) notFound();

  const analysis = getLatestAnalysis(user.id, id);
  const actionables = listActionables(user.id, id);
  const questions = listQuestions(user.id, id);
  const events = listEvents(user.id, id);
  const handbook = getHandbook(user.id, id);
  // Recent AI jobs for this application: the strip shows them, and a panel
  // whose generation is still queued or running picks it up after a reload.
  const jobs = listJobs(user.id, { applicationId: id, limit: 60 });

  return (
    <ApplicationJobsProvider applicationId={id} initialJobs={jobs}>
      <div className="mx-auto max-w-7xl p-4 lg:p-6">
        <DetailHeader
          app={app}
          openPrepCount={
            actionables.filter(
              (item) => item.status === "todo" || item.status === "in_progress",
            ).length
          }
        />

        <div className="mb-4">
          <GenerationStrip />
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <AnalysisPanel
              applicationId={id}
              analysis={analysis}
              hasDescription={Boolean(app.description?.trim())}
              activeJob={pendingOf(jobs, "analysis")}
            />
            <ActionablesPanel
              applicationId={id}
              actionables={actionables}
              hasAnalysis={Boolean(analysis)}
              activeJob={pendingOf(jobs, "actionables")}
            />
            <QuestionnairePanel
              applicationId={id}
              questions={questions}
              activeJob={pendingOf(jobs, "questionnaire")}
            />
            <HandbookPanel
              applicationId={id}
              hasDescription={Boolean(app.description?.trim())}
              handbook={
                handbook
                  ? {
                      id: handbook.id,
                      title: handbook.title,
                      parts: handbook.parts,
                      createdAt: handbook.createdAt,
                      model: handbook.model,
                      complete: handbookComplete(handbook.content),
                    }
                  : null
              }
            />
          </div>

          <div className="space-y-4">
            <AskAlfred applicationId={id} />

            {/* What they said when it ended. Above the posting text, because once
              an application is closed this is the only part of the record that
              can still change how you write the next one. */}
            {app.outcomeNote?.trim() ? (
              <Card>
                <CardHeader>
                  <CardTitle>What they said</CardTitle>
                </CardHeader>
                <CardBody>
                  <p className="text-ink-2 text-xs leading-relaxed whitespace-pre-wrap">
                    {app.outcomeNote}
                  </p>
                </CardBody>
              </Card>
            ) : null}

            {app.description?.trim() ? (
              <Card>
                <CardHeader>
                  <CardTitle>Job description</CardTitle>
                </CardHeader>
                <CardBody>
                  <div className="max-h-72 overflow-y-auto">
                    <p className="text-ink-2 text-xs leading-relaxed whitespace-pre-wrap">
                      {app.description}
                    </p>
                  </div>
                </CardBody>
              </Card>
            ) : null}

            {app.notes?.trim() ? (
              <Card>
                <CardHeader>
                  <CardTitle>Your notes</CardTitle>
                </CardHeader>
                <CardBody>
                  <p className="text-ink-2 text-xs leading-relaxed whitespace-pre-wrap">
                    {app.notes}
                  </p>
                </CardBody>
              </Card>
            ) : null}

            <Timeline applicationId={id} events={events} />
          </div>
        </div>
      </div>
    </ApplicationJobsProvider>
  );
}
