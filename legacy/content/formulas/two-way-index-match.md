---
title: Read one grid cell by row and column
question: How do I look up a number that is at the crossing of a row and a column?
summary: One MATCH finds the row label, the other finds the column label, and INDEX reads the cell where they meet. It works on a region-by-quarter grid with no helper column.
description: Two MATCH calls and one INDEX to read a cell out of a grid, why both MATCH ranges differ, why both need a zero, and the errors.
function: INDEX
family: lookup
drills: two-way-index-match
updated: 2026-02-18
---

`=INDEX(B2:D4,MATCH(B5,A2:A4,0),MATCH(B6,B1:D1,0))` returns 130. South is the second data row of the grid, Q3 is the third column, and INDEX reads the cell at that coordinate. Nothing in the grid was sorted, and nothing was added to the sheet to make it work.

## Answer

`=INDEX(B2:D4,MATCH(B5,A2:A4,0),MATCH(B6,B1:D1,0))` is a coordinate, assembled from three pieces. The first piece is the block of numbers, `B2:D4`, the numbers only, with the labels left outside. The second is a row number, supplied by `MATCH(B5,A2:A4,0)` searching the region labels down the side. The third is a column number, supplied by `MATCH(B6,B1:D1,0)` searching the quarter headers across the top.

`INDEX` then takes row 2 and column 3 of the block and returns whatever is there. It never searches anything itself: it is handed two counts and reads the cell they point at.

## Why it works

- A two-way lookup is two separate questions. Which row is South, and which column is Q3. Neither answer depends on the other, so two MATCH calls can run side by side inside one formula.
- The two ranges have different shapes on purpose. `A2:A4` is a column of region names, `B1:D1` is a row of quarter labels. Swapping them is the most common mistake and it produces `#N/A`, not a wrong number, because a quarter label does not exist in the region column.
- The block passed to INDEX starts at the first data row and column, not at A1. If `B2:D4` were written as `A1:D5` the row and column counts would both be off by one, and the formula would confidently read the label instead of the number.
- Both MATCH calls need the `0`. Region names are in the order someone typed them and quarter labels are already in chronological order, but neither is guaranteed sorted for the rest of its life. The zero costs nothing and removes the whole question.
- Because both lookups point at cells rather than typed labels, changing B5 to West moves the answer without the formula being touched. That is what makes the page worth keeping: a grid lookup you can hand to someone else.

The same job has other spellings. `VLOOKUP` with `MATCH` in its third argument finds the column the same way. It still insists the key be the leftmost column, so a grid with regions down the side needs rearranging first.

`XLOOKUP` does the same with one function on newer installs, testing the row and the column together. Neither reads a coordinate more directly than INDEX does.

## What goes wrong

| What you see | What it means | The fix |
| --- | --- | --- |
| `#N/A` | one of the two labels is misspelled, or the two MATCH ranges were swapped | test each MATCH on its own in a spare cell; the one that returns `#N/A` is the broken one |
| `#VALUE!` | the second argument reached a row number instead of a column number, usually because the grid started one column too far left | pass the numbers only: `B2:D4` with `A2:A4` and `B1:D1` |
| A number from the wrong row or column | INDEX's block and the two label ranges disagree about where the grid starts | all three ranges must share a starting cell: data at row 2 means labels at row 1 and `B2:D4` |
| `#REF!` | the row or column number is larger than the block, so the coordinate falls outside it | count the grid: three rows and three columns means no number above 3 |
| The right number for the wrong month | approximate match on the outer MATCH, picking a nearby quarter when the label is missing | add `0` as the third argument of both MATCH calls |

The quiet failures are the third and fifth rows: both return a real number from the wrong cell, and only the label beside it says so. When a two-way lookup looks wrong, check it in the order the formula is built: the row `MATCH`, then the column `MATCH`, then the block.

## Practice

The exercise below is the whole problem on a three-by-three grid: three regions down the side, three quarters across the top. One region and one quarter feed the two MATCH calls. It is graded against the reference formula, so a swapped range and a missing zero each come back with their own message.

### Where to go next

| Page | Why it helps |
| --- | --- |
| [INDEX and MATCH explained](/excel-functions/index-match) | The argument order first, covering both halves and the versions that change the story. |
| [look up a value to the left of the key](/formulas/look-up-a-value-to-the-left-of-the-key) | The one-direction version of this same idea. |
| [search an append-only log from the bottom](/formulas/search-a-log-from-the-bottom-with-xlookup) | Where this goes next, when the row you want is the newest one rather than the only one. |
