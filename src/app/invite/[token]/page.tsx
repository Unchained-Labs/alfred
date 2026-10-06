import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MailX } from "lucide-react";

import { PasskeyAuth } from "@/components/auth/passkey-auth";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { currentUser, findUsableInvite } from "@/lib/auth";

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

  // The address and the role come from the invitation on the server; the
  // token is all the browser gets to send back.
  return (
    <PasskeyAuth
      initialPanel="signup"
      signupAllowed
      passwordAllowed
      inviteToken={token}
      inviteEmail={invite.email}
    />
  );
}
