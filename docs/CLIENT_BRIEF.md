# Client Brief: Company A, Kochi tour operator (Problem 2)

> Reference for future slices. Facts in this file are copied from the brief as relayed to the Builder by the project owner. Nothing here is inferred. Assumptions the build makes are in `docs/PROJECT_BRIEF.md` (table A1–A12) and are never recorded in this file.

## Transcription status

| Brief section | Status in this file |
|---|---|
| Sample package table | **Transcribed** (below) |
| Sample enquiry | **Transcribed** (below) |
| Client, today, problem, users, ask, must-have, core build, out of scope, AI, constraints, design, budget | **Not transcribed.** The full prose was not in the Builder's task packet, and no copy exists in this repository or worktree. |

**Owner action:** paste the brief's remaining sections here verbatim, in the order above. Until then, treat anything the codebase says about those sections (for example the CORE BUILD list and non-goals in `docs/PROJECT_BRIEF.md`) as relayed secondhand and unverified against the brief text. In particular, the claims that the brief gives no GST rate, child rule or single-supplement rule could not be re-checked here.

## Sample packages (exact facts)

| Code | Title | Days | Seasons and price (₹ per person) | Stars | Status |
|---|---|---|---|---|---|
| PKG-KL-07 | Munnar, Thekkady and Alleppey houseboat | 6 | Peak Oct–Mar: 32,500 · Monsoon Jun–Sep: 24,900 | 4 | Published |
| PKG-SI-12 | Madurai, Rameswaram and Kanyakumari | 5 | All year: 18,750 | 3 | DRAFT |

Notes on reading the table:
- The brief gives season **months** only. The exact day boundaries (Oct 1, Mar 31, Jun 1, Sep 30) are assumptions of this build (`rangeAssumed`), as is `nights = days − 1`. Months outside Peak and Monsoon (Apr–May) have no price in the brief.
- The prices are per person. "Twin share" in the code and docs is this build's reading of the per-person rate (assumption A2), not a quoted brief term.
- PKG-SI-12 is a draft, so it must not appear in the public list.

## Sample enquiry (exact text)

> Hi, 2 adults and 1 kid, Kerala 5-6 nights in December, budget around 1.2 lakh total, houseboat a must

How the build reads it (assumptions, not brief facts): "kid" is a child of unknown age; "1.2 lakh" is ₹1,20,000; "5-6 nights" means 6–7 days; December falls wholly inside the assumed Peak range.
