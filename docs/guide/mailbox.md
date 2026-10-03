# Mailbox

Alfred can read a mailbox over IMAP, classify what it finds, and match it to your
pipeline.

!!! info "Read-only, always"
Alfred never marks, moves, deletes or sends anything. It opens the folder
read-only and closes it.

## Connecting

**Settings → Mailbox**:

| Field       | Notes                                          |
| ----------- | ---------------------------------------------- |
| Host / port | e.g. `imap.gmail.com` / `993`                  |
| Username    | Your address                                   |
| Password    | **An app password**, not your account password |
| Folder      | `INBOX` by default                             |
| Look back   | How many days each sync reaches back           |

=== "Gmail"

    Enable 2FA, then create an [app password](https://myaccount.google.com/apppasswords).
    Host `imap.gmail.com`, port `993`.

=== "Outlook / Microsoft 365"

    Host `outlook.office365.com`, port `993`. Many tenants disable basic IMAP
    auth — if yours does, this won't work without an administrator enabling it.

=== "Fastmail / others"

    Any IMAP server works. Fastmail: `imap.fastmail.com:993` with an app
    password.

Press **Test mailbox** to verify before saving. Alfred reports the folder and how
many messages it holds.

## Syncing

**Inbox → Sync mailbox** fetches everything newer than your lookback window,
deduplicates on `Message-ID`, and — if triage is on — classifies each new
message into one of:

`application_confirmation` · `interview_invite` · `rejection` · `offer` ·
`recruiter_outreach` · `assessment` · `other`

Each classification carries a confidence. Job-board digests and newsletters are
marked not job-related and filed away.

## Matching

Alfred links an email to an application **only** when both hold:

1. the model's confidence is at least **0.75**, and
2. the detected company resolves to one already in your pipeline (matched
   loosely — case, punctuation and legal suffixes are ignored, so "Acme" matches
   "Acme Technologies, Inc.").

Everything else waits in **Needs review**, where you can link it, create a new
application from it, or ignore it.

!!! warning "Stage changes are always yours"
A triaged email can _suggest_ a stage — an interview invitation implies
screening or technical — but Alfred never applies it. Acting on a
misclassification would silently corrupt your funnel, so the suggestion is
shown and you decide.

## Cost

With triage on, each new email is one small AI call. If you sync a busy mailbox
with a 30-day lookback for the first time, that's one call per message. Turn
**Classify new mail with AI** off to fetch without classifying, or narrow the
lookback.

## Privacy

Message bodies are stored in your local database. They are sent to your
configured AI provider only when triage is enabled — so with a local
OpenAI-compatible endpoint, your mail never leaves the machine. Alfred strips
quoted replies, signatures and long tracking URLs before anything is sent.
