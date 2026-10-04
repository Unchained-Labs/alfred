# Alfred

Your job-hunt butler. Alfred tracks every application you have in flight and
turns each one into concrete work: a calibrated fit score, a prep plan of real
coding problems and concepts, and a questionnaire of the interview questions
that role is actually going to ask.

It runs locally against SQLite. Nothing leaves your machine except the calls you
configure to an AI provider and, optionally, a read-only IMAP connection.

## See it working

<div class="al-video">
  <video controls muted playsinline loop preload="metadata" poster="assets/poster.jpg">
    <source src="assets/alfred-demo.webm" type="video/webm">
    <source src="assets/alfred-demo.mp4" type="video/mp4">
  </video>
</div>
<p class="al-caption">The full walkthrough — tracking, fit analysis, a generated prep plan, the interview questionnaire, and the provider options.</p>

<div class="grid cards" markdown>

- :material-view-column: **Track**

    A nine-stage drag-and-drop pipeline, with a timeline recording every move,
    note and email. Add applications by hand, or paste a posting and let Alfred
    extract the fields.

    [Tracking applications →](guide/tracking.md)

- :material-target: **Analyze**

    A fit score calibrated like a hiring manager rather than a cheerleader, with
    skill-by-skill coverage, the gaps worth closing, and a positioning angle for
    your résumé.

    [Fit analysis →](guide/analysis.md)

- :material-code-braces: **Prepare**

    A prep plan built for _that_ role, plus a questionnaire with draft answers
    grounded in your real background.

    [Prep plans →](guide/prep.md)

- :material-email-outline: **Ingest**

    Connect an IMAP mailbox and Alfred pulls in recruiter mail, classifies it,
    and matches it to your pipeline.

    [Mailbox →](guide/mailbox.md)

</div>

## Bring your own AI

Alfred talks to four kinds of provider through one interface, so switching is a
dropdown and nothing else changes.

| Provider | What it is |
| --- | --- |
| **Claude** | The Anthropic API, with structured outputs and adaptive thinking |
| **Local Claude Code** | The `claude` CLI already on your machine — no API key, it uses your existing sign-in |
| **LLM endpoint** | Any OpenAI-compatible server — Ollama, vLLM, LM Studio, OpenRouter |
| **Custom agent** | Your own agent over HTTP, given a documented task envelope |

A local endpoint keeps your résumé, the job descriptions and your mail entirely
on your machine.

[Compare the providers →](reference/ai-providers.md)

## Get started

```sh
git clone https://github.com/Unchained-Labs/alfred.git
cd alfred && npm install && npm run dev
```

The database is created and migrated on first render — there is no setup step.

[Install →](getting-started/install.md) · [Quick start →](getting-started/quickstart.md)
