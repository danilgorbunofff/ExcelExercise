---
title: SUMIF in Excel, add only the rows that match
summary: SUMIF adds the values in one column where the matching column meets a condition. The third argument is the column to add, and leaving it out is the usual mistake.
description: How SUMIF works in Excel with a region total, three worked examples, the errors it returns when the sum range is wrong, and a short practice drill.
function: SUMIF
exercise: sumif-region
syntax: =SUMIF(range, criteria, [sum_range])
updated: 2026-02-14
---

`=SUMIF(A2:A6,"North",B2:B6)` looks down the region column, finds the three rows that say North, and adds the amounts next to them: 320, 180 and 400, so 900. The whole table adds up to 1450, which is why the answer needs a condition rather than a plain SUM.

## Syntax

`=SUMIF(range, criteria, [sum_range])`

- `range` is the column the condition is tested against, such as the region names.
- `criteria` is what a cell in that column has to be, for example `"North"` or `">1000"`.
- `sum_range` is the column that gets added. It is optional, and that is a trap.

The two ranges start from their own first cell, not from each other. SUMIF lines up A2 with B2, A3 with B3, and so on, so `A2:A6` and `B2:B6` must start on the same row. Miss that and the totals silently belong to the wrong rows.

The optional third argument is where most of the confusion lives. Left out, SUMIF adds the values in `range` itself. That works when the condition and the numbers are the same column, such as `=SUMIF(B2:B6,">1000")`. It fails when they are not. With no `sum_range`, `=SUMIF(A2:A6,"North")` tries to add the word North and returns 0.

## Examples

### Example 1: total for one region

A sales table holds five rows in A2:B6: North 320, South 250, North 180, East 300, North 400. To total North:

`=SUMIF(A2:A6,"North",B2:B6)`

The answer is 900 from three rows. The other two are skipped, and no error is raised. If a region name is misspelled as `Nort`, its amount leaves the total without any warning. That is why the criteria and the data have to be checked against each other when a total looks low.

### Example 2: a threshold instead of a name

Criteria are not only words. To add the regions that sold more than 300:

`=SUMIF(B2:B6,">300")`

Here the condition and the numbers are the same column, so the third argument is not needed. SUMIF adds 320 and 400 and returns 720. The same formula on a different table returns a different sum with the same shape.

### Example 3: criteria from a cell

Typing North into a formula hides the choice inside it. Put the region in a cell instead:

`=SUMIF(A2:A6,F2,B2:B6)`

With F2 holding North, the formula returns 900. Change F2 to South and it returns 250. This is the version worth building a report on: the formula is written once, and the person reading the sheet can pick the region without touching a formula.

## What goes wrong

| Result | What it means | The fix |
| --- | --- | --- |
| `0` | The sum range was left out, or it points at text | Add the column with the amounts |
| `#VALUE!` | The sum range is not a reference, such as a typed total | Pass real cells, `B2:B6` |
| A total that is too low | The criteria has a trailing space or different case | Clean the labels, or use `"*North*"` to test |
| Right total, wrong rows | The two ranges start on different rows | Start both ranges on the same row |
| `#NAME?` | The function name is misspelled | Let Excel complete it |

The off-by-one row deserves an example. If the criteria column starts at A2 but the sum range starts at B1, the row that matches A2 is added using B1's value. Every result after it shifts by one. Nothing errors. The only way to catch it is to read both ranges in the formula bar and check that they begin on the same row.

## Practice

The drill below shows the regional table and asks for the North total. Type the three arguments in order, then press Check. The expected answer is 900 in the lesson file, so a result of 1450 means the third argument was left out and the whole table was added.

## Questions

### What happens if I leave out the third argument?

SUMIF adds the cells in `range`, which is the column it tested. That is correct only when the condition and the numbers live in the same column. With a separate amount column, the function finds no numbers to add and returns 0, without an error message.

### What is the difference between SUMIF and SUMIFS?

SUMIF takes one condition, SUMIFS takes as many as you like. SUMIFS also puts `sum_range` first, which trips people moving between the two: `=SUMIFS(B2:B6,A2:A6,"North",C2:C6,">100")`. Mixing up the argument order is the usual cause of a `#VALUE!` after a rewrite.

### Do the ranges have to be the same size?

They should be. Excel accepts ranges of different sizes and lines them up from the top left, which produces totals that look plausible and belong to the wrong rows. Same start row, same height: that is the rule worth keeping.

### Can SUMIF add rows between two dates?

Yes, with a second condition, which needs SUMIFS. `=SUMIFS(C2:C100,A2:A100,">="&F2,A2:A100,"<="&G2)` adds the amount column where the date column falls inside the range held in F2 and G2. Dates compare as numbers, so the operators work the same way they do for amounts.
