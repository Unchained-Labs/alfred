# Learning handbooks

A prep plan tells you what to do. A handbook teaches you the thing.

**Build the handbook** on an application page produces a single, self-contained
HTML study guide for that role: what the company actually does, the substance
the interview will test, that employer's hard problems, and what to say — plus
flashcards, a glossary, a story bank and a checklist.

It opens in its own tab, because it is a whole document rather than a panel, and
**Download** gives you the same bytes as a file.

## What is in one

| Section | What it is |
| ------- | ---------- |
| **Reading routes** | Two to four paths through it — ten minutes, an evening, everything — so there is somewhere to go when you are short on time. |
| **Parts** | Five to eight taught sections, each opening with a three-line TL;DR. Tables, worked examples and code where code is the clearest explanation. |
| **Scenes** | Animated explainers, like the visuals in a good explainer video: a two-pointer sweep, a BFS spreading through a graph, a request travelling client → cache → database, gradient descent rolling down a loss curve. Each plays step by step with a line of narration, and you can pause, step and scrub. |
| **Notebook** | Python you can edit and run in the page, like a Jupyter notebook. Cells in a part share variables, top to bottom. |
| **Practice problems** | LeetCode-style: a statement, starter code, tests (some hidden), hints that give away a little more each time, and a worked solution behind a reveal. Solved problems are marked. |
| **Diagrams** | Animated where a topic has a shape — a path a request takes, layers of a system, a retry loop that closes on itself. Layer diagrams are clickable. |
| **Callouts** | *Say it like this* for phrasing you can adapt out loud, *Trap* for the mistakes people make, *Why it matters here* for the link back to this employer. |
| **Practice cards** | Twenty to thirty recall cards, grouped by topic, with the points a strong answer hits. Mark them off as they stick. |
| **Glossary** | Every acronym the loop could use, filterable — including the ones that mean two different things. |
| **Story bank** | Prompts only. Alfred will not invent your experience; you write the answers and they save in the browser. |
| **Questions to ask** | Grouped by who you are talking to. |
| **Checklist** | The day before, the day itself, afterwards. |

## It teaches the prep plan

The handbook and the prep plan are not two lists of the same thing. The prep
plan is the to-do list; **the handbook is where the knowledge lives**.

When Alfred plans the handbook it allocates every prep item to exactly one
part, and that part is then responsible for teaching the substance behind it —
the pattern behind a coding problem and how to recognise it, the concept
itself, how to work through a design prompt, what a strong version of a story
contains. A part that said "revise consistent hashing" would have failed; the
part is where consistent hashing gets explained.

So you should be able to close the handbook and answer on the topic from what
you just read, rather than being sent somewhere else to learn it.

## Watch it, run it, solve it

A handbook is meant to work like hybrid university notes: each part's prose
explains the idea, its **scenes** show it moving, its **notebook** lets you poke
it, and its **problems** make you do it under interview conditions.

**Scenes** are drawn by Alfred from data the model writes — the array, the
graph, the services, and what changes at each step. There are primitives for
arrays and pointers (two pointers, sliding windows, binary search), stacks,
queues, linked lists, heaps, hash maps, trees, graphs (BFS, DFS, Dijkstra),
tables filling in (dynamic programming), request flows between services,
state machines, curves (loss, distributions, growth rates) and bar charts.
Press **Play**, or step with ◀ ▶ and the arrow keys. Without JavaScript, or on
paper, a scene is its numbered narration.

**Python runs in your browser** with [Pyodide](https://pyodide.org). It is only
downloaded — about 10 MB, from its official CDN — the first time you press
**Run**, and runs in a background worker: a loop that never ends is stopped
after 15 seconds instead of freezing the page. Standard library only. Run a cell
with **Ctrl/⌘ + Enter**. Offline, running code is the one thing that does not
work, and the cell says so.

**Problems** run your function against every test, including the hidden ones,
and show which pass. Arguments and expected values are parsed as Python
literals, never run as code. Your attempts are saved in the browser.

### Progress

Finishing a part, watching a scene to the end, running a cell, solving a problem
and knowing a card each earn points once — a level every hundred, and a study
streak. It is a nudge, not a game: there is nothing to farm, and it all lives in
the browser like the rest of your progress.

### Ask Alfred about any passage

On the live page — not a downloaded copy — an **Ask Alfred** button follows you
down the page. Select any passage and an **Ask about this** button appears next
to it. Ask anything: explain it more simply, give an example, quiz me. Ask for
a **diagram or graph** and the answer comes with an animated scene drawn the same
way as the handbook's own.

Each question is one call to your AI provider, through the queue's interactive
lane, and limited to fifteen every ten minutes.

## Older handbooks

Handbooks written before scenes existed still open and read as before. Their
panel says something is missing, and **Finish it** adds scenes, a notebook and
problems to each part without touching the text. **Settings → Generation →
Handbooks** does the same for every handbook at once (**Add scenes and labs**),
or rewrites every one from scratch with them in mind (**Rewrite all**).

## Reading it

The top bar carries the tools:

- **TL;DR only** collapses every part to its three lines — the whole handbook in
  about ten minutes.
- **Focus** shows one part at a time, with Next and Previous.
- A **25-minute timer**, because one part per sprint is a good pace.
- **Light and dark**, and **Print**, which lays it out for paper or PDF with the
  card answers shown and the animations stilled.

Diagrams animate by default and stop entirely if your system asks for reduced
motion.

Ticking **I've got this** fills the progress bar at the top. Progress, the cards
you know, your checklist and your drafted stories all save in whichever browser
you opened it in — they never leave the machine, and a downloaded copy keeps
them too.

!!! note "Built a part at a time"
    Alfred writes the spine first, then each part in its own pass, then the
    practice material, then each part's scenes, notebook and problems. That is not for show: providers cap how much they will
    write in one answer, and some of them say nothing when they clip it. Asking
    for a page at a time means no answer is ever long enough to be truncated,
    progress is real rather than a spinner, and a failure halfway costs one part
    instead of the document.

    It takes a few minutes. It is the longest thing Alfred writes.

## What to trust

A handbook is written by a language model from the job posting and your profile.
It is revision notes, not a reference:

- Where it is reasoning from the posting rather than from knowledge, the text
  says so — "the posting implies", "worth confirming".
- **Sources are generated links.** Open them before you rely on any of them.
- Nothing in it should be asserted out loud in an interview without you being
  able to defend it.

Rebuilding replaces the handbook completely, including your ticks and stories —
the reader's saved progress is keyed to the handbook, and a new one starts clean
rather than inheriting marks that belonged to different parts.
