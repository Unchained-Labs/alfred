"use client";

import * as React from "react";
import { startAuthentication, startRegistration } from "@simplewebauthn/browser";

import { Logo } from "@/components/shell/logo";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

type Mode = "device" | "phone";
type Panel = "signin" | "signup" | "password";

/**
 * Passkey sign-in and sign-up.
 *
 * Sign-in needs no email: the credentials are discoverable, so the
 * authenticator offers the accounts it holds and the server learns who you
 * are from the credential id. Sign-up needs a name and an email, because
 * Alfred addresses you by one and matches your mailbox on the other.
 *
 * "Use my phone" asks the browser for the cross-device ceremony, which is
 * what draws the QR code. The code itself belongs to the browser — the page
 * cannot render it, only ask for it — so this component's job is to say what
 * is about to happen and then stay out of the way.
 */
export function PasskeyAuth({
  initialPanel = "signin",
  signupAllowed,
  firstRun = false,
  passwordAllowed = true,
  redirectTo = "/",
  inviteToken,
  inviteEmail,
}: {
  initialPanel?: Panel;
  signupAllowed: boolean;
  firstRun?: boolean;
  passwordAllowed?: boolean;
  redirectTo?: string;
  /** Set on the invitation screen: the address is the invite's, not a choice. */
  inviteToken?: string;
  inviteEmail?: string;
}) {
  const [panel, setPanel] = React.useState<Panel>(initialPanel);
  const [busy, setBusy] = React.useState<Mode | "password" | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [note, setNote] = React.useState<string | null>(null);
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState(inviteEmail ?? "");

  const supported =
    typeof window !== "undefined" &&
    typeof window.PublicKeyCredential !== "undefined";

  async function post(url: string, body: unknown) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error ?? "That did not work.");
    return payload;
  }

  function explain(caught: unknown): string {
    const message = caught instanceof Error ? caught.message : String(caught);
    // The browser aborts with NotAllowedError both when you cancel and when
    // the ceremony times out. Neither is a fault worth shouting about.
    if (/NotAllowedError|abort/i.test(message)) {
      return "That was cancelled. Nothing changed — try again when you are ready.";
    }
    if (/SecurityError|rpid|relying party/i.test(message)) {
      return "This address cannot use passkeys. They need HTTPS, or localhost — open Alfred on its real hostname.";
    }
    if (/InvalidStateError/i.test(message)) {
      return "This device already has a passkey for that account. Try signing in instead.";
    }
    return message;
  }

  async function signIn(mode: Mode) {
    setBusy(mode);
    setError(null);
    setNote(
      mode === "phone"
        ? "Your browser will show a QR code. Scan it with your phone's camera and approve with Face ID or Touch ID."
        : null,
    );
    try {
      const { challengeId, options } = await post(
        "/api/auth/passkey/login/options",
        { mode },
      );
      const response = await startAuthentication({ optionsJSON: options });
      await post("/api/auth/passkey/login/verify", { challengeId, response });
      window.location.href = redirectTo;
    } catch (caught) {
      setError(explain(caught));
      setNote(null);
      setBusy(null);
    }
  }

  async function signUp(mode: Mode) {
    if (!inviteToken && !email.trim()) {
      setError("Enter the email you want this account to use.");
      return;
    }
    setBusy(mode);
    setError(null);
    setNote(
      mode === "phone"
        ? "Your browser will show a QR code. Scan it with your phone and the passkey is saved there — then you can sign in from the phone too."
        : null,
    );
    try {
      const { challengeId, options } = await post(
        "/api/auth/passkey/register/options",
        {
          name,
          email,
          mode,
          inviteToken,
        },
      );
      const response = await startRegistration({ optionsJSON: options });
      const result = await post("/api/auth/passkey/register/verify", {
        challengeId,
        response,
      });
      if (result.claimed > 0) {
        // Worth saying out loud: this account just adopted data that was
        // sitting in the database before accounts existed.
        setNote(`Signed in. ${result.claimed} existing item(s) are now yours.`);
      }
      window.location.href = redirectTo;
    } catch (caught) {
      setError(explain(caught));
      setNote(null);
      setBusy(null);
    }
  }

  async function signInWithPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("password");
    setError(null);
    try {
      const data = Object.fromEntries(new FormData(event.currentTarget));
      await post("/api/auth/login", data);
      window.location.href = redirectTo;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setBusy(null);
    }
  }

  const title = inviteToken
    ? "Accept your invitation"
    : firstRun
      ? "Set up Alfred"
      : panel === "signup"
        ? "Create your account"
        : panel === "password"
          ? "Sign in with a password"
          : "Sign in";

  const intro = firstRun
    ? "You will be the owner. Your sign-in is a passkey — Face ID, Touch ID or your phone. No password to remember."
    : panel === "signup"
      ? "Your own account, with your own pipeline, résumé and provider keys. Nobody else on this Alfred can see them."
      : panel === "password"
        ? "For accounts created before passkeys. You can add a passkey from Settings afterwards."
        : "Alfred keeps your pipeline, your résumé and your provider keys to your own account.";

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

        {!supported ? (
          <p
            role="alert"
            className="mt-4 rounded-lg border p-2.5 text-xs leading-relaxed"
            style={{
              borderColor: "color-mix(in oklab, var(--critical) 30%, transparent)",
              background: "color-mix(in oklab, var(--critical) 10%, transparent)",
              color: "var(--ink-2)",
            }}
          >
            This browser cannot do passkeys. Passkeys need HTTPS (or localhost) and
            a reasonably current browser.
          </p>
        ) : null}

        {panel === "password" ? (
          <form onSubmit={signInWithPassword} className="mt-5 space-y-3.5">
            <Field label="Email">
              <Input name="email" type="email" autoComplete="username" required />
            </Field>
            <Field label="Password">
              <Input
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </Field>
            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={busy === "password"}
              className="w-full"
            >
              Sign in
            </Button>
          </form>
        ) : (
          <div className="mt-5 space-y-3.5">
            {panel === "signup" ? (
              <>
                <Field label="Your name">
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Alex"
                    autoComplete="name"
                  />
                </Field>
                <Field
                  label="Email"
                  hint={
                    inviteToken
                      ? "This is the address you were invited as."
                      : "Used to identify your account and match your mailbox."
                  }
                >
                  <Input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    type="email"
                    placeholder="you@example.com"
                    autoComplete="username"
                    readOnly={Boolean(inviteToken)}
                    required
                  />
                </Field>
              </>
            ) : null}

            <Button
              type="button"
              variant="primary"
              size="lg"
              className="w-full"
              disabled={!supported || busy !== null}
              loading={busy === "device"}
              onClick={() =>
                panel === "signup" ? signUp("device") : signIn("device")
              }
            >
              {panel === "signup" ? "Create my passkey" : "Sign in with a passkey"}
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="lg"
              className="w-full"
              disabled={!supported || busy !== null}
              loading={busy === "phone"}
              onClick={() =>
                panel === "signup" ? signUp("phone") : signIn("phone")
              }
            >
              {panel === "signup"
                ? "Save it on my phone (QR code)"
                : "Use my phone (QR code)"}
            </Button>
          </div>
        )}

        {note ? (
          <p
            aria-live="polite"
            className="text-ink-muted mt-3.5 text-[11px] leading-relaxed"
          >
            {note}
          </p>
        ) : null}

        {error ? (
          <p
            role="alert"
            className="mt-3.5 rounded-lg border p-2.5 text-xs leading-relaxed"
            style={{
              borderColor: "color-mix(in oklab, var(--critical) 30%, transparent)",
              background: "color-mix(in oklab, var(--critical) 10%, transparent)",
              color: "var(--ink-2)",
            }}
          >
            {error}
          </p>
        ) : null}

        <div className="border-line text-ink-muted mt-4 space-y-1.5 border-t pt-3.5 text-[11px] leading-relaxed">
          {panel !== "signup" && signupAllowed && !firstRun ? (
            <p>
              No account yet?{" "}
              <button
                type="button"
                className="text-ink underline underline-offset-2"
                onClick={() => {
                  setPanel("signup");
                  setError(null);
                  setNote(null);
                }}
              >
                Create one
              </button>
            </p>
          ) : null}
          {panel === "signup" && !firstRun && !inviteToken ? (
            <p>
              Already have an account?{" "}
              <button
                type="button"
                className="text-ink underline underline-offset-2"
                onClick={() => {
                  setPanel("signin");
                  setError(null);
                  setNote(null);
                }}
              >
                Sign in
              </button>
            </p>
          ) : null}
          {panel !== "signup" && !signupAllowed && !firstRun ? (
            <p>
              Sign-up is closed on this Alfred. Ask the owner for an invitation
              link.
            </p>
          ) : null}
          {panel === "signin" && passwordAllowed ? (
            <p>
              <button
                type="button"
                className="underline underline-offset-2"
                onClick={() => {
                  setPanel("password");
                  setError(null);
                }}
              >
                Use a password instead
              </button>{" "}
              — for accounts made before passkeys.
            </p>
          ) : null}
          {panel === "password" ? (
            <p>
              <button
                type="button"
                className="underline underline-offset-2"
                onClick={() => {
                  setPanel("signin");
                  setError(null);
                }}
              >
                Back to passkeys
              </button>
            </p>
          ) : null}
          <p>
            A passkey stays on your device or in its keychain. Alfred only ever
            stores the public half.
          </p>
        </div>
      </div>
    </main>
  );
}
