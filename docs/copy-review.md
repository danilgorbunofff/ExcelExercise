# Copy review, 2026-11-09

A read-through of the site's prose.

**Status:** section A (the 11 factual problems) was reworded afterwards, sentence by sentence. Sections B and C are still open decisions for the author.

## What was read

| Area | Read | Notes |
|---|---|---|
| System strings (errors, buttons, labels) | all except the grader's function messages | `site-copy.json` inventory |
| Landing, About, catalogue, notes hub, formulas hub, track list | all | |
| Privacy, terms, pricing | all | |
| 16 group intros | all | |
| 8 articles | all (`if` and `countif` in full) | |
| 11 formula pages | all | |
| 6 shortcut pages | prose (tables are data) | |
| 4 projects | all prose fields | |
| 86 lessons | all prose fields (explanation, at work, outcome, error cases) | arithmetic spot-checked on about 25 |

Not read line by line: the grader's own error messages (about 120 short strings), the grid data inside each lesson, and the hint text on each screen.

## Overall

- No marketing filler. No inflated vocabulary, drum-roll openers or emoji. The prose is specific, with concrete numbers and cell addresses, and it has a recognisable voice.
- The structure and some phrasing are templated (see "Patterns"). That reads as machine-assisted or heavily templated, but it cannot show who wrote it.
- The bigger risk is **factual errors**, below. Wrong claims about Excel and Google Sheets matter more than style on a site that teaches Excel.

## A. Factual problems (verify, then fix)

| # | File | Problem |
|---|---|---|
| 1 | `legacy/content/articles/countif.md`, Other apps | Says Google Sheets criteria "can be read as regular expressions rather than Excel's wildcards" and gives `COUNTIF(A2:A8, "e.*")`. Sheets COUNTIF and SUMIF use wildcards (`*`, `?`, `~`). Regular expressions belong to the `REGEX*` functions. Likely wrong. |
| 2 | `legacy/content/articles/sumif.md`, Other apps | Same claim about "regular expression rules" for SUMIF. Likely wrong. |
| 3 | `legacy/content/articles/index-match.md`, Alternatives | Says INDEX+MATCH "is the only form that works in Excel 2019 and older". The paragraph before says VLOOKUP is the older single-function route. It contradicts itself, and VLOOKUP works in old Excel. |
| 4 | `legacy/content/articles/index-match.md`, Questions | "Why do the two ranges need the same height?" gives A2:A6 against C2:C7 and says "position 5 points at different rows in each". Position 5 is row 6 in both. What must match is the start row. |
| 5 | `legacy/content/articles/sum.md`, Other apps | Says Sheets "counts numbers stored as text where Excel does not". Doubtful for a range. Check in Sheets. |
| 6 | `legacy/content/articles/if.md`, Other apps | Presents Sheets IFS returning an error when no test matches as a difference from Excel. Excel IFS also returns `#N/A`. |
| 7 | `legacy/content/exercises/48-sumifs-two-conditions-at-once.json`, error case 3, and `55-countifs-several-conditions.json`, error case 2 | "Two conditions on the same column can never both match/hold." False: `">200"` and `"<300"` on one column is an ordinary between test. |
| 8 | `legacy/content/formulas/sum-one-regions-rows-with-sumif.md` | Says `A2:A6` with `B2:B10` gives `#VALUE!`. `articles/sumif.md` says Excel accepts different sizes, which is the right one for SUMIF. They contradict each other. |
| 9 | `legacy/content/exercises/76-substitute-replace-one-piece-of-text.json` | "It counts the hyphens you keep ... 2 points at the second hyphen, not at the second match to change." The instance number counts occurrences of the text being replaced. The example output (`WH-12/03`) is right, the explanation is muddled. |
| 10 | `legacy/content/exercises/80-a-monthly-close-checklist-in-formulas.json` | "the zero inside the quotes stays a number" for `"<>0"`. Unclear and not accurate. |
| 11 | `legacy/content/exercises/47-average-functions-summary.json` | "A mean of a subset can land on a number that appears nowhere in the data, so it has no row to inherit a format from." Odd sentence, and the error case says an average of a subset "always" produces such a number (overclaim). |

## B. Claims only the owner can verify

If any of this text was generated, these statements may not be true:

- About: "Each exercise is written by hand around one function or one habit, then tested." Catalogue meta description: "Hand-checked".
- Feedback form: "A person reads these."
- All six `legacy/content/shortcuts/*.md` end with the same line: "Microsoft 365 Apps for Windows, version 2501, checked on 24 February 2026. Excel for Mac 16.91 ... Google Sheets in Chrome 131". One date and set of versions on every page, and it is older than today's build date. Confirm it was really checked.
- Terms: "It is a functional copy of excelexercises.com, rebuilt from scratch." This is a public statement about a reference site; consider whether you want it published and whether it is accurate.
- Terms: "It has not been reviewed by a lawyer, and before money changes hands it should be." Honest, but it sits on a page next to a $9.99 price and a 100% refund guarantee.
- Terms and privacy: "These terms are part of the repository ... You may read the source" and "write to the address below". Check that the repository is public and that `SITE_CONTACT` is set so an address exists.
- Pricing advertises $9.99 and a 30-day refund guarantee while the page also says checkout is not open yet.

## C. Patterns (style, not errors)

Counts are over about 33,600 words of lessons, articles and formula pages.

- **Fixed skeleton everywhere.** Every lesson has an explanation, an "at work" line, an outcome and three error cases. Every article has Syntax, three Examples, What goes wrong, Alternatives, Other apps (a Sheets paragraph and a VBA paragraph), Practice and Questions. Every group intro is definition, "N exercises at level X", mechanics, pitfall, closing moral.
- **Error cases share one shape** (251 of them): "..., so there is no X to Y" in 24, "nothing to / nothing by that name" in 19, a misspelled-function case in 29 lessons, and "no error / silently / no warning" in 12. In lessons, articles and formula pages together: "so there is no" 31 times, "quietly / silently / with no error" 15, "plausible / looks right / believable" 10.
- **Closing one-line morals** on most group intros, for example "Type the zero every time", "the error handling writes itself", "the habit sticks", "Two screens also mean two chances to notice that a total is wrong".
- **Repeated sales line**: the checker reads the function, the references and the result, so a right number from the wrong range still fails. It appears on the landing, About and catalogue pages.
- **Narrow rhythm**: mean sentence length 16.4 words, standard deviation 5.7.
- **Voice outlier**: lesson 89's "at work" line ("Two keys beat four thousand rows of dragging") is punchier than the rest.

## D. What is good

- Numbers and cell references are concrete and I could confirm them where I checked: 61.2+58.4+63.9+59.1 averages 60.65, serials 45352, 45366 and 45412 match their dates, DATEDIF 790 days and 26 months, median 16.5, mean 19.67, and weighted average 11.1.
- The legal pages have a distinct, plain, slightly opinionated voice ("stated here rather than buried in capitals").
- The structural AI-tell patterns found only one sentence in the whole site (`interview-assessment.json`, "Not whether you can sum a column, but whether you notice ...").

## Suggested order of work

1. Fix section A (items 1, 2, 7 and 3, 4 first).
2. Decide section B (remove or confirm each claim).
3. Reword the repeated shapes in section C only where they bother you. They are a reading-quality issue, not an accuracy one.
