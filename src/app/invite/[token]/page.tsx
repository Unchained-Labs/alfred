import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { MailX } from "lucide-react";
import { currentUser, findUsableInvite, MIN_PASSWORD_LENGTH } from "@/lib/auth";

export const metadata: Metadata = { title: "Accept your invitation" };
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ token: string }> };

export default async function InvitePage({ params }: Params) {
  const { token } = await params;
  if (await currentUser()) redirect("/");

  const invite = findUsableInvite(token);
  if (!invite) {
    return (
      <main className="grid min-h-dvh place-items-center px-4">
        <Card className="w-full max-w-sm">
          <EmptyState
            icon={MailX}
            title="That invitation is not usable"
            description="It may have been used already, revoked, or simply expired. Ask whoever invited you for a fresh link."
          />
        </Card>
      </main>
    );
  }

  return (
    <AuthCard
      title="Accept your invitation"
      intro={`You have been invited to Alfred as ${invite.email}. Your pipeline, résumé and provider keys stay yours — nobody else can see them.`}
      action="/api/auth/accept"
      submitLabel="Create my account"
      fields={[
        {
          name: "token",
          label: "Invitation",
          defaultValue: token,
          readOnly: true,
          type: "hidden",
        },
        {
          name: "name",
          label: "Your name",
          placeholder: "Your name",
          autoComplete: "name",
        },
        {
          name: "password",
          label: "Choose a password",
          type: "password",
          autoComplete: "new-password",
          hint: `At least ${MIN_PASSWORD_LENGTH} characters.`,
        },
      ]}
    />
  );
}
