# Fit analysis

**Analyze this role** on an application page produces a structured read of how
you line up against that posting.

<div class="al-video">
  <video controls muted playsinline loop preload="metadata" autoplay>
    <source src="../assets/clips/analysis.webm" type="video/webm">
    <source src="../assets/clips/analysis.mp4" type="video/mp4">
  </video>
</div>
<p class="al-caption">A real analysis: 84/100, skill-by-skill coverage, and the gaps worth closing.</p>

## The fit score

A single 0–100 number, calibrated against explicit bands rather than left to the
model's judgement:

| Range  | Meaning                                                         |
| ------ | --------------------------------------------------------------- |
| 85–100 | Would be shortlisted immediately; clears every hard requirement |
| 70–84  | Strong candidate with one or two soft gaps                      |
| 50–69  | Plausible, but the gaps need addressing to get past screening   |
| 25–49  | A stretch; needs a referral or a manager willing to train       |
| 0–24   | Not a credible match                                            |

The prompt tells the model to score like a hiring manager, not a cheerleader,
because an inflated score costs you interviews — you spend effort on the wrong
roles and skip preparation you needed.

## What else you get

**Skill coverage** — every significant skill the posting asks for, each marked
_have it_, _partial_ or _gap_, with a clause of evidence. These use the reserved
status colours and always carry a text label, so the state never depends on
colour alone.

**Lead with these** — three to five specific things to foreground in this
application.

**Close these gaps** — the honest weaknesses. These are what the prep plan
targets.

**Likely interview focus** — the topics this company's loop will probe.

**Compensation read** — a realistic band for this role, market and level,
compared against the posted range and your target.

**How to position yourself** — concrete résumé and cover-letter angle for this
specific role.

## Re-running

**Re-run** produces a fresh analysis and keeps the old one in the timeline, so
you can see how the read changed after you added the full job description or
updated your résumé.

## What drives quality

1. **Your résumé in Settings.** Analysis is a comparison; with nothing to compare
   against, Alfred says so rather than inventing a background for you.
2. **The job description.** Without it, Alfred reasons from the title and
   seniority and flags the uncertainty.
3. **The model.** A frontier model reasons about skill adjacency — that your
   Postgres partitioning work is evidence for a "data modelling at scale"
   requirement. A small local model tends to match keywords.

!!! note "Alfred will not invent experience"
The prompts forbid attributing experience you haven't stated. If the analysis
looks thin, the fix is a fuller résumé, not a different question.
