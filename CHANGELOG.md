# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed

- **Rebranded from amber to slate blue.** The old ochre failed four of six WCAG contrast checks — worst was dark-mode header text at 1.96:1, which is effectively unreadable. The replacement clears 4.5:1 on every surface in both modes. Chart colours are untouched: those are validated encodings, not branding.

### Added

- **Import your CV from a PDF.** Drop a PDF on Settings → You and Alfred extracts the text layer, has your configured provider structure it, and shows you what it found before filling anything in — nothing is saved until you press Save. Scanned CVs are detected and reported rather than silently producing an empty profile; there is no OCR.

- **A demo.** A 58-second walkthrough recorded against the running app — the board with a real drag, a fit analysis, a generated prep plan, the interview questionnaire and the provider options. It plays on the documentation home page, and each guide page carries the clip for its own section. The README leads with a short looping GIF of the strongest beats.
- The README is now a lean landing page; the detail it used to duplicate lives on the documentation site.

- Project scaffolding: CI across Node 20/22/24, a documentation site on GitHub Pages, issue and PR templates, Dependabot, `SECURITY.md`, `CONTRIBUTING.md`, a Code of Conduct, and a `Makefile` wrapping the common tasks.
- ESLint (flat config) and Prettier, wired into CI.

### Fixed

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
