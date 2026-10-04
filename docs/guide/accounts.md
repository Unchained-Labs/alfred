# Accounts

Alfred supports several people on one instance. Each person gets their own
pipeline, résumé, prep plans, provider keys and mailbox — **nobody can see
anyone else's**.

## Sign-in is a passkey

There are no passwords. You sign in with **Face ID, Touch ID, Windows Hello, a
security key, or your phone** — and Alfred only ever stores the public half of
the key, so there is nothing in the database worth stealing to sign in as you.

Sign-in does not ask who you are. Passkeys here are *discoverable*, so the
authenticator offers the accounts it holds and Alfred learns which one from the
credential itself.

### Using your phone

**Use my phone (QR code)** runs the cross-device ceremony: your browser shows a
QR code, you scan it with the phone's camera and approve with Face ID. Do it on
the sign-up screen and the passkey is saved on the phone, so that phone can sign
in on its own afterwards. Do it from **Settings → Passkeys** and you are adding
the phone to an account you already have.

The QR code is drawn by the browser, not by Alfred — the page can ask for that
flow but cannot render the code itself.

!!! warning "Passkeys need HTTPS"
    A passkey is bound to the hostname it was created on, and browsers only
    allow them over **https** (or `http://localhost`). Behind a proxy or a
    tailnet, set `ALFRED_PUBLIC_URL` and `ALFRED_RP_ID` to the address the
    browser actually shows. Get it wrong and nothing errors — the passkey is
    simply never offered, and sign-in looks broken for no visible reason.

## First run

The first time Alfred starts with no accounts, every page redirects to
`/setup`, which creates the **owner**. That route closes permanently once an
account exists.

!!! tip "Upgrading an existing Alfred"
    If your database predates accounts, the setup screen says so — *"This Alfred
    already holds 6 applications"* — and everything in it becomes the owner's on
    sign-up. Nothing is lost and nothing needs exporting.

## Sign-up and invitations

Two ways in, and which ones exist is up to you.

**Open sign-up** — set `ALFRED_ALLOW_SIGNUP=1` and the sign-in screen offers
*Create one*: anybody who can reach Alfred makes their own account with their
own passkey. The first account is always allowed regardless, because that is how
the owner comes to exist.

**Invitations** — always available. The owner creates them in
**Settings → People**:

1. Enter an email and a role.
2. Alfred generates a **one-time link, shown once**.
3. Send it however you like — Alfred never emails anything.

The invitee opens the link, picks a name, creates a passkey and is signed in.
The address and the role come from the invitation, not from anything the browser
sends, so accepting one cannot be turned into a way to pick your own role. Links
expire after 7 days, and the owner can revoke an unused one at any time.

| Role | Can |
|---|---|
| **Owner** | Everything a member can, plus invite and revoke |
| **Member** | Their own pipeline, prep, settings and mailbox |

## What is private

Everything that belongs to a person:

- applications, timelines, analyses, prep plans and questionnaires
- the profile and résumé
- **AI provider keys** — each person brings their own, and their usage is billed
  to their own key
- **the mailbox** — per account, always. Nobody reads anyone else's mail.

Two accounts can even hold the same email message independently; uniqueness is
per account, not global.

## How it works

Sessions are server-side. The cookie carries an opaque 256-bit token and the
database stores only its SHA-256, so a leaked database cannot be replayed as a
login. Cookies are `HttpOnly`, `SameSite=Lax`, and `Secure` in production.

Passkeys are WebAuthn credentials. Alfred stores the credential id, the public
key and a signature counter — never anything that can sign. A WebAuthn challenge
is single-use, expires in five minutes, and is deleted the moment it is read,
whether or not verification then succeeds.

Challenges live in the database rather than in a cookie because the phone flow
spans two devices: the ceremony belongs to the browser that started it while the
approval happens on a phone, and a cookie cannot be in both places.

Accounts created before passkeys keep their scrypt password and can still sign
in with it — the sign-in screen only offers that form when such an account
actually exists. New accounts never get a password at all. You cannot delete
your last passkey unless the account also has a password, because that would
lock you out.

Authorisation is enforced **next to the data**, not in the proxy: every query and
mutation takes the owner as an explicit argument and filters on it. The proxy
only performs a cookie-presence redirect, so a forged cookie gets past it and
straight into a 401.

!!! warning "Still not an internet-facing app"
    Accounts make Alfred multi-user, not hardened. There is no rate limiting on
    sign-in and no email verification. **Losing every passkey for an account
    means losing the account** — there is no reset from the UI, so add a second
    passkey (your phone) before you need it. Keep Alfred behind a tailnet, a
    tunnel or an authenticating proxy.
