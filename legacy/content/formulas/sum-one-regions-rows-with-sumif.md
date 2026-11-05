---
title: Total one region's rows with SUMIF
question: How do I add up only the rows that match one value?
summary: SUMIF adds the rows whose condition matches, which is why the third argument exists. Three North rows add to 900 while the whole table holds 1450.
description: How SUMIF adds only matching rows, why the third argument is the one that breaks it, which conditions work, and the errors.
function: SUMIF
family: aggregate
drills: sumif-region
updated: 2026-02-18
---

`=SUMIF(A2:A6,"North",B2:B6)` returns 900. The region column holds three North rows (320, 180 and 400), and SUMIF adds those three numbers and nothing else. The whole table comes to 1450, so the formula is not a total of the range; it is a total of the matching part of it.

## Answer

`=SUMIF(A2:A6,"North",B2:B6)` reads as three separate jobs. `A2:A6` is where the condition is checked. `"North"` is the condition, quoted because it is text. `B2:B6` is what gets added when the condition holds.

Leave the third argument out and nothing errors: `=SUMIF(A2:A6,"North")` adds the cells in the condition range, which are the words North, so the sum is 0. That silent zero is the most common SUMIF bug, and it is the reason the third argument is worth writing out every time even when it looks optional.

## Why it works

- Two ranges, matched by position. Row 2 of the condition range is compared to the condition, and if it matches, row 2 of the sum range is added. The two ranges must be the same shape; `A2:A6` with `B2:B10` is not a smaller or larger answer, it is `#VALUE!`.
- The condition is a value, not a formula, and it can be a comparison or a pattern: `">=200"`, `"<>North"`, `"N*"`. Comparison operators live inside the quotes, which surprises people who write `>="200"`.
- Matching ignores case. `"north"` finds North, so a region column with mixed capitalisation still totals correctly, but two spellings of one region cannot be counted separately by SUMIF alone.
- The answer follows the condition only if the condition points at a cell. Typed into the formula it becomes a hardcoded report; written as `A7` it becomes a summary you can drag down a list of regions.
- One condition is the whole contract. A second condition needs `SUMIFS`, whose argument order is different: sum range first, then pairs of condition range and condition. Converting a working SUMIF by guesswork is how people end up with a total of nothing.

The same shape works for the other aggregate questions: `COUNTIF` counts the matching rows instead of adding them, `AVERAGEIF` averages them, and `MAXIFS` finds the largest. All of them ask "which rows match", then do one thing to those rows.

## What goes wrong

| What you see | What it means | The fix |
| --- | --- | --- |
| 0 instead of a total | the third argument was left out, so SUMIF added the region names | write the number column: `=SUMIF(A2:A6,"North",B2:B6)` |
| `#VALUE!` | the condition range and the sum range are different shapes, or the sum range is a typed number rather than cells | make both ranges the same height and both point at cells |
| The total of every region | the condition is a wildcard that matches everything, or the sum range is the whole column | check the quotes: `"*"` matches every text value |
| A total that is short by one row | one range stops a row before the other | count the rows of each range; they must match |
| A total that never changes | the condition was typed into the formula instead of pointed at | reference the cell that holds the region name |

The first row is the one that costs trust: a zero looks like a real answer, so the report gets published. If a SUMIF returns 0, look at the third argument before you look at the data. A missing sum range produces exactly the same screen as a region with no sales.

## Practice

The exercise below is a five-row sales table with three North rows in it. Type the source ranges and the condition, and it is graded against the reference. A missing third argument and a mismatched range each come back with their own message.

### Where to go next

| Page | Why it helps |
| --- | --- |
| [SUMIF explained](/excel-functions/sumif) | The full note on the function, with the `SUMIFS` difference written out. |
| [count the open tickets with COUNTIF](/formulas/countif-count-the-open-tickets) | The same two ranges and a different question, when you want the row count rather than the total. |
| [count the non-empty cells](/formulas/count-the-non-empty-cells-with-counta) | The one that counts words, for when you want to know how many cells have anything in them at all. |
