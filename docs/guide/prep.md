# Prep plans & questionnaires

Analysis tells you where you stand. These two turn it into work.

## Prep plans

**Build my prep plan** produces a set of actionables for that specific role,
deliberately composed rather than a uniform list:

| Kind              | What it is                                                                                                       |
| ----------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Coding**        | Real problems, chosen for the patterns this company's stack and domain make likely. Each names its DS&A pattern. |
| **Concept**       | Targeted at the gaps the analysis found — not your strengths.                                                    |
| **System design** | Framed as a prompt the interviewer might actually pose for _this_ product, not a textbook topic.                 |
| **Behavioral**    | The specific story to prepare, not "think of a time when".                                                       |
| **Research**      | The company, its product, its engineering writing.                                                               |

Every item carries a **rationale** explaining why it matters for this posting.
That's the part worth reading — it's what separates a prep plan from a generic
list, and it tells you what to drop when you're short on time.

<div class="al-video">
  <video controls muted playsinline loop preload="metadata" autoplay>
    <source src="../assets/clips/prep.webm" type="video/webm">
    <source src="../assets/clips/prep.mp4" type="video/mp4">
  </video>
</div>
<p class="al-caption">A generated prep plan — coding problems with their pattern, concepts targeting the gaps, and a system-design prompt.</p>

Items have a difficulty, an estimated duration, and a priority. The plan is sized
for one to two weeks, not a month.

### Working through it

Click the circle to cycle an item: **todo → in progress → done**. The card header
tracks completion and remaining hours.

**Regenerate** replaces untouched AI suggestions but keeps anything you've started,
finished or added yourself.

The **Prep** page collects actionables across every application, filtered by
kind, so you can work the queue rather than the board.

## Doing the work in Alfred

Coding, concept, system design and behavioural items are not checkboxes. Each
opens a workspace where you do the thing, and Alfred decides whether it is done.

**Solve it** opens a coding problem: a brief, worked examples, a Python editor and
a test suite.

- **Run samples** runs the visible cases. Fast, repeatable, and the normal way to
  work — the equivalent of running it locally.
- **Submit** runs every case, including the hidden ones, and is the only thing
  that can complete the item.

Hidden tests stay hidden, with one exception: if a hidden case fails, the first
one is reported in full. A suite that only says "hidden test 9 failed" sends you
guessing, and one that prints every expected value has no hidden tests at all.

**Answer it** opens a written prompt — a design question posed for the company
you applied to, a concept to explain, a story to tell — with a rubric behind it.
Submitting grades the answer against each requirement and tells you which ones
you met. The rubric is available before you start, folded away, because reading
it first turns the exercise into filling in a form.

Hints are there for all of them, revealed one at a time rather than all at once.

### Why you can't just click done

An item with an exercise behind it cannot be marked done. The API refuses it,
so pressing the button harder will not help. `done` is set when a submission
passes, and it records which one.

You can always **skip** an item. Declining a problem is honest; claiming you
solved it is not.

!!! note "Generated, and checked before you see it"
    The problems are written for your role rather than linked from a problem
    set — so they can carry a test suite, which is what makes checking your
    work possible.

    Before a coding exercise is offered, Alfred solves it itself and runs its
    own solution against its own tests. If that fails, it tries once more; if
    it still fails, you are told the tests are not trustworthy and that item
    can be completed by hand. You are never held to a check Alfred got wrong.

### Where your code runs

On the server, in a WebAssembly sandbox, in a separate short-lived process with
no filesystem or network access. Nothing the browser reports about whether you
passed is trusted — a verdict the page can assert would be worth nothing.

A submission that loops forever is killed, and you are told which case never
came back.

## Questionnaires

**Draft the questions** predicts the interview questions and drafts answers you
can rehearse. Each has:

- **The question**, as an interviewer would ask it.
- **What they're really asking** — the thing being assessed underneath.
- **Alfred's draft** — an answer in your voice, built from your stated
  background, STAR-structured for behavioural questions, under ~150 words
  because it's a rehearsal script rather than an essay.
- **Your version** — the box that matters. Rewriting the draft in your own words
  is what makes it stick.
- **A readiness rating**, so you can see what still needs work.

<div class="al-video">
  <video controls muted playsinline loop preload="metadata" autoplay>
    <source src="../assets/clips/questions.webm" type="video/webm">
    <source src="../assets/clips/questions.mp4" type="video/mp4">
  </video>
</div>
<p class="al-caption">A predicted question, what the interviewer is really assessing, and a drafted answer to rewrite in your own words.</p>

Questions are ordered by likelihood combined with how badly a weak answer would
hurt, and at least two always target the gaps from the analysis — those are the
ones that sink loops.

Regenerating keeps every question you've already answered.

## Ask Alfred

The application page has a chat with the posting and the analysis already in
context. Useful for the things that don't fit a prep item: what to ask at the
end, how to explain a gap, drafting a follow-up email, what to anchor on in a
compensation conversation.
