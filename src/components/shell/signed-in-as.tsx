"use client";

import { LogOut } from "lucide-react";
import * as React from "react";
import type { ShellUser } from "@/components/shell/app-shell";
import { Tooltip } from "@/components/ui/tooltip";
import { useToast } from "@/components/ui/toast";
import { initials } from "@/lib/utils";

export function SignedInAs({ user }: { user: ShellUser }) {
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);

  async function signOut() {
    setBusy(true);
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("Could not sign out.");
      // A full navigation, so no server-rendered page keeps a stale session.
      window.location.href = "/login";
    } catch (error) {
      setBusy(false);
      toast.error("Sign out failed", error instanceof Error ? error.message : "");
    }
  }

  return (
    <div className="flex items-center gap-2 rounded-lg px-1.5 py-1">
      <span
        className="bg-surface-3 text-ink-2 grid size-7 shrink-0 place-items-center rounded-lg text-[10px] font-semibold"
        aria-hidden
      >
        {initials(user.name || user.email)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-ink truncate text-xs font-medium">
          {user.name || user.email}
        </p>
        <p className="text-ink-muted truncate text-[10px]">
          {user.role === "owner" ? "Owner" : "Member"}
        </p>
      </div>
      <Tooltip content="Sign out">
        <button
          type="button"
          onClick={signOut}
          disabled={busy}
          aria-label="Sign out"
          className="text-ink-muted hover:bg-surface-2 hover:text-ink cursor-pointer rounded p-1.5 transition-colors disabled:opacity-50"
        >
          <LogOut className="size-3.5" />
        </button>
      </Tooltip>
    </div>
  );
}
