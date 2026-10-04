import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PasskeyAuth } from "@/components/auth/passkey-auth";
import { anyPasswordAccounts, currentUser, needsSetup } from "@/lib/auth";
import { signupAllowed } from "@/lib/passkeys";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (needsSetup()) redirect("/setup");
  if (await currentUser()) redirect("/");

  return (
    <PasskeyAuth
      signupAllowed={signupAllowed()}
      passwordAllowed={anyPasswordAccounts()}
    />
  );
}
