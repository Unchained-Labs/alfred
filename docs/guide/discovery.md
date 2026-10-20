# Finding jobs

Everything else in Alfred starts once you have a job to track. This is the part
that finds them.

A **search** is a standing query — a job title, optionally a place — that Alfred
re-runs on a schedule. Anything new it turns up waits on **Jobs → Discover**
until you track it or dismiss it.

## Where it looks

| Source | What it is | Notes |
| ------ | ---------- | ----- |
| **Watched boards** | An employer's own listings, read straight from their applicant tracking system — Greenhouse or Ashby. | The primary record rather than an aggregator's copy: exact titles, exact locations, and it appears here the moment the employer publishes it. Needs no key. |
| **Remotive** | A free feed of remote roles. | Small. The free endpoint returns a rotating sample of roughly seventeen postings and its own `search` parameter does not meaningfully filter, so Alfred filters locally. Treat it as a bonus, not a source of coverage. |
| **Arbeitnow** | A free feed weighted towards Germany and the rest of Europe. | No server-side search, so Alfred fetches the board and filters locally. |

Watching a board is the high-signal option. The companies already in your
pipeline are the obvious place to start.

### Adding a board

Give Alfred the identifier from the board's own URL — the `monzo` in
`job-boards.greenhouse.io/monzo`. It checks the board answers and has open roles
*before* saving it, because a mistyped identifier otherwise fails silently: the
board simply never contributes anything and nothing explains why.

If a board later stops answering, it is marked **failing** with the reason
rather than quietly finding nothing.

## Writing a search

**Job titles** take commas as alternatives, and every word within an
alternative must appear:

```
backend engineer, platform engineer
```

means *(backend AND engineer)* OR *(platform AND engineer)*. Matching on any
single word instead would make "backend engineer" match "Engineer, Facilities".

**Location** is matched as a substring, so `London` finds
"Cardiff, London or Remote (UK)".

**Remote only** ignores the location filter entirely — remoteness and place are
different axes, and asking for both at once rejects every genuinely
location-free posting.

!!! note "An unknown never disqualifies"
    A posting with no stated location still matches a located search, and a
    posting with no stated salary still matches a salary floor. Showing you a
    job you did not want is a smaller failure than hiding one you did, because
    you never find out about the second kind.

## The daily scan

Alfred checks every fifteen minutes whether any search has gone twenty hours
without running, and scans the ones that have. Twenty rather than twenty-four
so a daily rhythm does not drift later each day.

- **Scan now** runs everything immediately, and reports what each source
  returned — including which ones failed.
- The scan is off in development, where a restart would otherwise refetch every
  board. Set `ALFRED_DISCOVERY_SCHEDULE=1` to enable it locally, or `=0` to
  disable it in production.
- `POST /api/discovery/run` is the same code path, for anyone who would rather
  drive it from an external cron.

A posting is only ever added once, even if two sources carry it: postings are
keyed on their source's own id, and a second, looser key on company and title
catches the same job arriving from two directions.

## Acting on a hit

**Track** turns the posting into an application at wishlist stage, carrying the
company, title, location and link across, ready for a fit analysis and a prep
plan. The discovered posting is kept and linked rather than consumed — it
records where the job came from, and deleting it would let the next scan find
the same posting all over again.

**Dismiss** takes it off the list and stops it coming back.
