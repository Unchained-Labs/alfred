import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import { MIN_PASSWORD_LENGTH, needsSetup, orphanedDataCount } from "@/lib/auth";

export const metadata: Metadata = { title: "Set up Alfred" };
export const dynamic = "force-dynamic";

export default async function SetupPage() {
  // Reachable exactly once: the moment a second account could be created here
  // instead of by invitation, this route is closed.
  if (!needsSetup()) redirect("/login");

  const inherited = orphanedDataCount();

  return (
    <AuthCard
      title="Create the owner account"
      intro={
        inherited > 0
          ? `This Alfred already holds ${inherited} ${inherited === 1 ? "application" : "applications"} from before it had accounts. They will become yours.`
          : "You are the first account here. You will be able to invite others."
      }
      action="/api/auth/setup"
      submitLabel="Create account"
      fields={[
        {
          name: "name",
          label: "Your name",
          placeholder: "Alex Rivera",
          autoComplete: "name",
        },
        {
          name: "email",
          label: "Email",
          type: "email",
          autoComplete: "username",
          placeholder: "you@example.com",
        },
        {
          name: "password",
          label: "Password",
          type: "password",
          autoComplete: "new-password",
          hint: `At least ${MIN_PASSWORD_LENGTH} characters. Length matters more than symbols.`,
        },
      ]}
      footer="Alfred has no public sign-up. Everyone else joins by invitation from you."
    />
  );
}
