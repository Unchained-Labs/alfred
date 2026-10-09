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
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
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

  return (
    <div className="mx-auto max-w-7xl p-4 lg:p-6">
      <DetailHeader app={app} />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <AnalysisPanel
            applicationId={id}
            analysis={analysis}
            hasDescription={Boolean(app.description?.trim())}
          />
          <ActionablesPanel
            applicationId={id}
            actionables={actionables}
            hasAnalysis={Boolean(analysis)}
          />
          <QuestionnairePanel applicationId={id} questions={questions} />
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
                  }
                : null
            }
          />
        </div>

        <div className="space-y-4">
          <AskAlfred applicationId={id} />

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
  );
}
