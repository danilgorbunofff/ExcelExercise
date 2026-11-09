---
title: Get the newest price for a SKU from the log
question: How do I look up the latest entry when a key appears more than once?
summary: Search mode -1 walks the key column from the bottom, so a repeated SKU returns its newest price. The same formula with the default search mode returns the oldest price instead.
description: How XLOOKUP's search mode returns the newest row for a repeated key, why the default answers with an old price, and the errors.
function: XLOOKUP
family: lookup
drills: xlookup-search-from-the-bottom
updated: 2026-02-18
---

`=XLOOKUP(A7,A2:A6,B2:B6,,0,-1)` returns 21.5. The price log lists TX-101 twice, first at 19.99 and again at 21.5, and the second entry is the one that is still true. Search mode -1 walks the key column from the bottom up, so the lookup stops at the newest row instead of the first.

## Answer

`=XLOOKUP(A7,A2:A6,B2:B6,,0,-1)` fills six argument slots, and one of them is left empty on purpose. The first three are the ordinary lookup: the key in A7, the column it lives in, and the column to answer from.

The fourth slot is the text to show when nothing matches, and it is skipped between two commas because the log is expected to hold the SKU. The fifth is the match mode, `0`, for an exact match. The sixth is the search direction: `-1` means search from the last row backwards.

Order is the whole trick. Because the log is append-only, the newest price is the last row that names the SKU, and searching from the bottom finds it first. Nothing is sorted and no date column is needed.

## Why it works

- Search mode `1`, the default, walks from the top and stops at the first match. On a log with repeats that is the oldest entry, which is a real price from a real row and wrong only because it is stale.
- Search mode `-1` walks from the bottom and stops at the first match it meets going up. On an append-only sheet that is the newest entry by construction, not by luck.
- The empty slot in the middle is deliberate. XLOOKUP takes its arguments in a fixed order, so the fallback you do not want is written as nothing at all. The match mode and search mode then keep their own places. A `-1` in the fifth slot would set the match mode to "exact or next smaller", which is a different question.
- `0` as the match mode keeps the lookup exact. With approximate match on, XLOOKUP would be free to accept a neighbouring key, which on a log of similar SKUs is a price for the wrong product.
- The two column ranges must be the same height. `A2:A6` and `B2:B6` pair row by row; one extra row in either is `#VALUE!`, not a shifted answer.

Other routes reach the same number and each depends on something the sheet has to keep. A sorted log with VLOOKUP approximate match needs the sort to be maintained. `MAXIFS` over a date column needs the date column to exist and to be complete. This formula reads the order the sheet already has, which on an append-only log is the one thing nobody has to remember.

## What goes wrong

| What you see | What it means | The fix |
| --- | --- | --- |
| The oldest price, no error | search mode was left out, so the walk started at the top | write the `-1` in the sixth slot: `,,0,-1` |
| `#N/A` on a SKU you can see | the key range points at the price column, or stops before the last row | both ranges must cover the whole log: `A2:A6` with `B2:B6` |
| `#VALUE!` | the key range and the return range are different sizes | count the rows of each; they must match exactly |
| A price for a neighbouring SKU | the match mode became approximate, so the nearest key was accepted | keep `0` in the fifth slot |
| `#NAME?` | the install predates XLOOKUP | use `LOOKUP(2,1/(A2:A6=A7),B2:B6)`, which searches from the end on any version |

The first two rows are the pair worth knowing by heart. One returns an old price and the other returns an error, and both come from the same two ranges read in the wrong direction or at the wrong extent. When a log lookup disagrees with the last row you can see with your own eyes, count the ranges before you suspect the data.

## Practice

The exercise below is a six-row log with two SKUs written twice. It grades the formula against the reference, so a missing `-1` and a range that stops a row short each come back with their own message. The second screen asks for the same thing on a different SKU.

### Where to go next

| Page | Why it helps |
| --- | --- |
| [XLOOKUP](/excel-functions/xlookup) | The full argument list, with the alternatives and the versions that have them. |
| [say so instead of showing #N/A](/formulas/fall-back-when-a-lookup-finds-nothing) | The opposite problem, a key that is not in the list at all, where the cell puts a sentence in place of the error. |
| [looking up a value to the left of the key](/formulas/look-up-a-value-to-the-left-of-the-key) | The same nesting without a log, for when you know the price rather than the SKU. |
