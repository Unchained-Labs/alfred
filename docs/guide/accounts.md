# Accounts

Alfred supports several people on one instance. Each person gets their own
pipeline, résumé, prep plans, provider keys and mailbox — **nobody can see
anyone else's**.

## First run

The first time Alfred starts with no accounts, every page redirects to
`/setup`, which creates the **owner**. That route closes permanently once an
account exists.

!!! tip "Upgrading an existing Alfred"
    If your database predates accounts, the setup screen says so — *"This Alfred
    already holds 6 applications"* — and everything in it becomes the owner's on
    sign-up. Nothing is lost and nothing needs exporting.

## Inviting people

There is **no public sign-up**. The owner creates invitations in
**Settings → People**:

1. Enter an email and a role.
2. Alfred generates a **one-time link, shown once**.
3. Send it however you like — Alfred never emails anything.

The invitee opens the link, picks a name and password, and is signed in. Links
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

Passwords use scrypt with the parameters stored alongside each hash, so they can
be strengthened later without invalidating anyone's password. Changing a
password revokes every session for that account.

Authorisation is enforced **next to the data**, not in the proxy: every query and
mutation takes the owner as an explicit argument and filters on it. The proxy
only performs a cookie-presence redirect, so a forged cookie gets past it and
straight into a 401.

!!! warning "Still not an internet-facing app"
    Accounts make Alfred multi-user, not hardened. There is no rate limiting on
    sign-in, no email verification and no password reset — if someone forgets
    their password, the owner has no way to reset it from the UI yet. Keep Alfred
    behind a tailnet, a tunnel or an authenticating proxy.
