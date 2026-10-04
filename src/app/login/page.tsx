import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import { currentUser, needsSetup } from "@/lib/auth";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (needsSetup()) redirect("/setup");
  if (await currentUser()) redirect("/");

  return (
    <AuthCard
      title="Sign in"
      intro="Alfred keeps your pipeline, your résumé and your provider keys to your own account."
      action="/api/auth/login"
      submitLabel="Sign in"
      fields={[
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
          autoComplete: "current-password",
        },
      ]}
      footer="There is no public sign-up. Ask the owner of this Alfred for an invitation."
    />
  );
}
