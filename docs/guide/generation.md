# Automatic prep & the queue

Add an application with its job description and Alfred starts on it straight
away. By the time you open it, the prep is either there or on its way:

```
analysis ─┬─▶ prep plan ─┬─▶ handbook outline ─▶ each part ─▶ cards & glossary
          │              └─▶ exercises for the top prep items
          └─▶ interview questions
```

Each step waits for the one it reads: the prep plan is aimed at the gaps the
analysis found, the handbook teaches the prep plan, and exercises are written
per prep item. A strip at the top of the application says where it is —
_Analysis ✓ · Prep plan running · Handbook queued 2/8_ — and it carries on if
you close the tab.

## When it starts

- **Adding an application** with its posting text, by hand or with **Paste a
  posting**.
- **Tracking a discovered job** — but a board's listing usually carries a
  two-line snippet, not the posting. Alfred waits for the real description
  rather than writing a handbook from a teaser; paste it into the application
  and generation starts then.
- **Creating an application from an email.** Emails carry no posting either, so
  the timeline says _Prep is waiting for the job description_ until you add it.

When the posting arrives later, only what is missing is generated. A prep plan
you have already started is never replaced behind your back.

## Choosing what runs

**Settings → Generation** has a switch for the whole thing and one per step,
the number of exercises to write automatically (6 by default, highest-priority
prep items first — each coding exercise is two AI calls and a test run), and
the size of the questionnaire. With automatic generation off, nothing runs until
you press a button on the application, as before.

## The queue

Every AI call goes through one queue, so a machine running Alfred never has more
generations in flight than you allow:

| Lane | What runs there | At once |
| ---- | --------------- | ------- |
| Background | Everything above, and any Regenerate you press | `ALFRED_AI_CONCURRENCY`, default 1 |
| Interactive | Things you are waiting on: reading a posting, reading a CV, grading an answer, triaging mail | `ALFRED_AI_INTERACTIVE_CONCURRENCY`, default 1 |

The lanes do not share slots, so grading an answer never waits behind a
twelve-step handbook.

**Failures.** A hiccup — the CLI exiting, a timeout, a reply that was not valid
JSON — is retried on its own, after 30 seconds, then a minute, then two, up to
three attempts. Anything a retry cannot fix fails at once with the reason: a
signed-out or misconfigured provider ("sign in again, then retry"), or a posting
that is missing. Fix the cause, then press **Retry failed** on the application
or **Retry** in Settings → Generation.

**Restarts.** The queue lives in the database. A deploy or crash mid-generation
puts the job back in the queue when Alfred starts again; the interrupted run
counts as an attempt, so a job that reliably crashes the process cannot loop.

**Stopping.** **Stop** on the application cancels what is pending there, and
anything waiting on it. A generation already running finishes its call, but its
result is discarded.

Finished jobs are kept for 30 days in **Settings → Generation → Generation
queue**, with how long each took and why any failed.
