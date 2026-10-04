"use client";

import * as React from "react";
import { Logo } from "@/components/shell/logo";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

export type AuthField = {
  name: string;
  label: string;
  type?: string;
  placeholder?: string;
  hint?: string;
  autoComplete?: string;
  defaultValue?: string;
  readOnly?: boolean;
};

/**
 * The shared shell for sign-in, first-run setup and invitation acceptance.
 * These three screens differ only in their copy, their fields, and where they
 * POST — so they share everything else.
 */
export function AuthCard({
  title,
  intro,
  fields,
  action,
  submitLabel,
  footer,
  redirectTo = "/",
}: {
  title: string;
  intro: string;
  fields: AuthField[];
  action: string;
  submitLabel: string;
  footer?: React.ReactNode;
  redirectTo?: string;
}) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const data = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const response = await fetch(action, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "That did not work.");

      // A full navigation, so the server re-renders with the new session.
      window.location.href = redirectTo;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setBusy(false);
    }
  }

  return (
    <main className="relative grid min-h-dvh place-items-center px-4 py-10">
      <div className="aurora" aria-hidden />
      <div className="card card-lit relative w-full max-w-sm p-6">
        <div className="flex items-center gap-2.5">
          <Logo />
          <div>
            <p className="text-ink text-sm font-semibold tracking-tight">Alfred</p>
            <p className="text-ink-muted text-[11px]">Job-hunt butler</p>
          </div>
        </div>

        <h1 className="text-ink mt-5 text-lg font-semibold tracking-tight">
          {title}
        </h1>
        <p className="text-ink-muted mt-1 text-xs leading-relaxed">{intro}</p>

        <form onSubmit={submit} className="mt-5 space-y-3.5">
          {fields.map((field) => (
            <Field key={field.name} label={field.label} hint={field.hint}>
              <Input
                name={field.name}
                type={field.type ?? "text"}
                placeholder={field.placeholder}
                autoComplete={field.autoComplete}
                defaultValue={field.defaultValue}
                readOnly={field.readOnly}
                required
              />
            </Field>
          ))}

          {error ? (
            <p
              role="alert"
              className="rounded-lg border p-2.5 text-xs leading-relaxed"
              style={{
                borderColor:
                  "color-mix(in oklab, var(--critical) 30%, transparent)",
                background: "color-mix(in oklab, var(--critical) 10%, transparent)",
                color: "var(--ink-2)",
              }}
            >
              {error}
            </p>
          ) : null}

          <Button
            type="submit"
            variant="primary"
            size="lg"
            loading={busy}
            className="w-full"
          >
            {submitLabel}
          </Button>
        </form>

        {footer ? (
          <div className="border-line text-ink-muted mt-4 border-t pt-3.5 text-[11px] leading-relaxed">
            {footer}
          </div>
        ) : null}
      </div>
    </main>
  );
}
