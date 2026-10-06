# Security Policy

Alfred stores your résumé, your mailbox password and your AI provider keys, and
it talks to a mailbox over IMAP — so we take security reports seriously.

## Supported versions

Security fixes go into the latest release. Please update before reporting:

```sh
git pull && npm install && npm run build
```

## Reporting a vulnerability

**Please do not open a public issue.** Report privately through GitHub's
[private vulnerability reporting](https://github.com/Unchained-Labs/alfred/security/advisories/new)
with:

- a description of the issue and its impact,
- steps to reproduce (a proof of concept if you have one),
- the commit you're on and your OS.

You can expect an acknowledgement within 3 working days and a status update
within 10. We'll credit you in the release notes unless you'd rather stay
anonymous.

## Security model

Worth knowing when you assess a report:

- **Alfred is a self-hosted app that binds to localhost.** It has accounts —
  an owner, and members who join by one-time invitation, with no public sign-up —
  and every query filters on the signed-in account, so no one sees anyone else's
  pipeline, résumé, provider keys or mail. It is still built to be reached over a
  private network or a tunnel rather than published at a public address.
- **Credentials are stored in plaintext** in `data/alfred.db` — AI provider keys
  and the mailbox password. This is a deliberate trade for a local single-user
  tool, and it means the database file is as sensitive as the credentials in it.
  Setting `ANTHROPIC_API_KEY`, `ALFRED_LLM_API_KEY` or `ALFRED_AGENT_API_KEY` in
  the environment avoids storing them at all; the environment takes precedence.
- **Secrets never reach the browser.** `redactSettings` strips every credential
  before settings are serialised to the client, which only learns whether one is
  present. A blank credential in a settings update means "keep the stored one",
  so the UI can round-trip settings without ever holding the secret.
- **Mailbox access is read-only.** Alfred never marks, moves or deletes anything,
  and never sends mail. Message bodies are stored locally and are sent to your
  configured AI provider only when triage is enabled.
- **Your data goes to the provider you configure.** Job descriptions, your résumé
  and (with triage on) email bodies are sent to whichever provider is selected.
  A local OpenAI-compatible endpoint keeps all of it on your machine.
- **Exercise code runs on the server, sandboxed.** Submitting a coding exercise
  executes your Python in Pyodide — WebAssembly, so no filesystem and no network
  — in a separate short-lived process started with a bare environment, killed if
  it does not finish. The JavaScript bridge modules (`js`, `pyodide_js`) are
  blocked by name, since that is the one route out of the sandbox and into the
  host process. The code is your own, in your own app; the sandbox is there so
  that a member of a shared Alfred cannot reach the database or another
  account's data through it.
- **Prompt injection is in scope.** Job descriptions and emails are untrusted
  input that reach a model. Alfred constrains every structured operation to a
  schema and never lets a model's output drive an action on its own — a triaged
  email can suggest a stage, but only you can apply it.

Out of scope: anything that requires an attacker to already have read access to
your home directory, and exposing Alfred to a public network.
