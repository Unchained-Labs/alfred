# Tracking applications

## The pipeline

Alfred models an application as moving through nine stages:

| Stage                           | Meaning                                |
| ------------------------------- | -------------------------------------- |
| Wishlist                        | A role you want but haven't applied to |
| Applied                         | Submitted, waiting to hear back        |
| Screening                       | Recruiter call or take-home            |
| Technical                       | Coding and system design rounds        |
| Onsite                          | The final loop                         |
| Offer                           | Negotiating                            |
| Accepted / Rejected / Withdrawn | Closed out                             |

The board shows the six live stages; closed applications move to the list view.
Drag a card to move it, or use the stage picker on the application page.

**Alfred backfills the application date.** The first time a card reaches a stage
that implies you actually applied, `appliedAt` is set to that moment if it wasn't
already — so the funnel and the "applications sent" chart stay honest even if you
added the role late.

## Adding an application

=== "Paste a posting"

    **Add application → Paste a posting**, drop in the whole thing, and press
    **Extract fields**. Alfred pulls out the company, title, location, work mode,
    seniority, salary range and a cleaned-up description — dropping the EEO
    boilerplate, benefits lists and "about us" marketing.

    Anything the posting doesn't state is left empty rather than guessed.

=== "By hand"

    **Add application → Details**. Only company and title are required.

The **job description matters more than any other field**. Without it, analysis
and prep fall back to reasoning from the title alone, and Alfred will say so.

## The timeline

Every application has a timeline recording what happened and when:

- stage changes, with the transition
- notes you add
- emails linked from the inbox
- every AI run — the fit score, the prep plan, the questionnaire

This is what makes the funnel meaningful. A conversion funnel built from current
stage alone would under-count everything that was later rejected; Alfred reads
the stage-change history instead, so an application that reached onsite and was
then turned down still counts toward onsite.

## Follow-ups

Set a **next action** date and label on an application and it appears in **Needs
a nudge** on the dashboard once the date has passed, and as a red deadline on the
card.

## Views

- **Board** — drag and drop, grouped by stage.
- **List** — a sortable table with fit score, compensation, applied date and next
  action. This is also the accessible view: everything a colour conveys on the
  board is present as text here.

Press ++cmd+k++ (or ++ctrl+k++) anywhere to jump to an application by name.
