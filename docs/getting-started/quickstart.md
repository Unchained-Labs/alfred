# Quick start

Three things to set up, in **Settings**.

## 1. Tell Alfred about you

Open **Settings → You** and paste your résumé.

This is the single biggest driver of output quality. Every judgement Alfred makes
about a role is measured against this text, so the more concrete it is — real
projects, real numbers, the actual stack — the more specific the analysis. A
one-line summary produces one-line advice.

Fill in your target roles, locations and compensation target too; they feed the
salary read and the positioning angle.

## 2. Connect a provider

Open **Settings → AI layer**, pick a provider and press **Test connection**.

=== "Claude"

    Paste an API key from the [Anthropic Console](https://console.anthropic.com),
    or set `ANTHROPIC_API_KEY` in the environment and leave the field blank.

=== "LLM endpoint"

    Any OpenAI-compatible server. For Ollama:

    ```
    Base URL   http://localhost:11434
    Model      qwen2.5:14b
    ```

    Everything stays on your machine.

=== "Custom agent"

    Point Alfred at your own HTTP agent. See the
    [agent API](../reference/agent-api.md).

[More on providers →](../reference/ai-providers.md)

## 3. Add an application

Press **Add application**, paste a job posting, and hit **Extract fields**.
Alfred pulls out the company, title, location, seniority, salary and a cleaned-up
description. Check them and save.

On the application page:

1. **Analyze this role** — a fit score, skill coverage, your gaps, and how to
   position yourself.
2. **Build my prep plan** — coding problems, concepts, system design prompts and
   behavioural stories, each with a rationale tying it to this posting.
3. **Draft the questions** — the interview questions this loop will likely ask,
   with answers written in your voice for you to rewrite.

Then drag the card across the board as the process moves. Every move is logged
on the timeline.

## Optional: your mailbox

**Settings → Mailbox** connects a read-only IMAP account so recruiter mail lands
in Alfred's inbox, classified and matched to your pipeline.
[Mailbox →](../guide/mailbox.md)
