import type { Metadata } from "next";
import { notFound } from "next/navigation";
import * as React from "react";
import { ActionablesPanel } from "@/components/applications/detail/actionables-panel";
import { AnalysisPanel } from "@/components/applications/detail/analysis-panel";
import { AskAlfred } from "@/components/applications/detail/ask-alfred";
import { DetailHeader } from "@/components/applications/detail/detail-header";
import { QuestionnairePanel } from "@/components/applications/detail/questionnaire-panel";
import { Timeline } from "@/components/applications/detail/timeline";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getApplication,
  getLatestAnalysis,
  listActionables,
  listEvents,
  listQuestions,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const app = getApplication(id);
  return { title: app ? `${app.title} · ${app.company}` : "Application" };
}

export default async function ApplicationPage({ params }: Params) {
  const { id } = await params;
  const app = getApplication(id);
  if (!app) notFound();

  const analysis = getLatestAnalysis(id);
  const actionables = listActionables(id);
  const questions = listQuestions(id);
  const events = listEvents(id);

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
                  <p className="text-xs leading-relaxed whitespace-pre-wrap text-ink-2">
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
                <p className="text-xs leading-relaxed whitespace-pre-wrap text-ink-2">
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
