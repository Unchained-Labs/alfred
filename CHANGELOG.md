# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed

- **Rebranded again, to oxblood on parchment.** Slate blue was correct and dull — and it was dull for a structural reason worth writing down: blue is the pipeline stage ramp, a validated ordinal encoding, so the brand had to retreat to a near-neutral navy to avoid impersonating the board. Moving the brand to a hue the data does not own frees it to have character. Deep claret on a warm paper ground, measured at OKLab dE 18.2 from the nearest chip it can sit beside.

  The brand is now **asymmetric between modes, on purpose**. On dark the stage ramp inverts so progress reads as brightness, which parks a near-white blue at the top and squeezes the whole light warm band; every mid claret measured between dE 5.8 and 12.5 of `series-8`, `serious` or `critical`, and a button that reads as an error badge is worse than a dull button. So on dark the claret moves from figure to ground — surfaces carry a red cast and washes tint the active states, while marks use warm parchment. Series, stage and status values are byte-identical and were re-validated against the warmer surfaces.

- **Real typefaces, self-hosted.** Barlow Condensed for headings, Atkinson Hyperlegible for body, IBM Plex Mono for labels and figures. 179 KB of woff2 committed rather than linked, because the container may run on a site with no internet and a webfont that 404s falls back mid-layout. All three are OFL; the licences ship beside them.

- **Rebranded from amber to slate blue.** The old ochre failed four of six WCAG contrast checks — worst was dark-mode header text at 1.96:1, which is effectively unreadable. The replacement clears 4.5:1 on every surface in both modes. Chart colours are untouched: those are validated encodings, not branding.

### Added

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
