# Analytics

**Analytics** has two views, switched at the top right.

- **Outcomes** looks backwards: where applications end, how long each step
  takes, what the companies said.
- **Jobs** looks forwards: every job on your board ranked by what it pays, how
  well it fits, and both together. It works on a wishlist before anything is
  sent.

## Jobs

| Panel | What it shows |
| ----- | ------------- |
| **Headline** | Jobs in view, median pay, median fit, and the top pick. |
| **Pay against fit** | One point per job with both, coloured by stage, with the medians dashed. Top-right is well paid and a good match. Click a point to open the application. |
| **Best paid** | The ten best-paid jobs, each drawn as its salary range with the midpoint marked, so a wide range is visibly a gamble. |
| **Ranked** | Every job in a table you can sort by any column. Starred rows are the top three on the combined score. |
| **Breakdowns** | Count, median pay and median fit by stage, work mode, seniority and country. |

### How pay is compared

Postings use their own currency, so salaries are converted to one **display
currency** (USD by default, switchable in the filter bar) before anything is
ranked. Each job is compared by the **middle of its range**, or by whichever
end it states. Salaries are read as annual.

Rates come from [open.er-api.com](https://open.er-api.com), which is free,
needs no key and covers AED and NOK. They are fetched at most once a day and
cached. If the feed cannot be reached, Alfred uses the last rates it got, then a
built-in table of approximate rates, and the page says which one it used.

### The combined score

```
score = w × pay percentile + (1 − w) × fit
```

**Pay percentile** is where a job's pay sits among the jobs in view: 100 for the
best paid, 0 for the worst. It is a percentile rather than the amount so that a
large salary cannot drown out the fit score, which is already 0–100. The weight
`w` is the slider in the filter bar, 50/50 by default.

Percentiles are taken **within the current filter**, so narrowing to
*Interviewing* re-ranks those jobs against each other.

### Missing data

A job without a salary is **unranked by pay, not ranked as zero**. A job without
an analysis has no fit score. Either way it sorts last, the page counts how
many there are, and the combined score needs both. A pay or fit floor filters
out only jobs known to fall short, so it keeps the ones that don't state a
salary.

### Filters

Stage groups (*still in play*, *sent*, *interviewing*, *closed*) or individual
stages, work mode, seniority, source, posting currency, tags, priority, a date
range (applied date, or the date added if not yet sent), archived jobs, and
minimum fit and pay. Every filter, the sort order, the display currency and the
weight are kept in the URL, so a view can be bookmarked or shared.
