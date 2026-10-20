# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed

- **Rebranded again, to oxblood on parchment.** Slate blue was correct and dull — and it was dull for a structural reason worth writing down: blue is the pipeline stage ramp, a validated ordinal encoding, so the brand had to retreat to a near-neutral navy to avoid impersonating the board. Moving the brand to a hue the data does not own frees it to have character. Deep claret on a warm paper ground, measured at OKLab dE 18.2 from the nearest chip it can sit beside.

  The brand is now **asymmetric between modes, on purpose**. On dark the stage ramp inverts so progress reads as brightness, which parks a near-white blue at the top and squeezes the whole light warm band; every mid claret measured between dE 5.8 and 12.5 of `series-8`, `serious` or `critical`, and a button that reads as an error badge is worse than a dull button. So on dark the claret moves from figure to ground — surfaces carry a red cast and washes tint the active states, while marks use warm parchment. Series, stage and status values are byte-identical and were re-validated against the warmer surfaces.

- **Real typefaces, self-hosted.** Barlow Condensed for headings, Atkinson Hyperlegible for body, IBM Plex Mono for labels and figures. 179 KB of woff2 committed rather than linked, because the container may run on a site with no internet and a webfont that 404s falls back mid-layout. All three are OFL; the licences ship beside them.

- **Rebranded from amber to slate blue.** The old ochre failed four of six WCAG contrast checks — worst was dark-mode header text at 1.96:1, which is effectively unreadable. The replacement clears 4.5:1 on every surface in both modes. Chart colours are untouched: those are validated encodings, not branding.

### Added

- **Alfred finds jobs now.** A **search** is a standing query — a job title, optionally a place — that gets re-run on a schedule, with anything new waiting on **Jobs → Discover** until you track or dismiss it. Tracking one turns it into an application at wishlist stage, ready for a fit analysis and a prep plan.

  Three sources, all keyless. **Watched boards** read an employer's own applicant tracking system (Greenhouse or Ashby) — the primary record rather than an aggregator's copy, and the high-signal option. **Remotive** and **Arbeitnow** are free feeds for remote and European roles; Remotive's free endpoint turns out to return a rotating sample of about seventeen postings and to ignore its own `search` parameter, so it is a bonus rather than coverage, and the docs say so.

  Adding a board checks it answers and has open roles _before_ saving, because a mistyped identifier otherwise fails silently — the board never contributes anything and nothing explains why. A board that later stops answering is marked failing, with the reason.

  The **daily scan** is a timer in the server process rather than an external cron, so there is nothing extra to install: it checks every fifteen minutes for a search that has gone twenty hours without running. Twenty rather than twenty-four so a daily rhythm does not drift later each day. Off in development, where a restart would refetch every board; `POST /api/discovery/run` is the same code path for anyone who prefers their own cron.

  Matching is deliberate. Commas are alternatives and every word within one must appear, so "backend engineer" cannot match "Engineer, Facilities". An **unknown never disqualifies**: a posting with no stated location still answers a located search, and one with no stated salary still answers a salary floor, because hiding a job you wanted is a worse failure than showing one you did not. A posting is added once even when two sources carry it.

- **The dashboard shows your jobs.** It opened with numbers, a funnel and a prep queue, but never the applications themselves — which is the first thing you actually want to see. **In play** now lists your live applications furthest-along first, each with its fit score, how much prep is left and whether anything is scheduled, and links through to the full Jobs table.

- **Going quiet.** The application nobody scheduled anything for is the one that gets lost, and "Needs a nudge" could never surface it because it needs a date to already exist. The dashboard now flags applications with _nothing scheduled_ where nothing has happened for over ten days, each with a one-click **Chase in 3d** that sets the follow-up.

  "Nothing has happened" is read from the **timeline**, not from `updatedAt`: a stage change, an email or an interview counts, while a note you wrote or a prep item you ticked does not. Measuring it from the row's own modification time would mean jotting down how worried you are about the silence reset the silence clock. It also covers **technical** and **onsite**, not just applications that never replied — silence after an onsite costs the most and is the one people are most reluctant to chase.

- **Handbooks now teach the prep plan, and draw it.** Three changes, in response to the handbook reading more like a reading list than a textbook.

  Alfred allocates **every prep item to exactly one part**, and that part is responsible for teaching the substance behind it — the pattern behind a coding problem and how to recognise it, the concept itself, how to work through a design prompt, what a strong story contains. The part prompt now receives each item's detail and the reason it was assigned, because a title alone produces a pointer rather than an explanation.

  "Read up on X", "familiarise yourself with Y" and "research their blog" are now explicitly banned: if X is worth knowing, the part explains X. Interview tips are capped at one per part and never stand in for explaining the thing. Parts run 400–900 words instead of 300–700.

  And **diagrams**, described as data and drawn by Alfred: a `flow` of stages with dots travelling along it and a dashed arc for the feedback path people forget, a clickable `stack` of layers, and a `cycle` for a loop that closes on itself. A model cannot emit SVG here and must not be able to — it describes nodes, edges and a kind, and the geometry is computed in one place, so every diagram animates consistently and all of them stop under `prefers-reduced-motion`. Out-of-range edge indices are dropped rather than trusted into a path.

  Measured on a real posting with a six-item prep plan: all six items covered exactly once, 7,260 words across 7 parts (up from 5,900), 8 diagrams, and no "go and read X" phrasing anywhere.

- **A Jobs tab.** Every job in one sortable table — open, closed and archived — searchable across company, role, location, seniority, source, contact and tags, and filterable by stage. The board answers "what do I do next" and hides what is closed; this answers "what have I got". Each row carries its latest fit score and how much of its prep is done.

- **Learning handbooks.** One button on an application produces a self-contained HTML study guide for that role: five to eight taught parts, each opening with a three-line TL;DR, plus flashcards, a filterable glossary, a story bank, questions to ask and a checklist. It opens in its own tab and downloads as one file that works offline, keeping your progress, the cards you know and your drafted stories in whichever browser you opened it in.

  Alfred stores the **content**, never the rendered page, so the template can improve without anyone regenerating anything.

  It is built a part at a time — the spine, then each part in its own pass, then the practice material. The first version asked for the whole plan in one response and it truncated: the Claude Code CLI has no flag to raise its output budget and says nothing when it clips. Providers cap output in different places, so the fix was not a bigger number but never asking for more than a page at a time. Progress is therefore real rather than a spinner, and a failure halfway costs one part instead of the document.

  Everything generated is escaped on the way into the page — there is no raw-HTML path, and a new offline CI check renders a fixture containing a script tag and a `javascript:` URL to keep it that way.

- **Prep items you actually do, in the app.** Coding, concept, system-design and behavioural items now open a workspace instead of a checkbox. Coding items come with a brief, worked examples, a Python editor and a test suite: **Run samples** iterates against the visible cases, **Submit** runs every case including the hidden ones. Written items come with a rubric and are graded against it, requirement by requirement. Hints reveal one at a time.

  An item backed by an exercise **cannot be marked done** — the API refuses it, and `done` is set only by a submission that passed. Skipping is still available, because declining a problem is honest and claiming you solved it is not.

  Code runs on the server in a WebAssembly sandbox, in a separate short-lived process with no filesystem or network access, killed if it does not finish. Nothing the browser says about passing is trusted. Exercises are verified before you see them: Alfred solves its own problem against its own tests, retries once if that fails, and if it still fails tells you the tests are untrustworthy and lets you complete the item by hand rather than holding you to a broken check.

- **Accounts.** Several people can share one Alfred, each with their own pipeline, résumé, prep plans, provider keys and mailbox — nobody sees anyone else's. First run creates an owner; everyone else joins by one-time invitation, as there is no public sign-up. Sessions are server-side with only the token's digest stored, and passwords use scrypt with per-hash parameters.
- **The Claude Code provider now works in the container** via an opt-in compose override that mounts the host CLI and sign-in. It is a separate file, not a default, because it shares real credentials with the container.

- **Import your CV from a PDF.** Drop a PDF on Settings → You and Alfred extracts the text layer, has your configured provider structure it, and shows you what it found before filling anything in — nothing is saved until you press Save. Scanned CVs are detected and reported rather than silently producing an empty profile; there is no OCR.

- **A demo.** A 58-second walkthrough recorded against the running app — the board with a real drag, a fit analysis, a generated prep plan, the interview questionnaire and the provider options. It plays on the documentation home page, and each guide page carries the clip for its own section. The README leads with a short looping GIF of the strongest beats.
- The README is now a lean landing page; the detail it used to duplicate lives on the documentation site.

- Project scaffolding: CI across Node 20/22/24, a documentation site on GitHub Pages, issue and PR templates, Dependabot, `SECURITY.md`, `CONTRIBUTING.md`, a Code of Conduct, and a `Makefile` wrapping the common tasks.
- ESLint (flat config) and Prettier, wired into CI.

### Fixed

- The dashboard's hero figure was still set in the body face at 48px — it predated the rebrand and never moved onto the display face with the other figures.

- The command palette did not know about the Jobs page.

- **The Prep page overflowed the viewport.** It is laid out as a fixed-height column whose list is supposed to scroll inside itself, but `PrepBoard`'s root element between the two was a block, not a flex container — so the `flex-1 min-h-0` on the list had no flex parent to resolve against, the list grew to its content, and the page grew with it. The chain has to be flex the whole way down or none of it works. The list also has a height floor now, so a wrapped filter row on a short screen scrolls the page rather than crushing the rows to nothing.

- The phone's bottom navigation had no overflow guarantee, and a seventh item would not have fitted: seven equal columns leave about 50px each, which is less than "Dashboard" needs in the body face. The bar now uses short labels and every item truncates, so no label can widen the viewport.

- Static files under `public/` do not bypass the auth proxy — only `_next/*` does — so a signed-out request for a font was answered with a redirect to `/login`. The login page was therefore the one page in the app guaranteed to render in a fallback face, which reads as a styling choice rather than a bug. Found by checking the status code of every font file rather than by looking at the page.

- `mail_messages` was unique on `message_id` alone, so two accounts could never hold the same email. Uniqueness is now per account.

- The documentation site's feature cards rendered with their text spilling outside the card borders. Prettier had collapsed the four-space list indentation that Material for MkDocs needs, so the continuation paragraphs were never nested inside the list item. `docs/` is now excluded from Prettier, which does not understand Material's markdown extensions.
- The docs home page still advertised three AI providers and omitted Local Claude Code.

- The dashboard claimed "Alfred isn't connected yet" whenever Local Claude Code was the selected provider: the readiness check only knew about the other three. The check moved to `providerIsConfigured` in `settings.ts`, where an exhaustive switch makes omitting a new provider a type error rather than a silent wrong answer.

- Time-dependent styling ("overdue" badges) was computed with `Date.now()` during render, so the server and the browser could disagree about whether a deadline had passed. It now resolves after mount through `useNow()` and refreshes every minute.
- Derived state (board cards, the stage picker, the application form, the command palette) was synchronised in effects, which painted one stale frame after a server refresh. It is now adjusted during render.

## [0.1.0] - 2026-10-03

The first cut.

### Added

- Nine-stage application pipeline with a drag-and-drop board, a table view, and a timeline recording every move, note and email.
- AI fit analysis: a calibrated score, skill-by-skill coverage, strengths, gaps, likely interview focus, a compensation read, and a positioning angle.
- Prep plans per application — coding problems with their DS&A pattern, concepts targeting the gaps, system design prompts, behavioural stories and company research — each with a rationale tying it to that posting.
- Interview questionnaires: likely questions, what the interviewer is really probing, a drafted answer in the candidate's voice, and a readiness rating.
- A pluggable AI layer with three interchangeable providers: Claude via the Anthropic SDK, any OpenAI-compatible endpoint, and a custom HTTP agent.
- Paste a job posting and have its fields extracted into the form.
- Ask Alfred: a streamed chat with the posting and analysis in context.
- Optional read-only IMAP sync that classifies recruiter mail and matches it to the pipeline, auto-linking only at high confidence.
- Dashboard with a conversion funnel, activity chart, prep queue and overdue follow-ups.
- Command palette (⌘K), light and dark themes, and a responsive layout down to phone width.
