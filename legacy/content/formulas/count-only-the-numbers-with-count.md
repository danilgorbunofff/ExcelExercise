---
title: What COUNT counts, and what it skips
question: Why is my count lower than the number of rows?
summary: A column of six readings, and COUNT answers 3. The words, the blank and the seven that arrived as text are all skipped. SUM still adds 35.7, so a short count is the fastest way to find bad cells.
description: How COUNT counts numbers only, why text arrives invisible to it, why SUM disagrees, and the errors to expect.
function: COUNT
family: count
drills: count-numbers-only-and-what-it-skips
updated: 2026-02-18
---

`=COUNT(B2:B7)` returns 3. The column holds six readings: 12.5, the words n/a, 8.2, a blank, 15, and a seven that was typed as text. COUNT counts cells that are numbers, so it answers 3 and skips the other three without a message.

## Answer

`=COUNT(B2:B7)` takes the range and reports how many of its cells hold numbers. There is no condition and no second argument: the only question COUNT asks of each cell is whether Excel stores it as a number.

COUNT never errors on text, which is what makes it useful. Point it at a column pasted in from somewhere else and the shortfall lists the cells that arrived broken. Point it at a column of dates that arrived as text and it returns 0, which is the same symptom as an empty column.

## Why it works

- Excel keeps the type of a cell with the cell, not with its appearance. A seven pasted from a system that exports everything as text looks like a seven. It aligns to the left instead of the right, and COUNT does not count it.
- The blank in the middle of the range is skipped because it is nothing at all, not because it failed a test. COUNT counts what is there, and nothing is not a number.
- `SUM` over the same range returns 35.7, from the 12.5, the 8.2 and the 15, because SUM ignores text too. The two functions agreeing on the same three cells is the useful signal: if SUM's total looks short against your own estimate, COUNT tells you how many cells it added.
- `COUNTA` answers the other question, counting anything that is not empty. On this column it returns 5, because it counts the words and the text-formatted seven. The gap between COUNT and COUNTA is the number of non-numeric cells, which is sometimes the number you wanted all along.
- Whole columns are safe here: `=COUNT(B:B)` counts the numbers in the column and ignores the header, because the header is text. Counting a whole column is how you avoid deciding where the data ends.

Numbers stored as text can be converted, and the honest fix is to convert rather than to work around. `VALUE`, `Text to Columns`, or multiplying by 1 converts one column in one pass; `COUNT` on the same column afterwards is the proof that it worked.

## What goes wrong

| What you see | What it means | The fix |
| --- | --- | --- |
| A count lower than the rows you can see | some cells are text: an apostrophe prefix, a pasted import, a stray space | compare with `COUNTA`; the difference is the count of non-numbers |
| A count of 0 for a column of dates | the dates arrived as text, so no cell is a number | convert with `DATEVALUE` or Text to Columns, then count again |
| `#VALUE!` | COUNT was called with no argument at all | give it a range: `=COUNT(B2:B7)` |
| `#DIV/0!` | the count was used as a divisor and came back zero, so there was nothing to divide by | guard the divisor with `IF(count=0,"",0)` |
| A hidden row changes the answer | `COUNT` counts hidden cells but not filtered ones | if the filtered count matters, use `SUBTOTAL(2,B2:B7)` |

The first row is the everyday case and the fourth is the one that takes a site down. A count used as a divisor divides by however many rows arrived this month. The month one row arrives as text is the month the average breaks.

## Practice

The exercise below is the six-reading column with all three traps in it. Type the formula and it is graded against the reference. Pointing COUNT at the wrong range comes back with a message about reading the column cell by cell.

There is no COUNT note of its own on this site yet, so the table below points at the nearest explanations.

### Where to go next

| Page | Why it helps |
| --- | --- |
| [SUM explained](/excel-functions/sum) | The function you compare COUNT against when a total looks short. |
| [COUNTIF](/excel-functions/countif) | The counting note that does exist: rows that match a condition, not cells that hold numbers. |
| [counting the non-empty cells](/formulas/count-the-non-empty-cells-with-counta) | The same column and the opposite question. |
| [COUNTIF on the ticket log](/formulas/countif-count-the-open-tickets) | How many tickets share a status. |
