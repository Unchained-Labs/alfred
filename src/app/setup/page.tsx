import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PasskeyAuth } from "@/components/auth/passkey-auth";
import { needsSetup } from "@/lib/auth";

export const metadata: Metadata = { title: "Set up Alfred" };
export const dynamic = "force-dynamic";

export default async function SetupPage() {
  // Reachable exactly once. The owner is whoever creates the first passkey,
  // and that account adopts anything in the database from before accounts
  // existed — PasskeyAuth reports how much, once it knows.
  if (!needsSetup()) redirect("/login");

  return (
    <PasskeyAuth initialPanel="signup" signupAllowed firstRun passwordAllowed />
  );
}
