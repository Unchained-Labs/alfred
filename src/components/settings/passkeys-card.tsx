"use client";

import * as React from "react";
import { startRegistration } from "@simplewebauthn/browser";
import { KeyRound, Smartphone, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";

export type PasskeyRow = {
  id: string;
  name: string;
  deviceType: string | null;
  backedUp: boolean;
  createdAt: number;
  lastUsedAt: number | null;
};

const when = (ms: number | null) =>
  ms
    ? new Date(ms).toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "never";

/**
 * Add and remove the passkeys that can sign in to this account.
 *
 * "Add my phone" runs the same cross-device ceremony as the sign-in screen,
 * so the QR code comes from the browser rather than from here.
 */
export function PasskeysCard({
  initial,
  hasPassword,
}: {
  initial: PasskeyRow[];
  hasPassword: boolean;
}) {
  const toast = useToast();
  const [rows, setRows] = React.useState(initial);
  const [busy, setBusy] = React.useState<"device" | "phone" | null>(null);

  async function send(url: string, init: RequestInit) {
    const response = await fetch(url, {
      headers: { "content-type": "application/json" },
      ...init,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error ?? "That did not work.");
    return payload;
  }

  async function add(mode: "device" | "phone") {
    setBusy(mode);
    try {
      const { challengeId, options } = await send(
        "/api/auth/passkey/register/options",
        {
          method: "POST",
          body: JSON.stringify({ mode }),
        },
      );
      const response = await startRegistration({ optionsJSON: options });
      await send("/api/auth/passkey/register/verify", {
        method: "POST",
        body: JSON.stringify({ challengeId, response }),
      });
      const fresh = await send("/api/auth/passkey/manage", { method: "GET" });
      setRows(fresh.passkeys);
      toast.success(mode === "phone" ? "Phone added." : "Passkey added.");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      if (!/NotAllowedError|abort/i.test(message)) toast.error(message);
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    try {
      const fresh = await send("/api/auth/passkey/manage", {
        method: "DELETE",
        body: JSON.stringify({ id }),
      });
      setRows(fresh.passkeys);
      toast.success("Passkey removed.");
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : String(caught));
    }
  }

  const onlyOne = rows.length <= 1 && !hasPassword;

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Passkeys</CardTitle>
          <p className="text-ink-muted mt-0.5 text-xs">
            How you sign in. Add your phone and you can sign in from it by scanning
            a QR code — the passkey itself never leaves your device.
          </p>
        </div>
      </CardHeader>
      <CardBody className="space-y-4">
        {rows.length === 0 ? (
          <p className="text-ink-muted text-xs">No passkeys on this account yet.</p>
        ) : (
          <ul className="divide-line divide-y">
            {rows.map((row) => (
              <li
                key={row.id}
                className="flex items-center justify-between gap-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="text-ink truncate text-sm">{row.name}</p>
                  <p className="text-ink-muted text-[11px]">
                    added {when(row.createdAt)} · last used {when(row.lastUsedAt)}
                    {row.backedUp ? " · synced" : ""}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Remove ${row.name}`}
                  disabled={onlyOne}
                  title={
                    onlyOne
                      ? "This is your only way in. Add another passkey first."
                      : undefined
                  }
                  onClick={() => remove(row.id)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            loading={busy === "device"}
            disabled={busy !== null}
            onClick={() => add("device")}
          >
            <KeyRound className="size-4" />
            Add this device
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            loading={busy === "phone"}
            disabled={busy !== null}
            onClick={() => add("phone")}
          >
            <Smartphone className="size-4" />
            Add my phone (QR code)
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
