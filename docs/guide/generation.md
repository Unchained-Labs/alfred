# Automatic prep & the queue

Add an application with its job description and Alfred starts on it straight
away. By the time you open it, the prep is either there or on its way:

```
analysis ─┬─▶ prep plan ─┬─▶ handbook outline ─▶ each part ─┬─▶ cards & glossary
          │              │                                  └─▶ its scenes, notebook & problems
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

**Long runs.** A background generation that is still going after five minutes
asks whether to keep going: on the application, in the handbook panel, and at
the top of **AI queue**. It does not stop while it asks. **Keep going** gives it
another five minutes before it asks again; **Stop** kills it there and then.
Left unanswered, it carries on until it has run 30 minutes in all, and is then
stopped and marked failed, with a **Retry** that starts it again. A job that
hit that ceiling is not retried on its own: it would most likely do it again.
Things you are waiting on keep a five-minute ceiling, since a page is holding
the request open.

**Failures.** A hiccup — the CLI exiting, a reply that was not valid
JSON — is retried on its own, after 30 seconds, then a minute, then two, up to
three attempts. Anything a retry cannot fix fails at once with the reason: a
signed-out or misconfigured provider ("sign in again, then retry"), or a posting
that is missing. Fix the cause, then press **Retry failed** on the application,
or **Retry** (one) or **Retry all failed** in **AI queue**.

**Restarts.** The queue lives in the database. A deploy or crash mid-generation
puts the job back in the queue when Alfred starts again; the interrupted run
counts as an attempt, so a job that reliably crashes the process cannot loop.

**Stopping.** **Stop** cancels a job and anything waiting on it. A job that is
running is ended mid-call: the Claude Code process is killed, an API request
aborted.

## AI queue

**AI queue** in the sidebar is the queue as it runs, top to bottom in the order
you would act on it:

- **Taking longer than usual**: running jobs past their check-in, with **Keep
  going** and **Stop**.
- **Running now**: each with a live timer and a bar filling toward its check-in.
- **Up next**: in the order they will run, with why one is waiting (an earlier
  step, a retry backoff). **Cancel all** drops the lot.
- **By kind**: runs, success rate, how many needed a retry, typical and longest
  duration, per kind of generation. Click a kind to filter the history by it.
- **History**: every finished job of the last 30 days, filterable by status,
  kind, application and text, with the error for each failure.

The sidebar badge counts what is queued or running.
