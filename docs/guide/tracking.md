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

<div class="al-video">
  <video controls muted playsinline loop preload="metadata" autoplay>
    <source src="../assets/clips/board.webm" type="video/webm">
    <source src="../assets/clips/board.mp4" type="video/mp4">
  </video>
</div>
<p class="al-caption">Dragging an application from <strong>Applied</strong> into <strong>Screening</strong>. The move is logged on the timeline.</p>

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

### When you never set one

The application nobody scheduled anything for is the one that gets lost, and
"Needs a nudge" cannot help with it — it needs a date to already exist.

So the dashboard also has **Going quiet**: applications with *nothing scheduled*
where nothing has actually happened for over ten days. Each row carries a
**Chase in 3d** button that sets the follow-up in one click, because the point
is to make the fix cheaper than the guilt.

"Nothing has happened" is read from the timeline, not from when the row was last
edited — a stage change, an email or an interview counts; a note you wrote or a
prep item you ticked does not. Otherwise jotting down how worried you are about
the silence would reset the silence clock.

It includes applications at **technical** and **onsite**, not only ones that
never replied. Silence after an onsite is the case that costs the most and the
one people are most reluctant to chase. Wishlist items are excluded: nothing has
been sent, so there is nobody to chase.

## Views

- **Board** — drag and drop, grouped by stage.
- **List** — a sortable table with fit score, compensation, applied date and next
  action. This is also the accessible view: everything a colour conveys on the
  board is present as text here.
- **Jobs** — every job you have tracked, open and closed, archived included,
  searchable and sortable on any column. The board answers "what do I do next"
  and hides what is closed; Jobs answers "what have I got".

The **dashboard** opens with **In play**: your live applications, furthest along
first, each showing how well it fits, how much prep is left and whether anything
is scheduled.

Press ++cmd+k++ (or ++ctrl+k++) anywhere to jump to an application by name.
