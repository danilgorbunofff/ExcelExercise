---
title: Count the non-empty cells a checklist filled
question: How do I count how many cells have anything in them, dates included?
summary: Three dates and two blanks, and COUNTA answers 3 because it counts anything filled. COUNT answers 0 on the same column, since these entries arrived as text.
description: How COUNTA counts filled cells, why it shows progress where COUNT shows nothing, how a space inflates it, and the errors.
function: COUNTA
family: count
drills: counta-count-the-non-empty-cells
updated: 2026-02-18
---

`=COUNTA(B2:B6)` returns 3. The checklist has five steps, three of them carry a date and two are still empty. COUNTA counts every cell that has something in it, so it answers three. `COUNT` on the very same column answers 0, because those dates arrived as text rather than as date values.

## Answer

`=COUNTA(B2:B6)` counts the cells in the range that are not empty. Text, numbers, dates, errors and stray spaces all count as filled; only a genuinely empty cell is skipped.

The counterpart question is why `COUNT` disagrees. COUNT counts numbers only, and a date that was pasted in as text is not a number to Excel even though it looks like one. On this column COUNT returns 0 where COUNTA returns 3, and that gap is the diagnosis: the column is text.

## Why it works

- Empty means empty. A cell holding a single space is not empty, so COUNTA counts it, which is exactly how a progress bar ends up reporting a step that never happened.
- `COUNTA` is the right function for a checklist, because the empty cell is the information: the step has not been done. Counting the filled ones is how the status deck gets its number without anyone scrolling.
- Dates, numbers, labels and even `#N/A` all count. If the column might contain errors and you want to exclude them, COUNTA is the wrong tool, because it will happily report a column of `#N/A` as full.
- Counting from a whole column is safe if the header is empty, and not safe otherwise: a header row counts as a filled cell. `=COUNTA(B:B)-1` is the usual correction, and it is the kind of arithmetic that silently goes wrong when a second header row is added.
- `COUNTA` answers "how many rows have data", which is also the length of a list. That makes it the usual argument to `INDEX` when you are reading the last item of a column: `=INDEX(B2:B100,COUNTA(B2:B100))` reads the last filled cell.

`SUBTOTAL(3,B2:B6)` is the same count that respects a filter, so it changes when rows are hidden by one. When the number on screen has to match the rows the reader can see, that is the function to reach for.

## What goes wrong

| What you see | What it means | The fix |
| --- | --- | --- |
| A count higher than the steps done | a cell holds a space, an apostrophe or an empty string from a formula | `=COUNTBLANK(B2:B6)` shows how many are really empty, or clean the column |
| 0 from COUNT on the same column | the entries are text, so no cell is a number | count with COUNTA, or convert the column and count numbers |
| One too many on a whole column | the header row is filled, so it counts | count the data rows only, or subtract the header |
| A progress bar that never reaches 100% | the count is over a formula range that returns `""` for unfinished rows | count the underlying values, not the display column |
| `#VALUE!` | COUNTA was called with no argument at all | pass a range: `=COUNTA(B2:B6)` |

The first row is the reason to distrust a checklist that says 100%. A formula that returns an empty string is not empty as far as COUNTA is concerned. A column of `=IF(A2="","",A2)` counts as completely full no matter what the sheet looks like.

## Practice

The exercise below is the five-step checklist with two blanks in it. It grades against the reference. Counting numbers instead of filled cells comes back with a message about what this column holds, and the second screen asks you to point at the right range.

### Where to go next

| Page | Why it helps |
| --- | --- |
| [COUNTIF](/excel-functions/countif) | The counting note on this site: rows that match a value rather than every filled cell. |
| [count only the numbers](/formulas/count-only-the-numbers-with-count) | The same column and the opposite question. |
| [total one region's rows with SUMIF](/formulas/sum-one-regions-rows-with-sumif) | The arithmetic version, for when you would add the matching rows rather than count them. |
