---
title: SUM in Excel, the whole column in one number
summary: SUM adds the numbers in a range and ignores anything that is not a number. It is the first formula most people type and the one most often pointed at the wrong range.
description: How SUM works in Excel, why it skips text and blanks, three worked examples, the errors it returns, and a drill that totals a revenue column.
function: SUM
exercise: sum-basics
syntax: =SUM(number1, [number2], ...)
updated: 2026-02-14
---

`=SUM(B2:B4)` adds every number in B2, B3 and B4 and returns the total. If those cells hold 1200, 1450 and 930, the answer is 3580. Nothing else is needed: no plus signs between the cells, no sheet name, no fixed list of addresses. Change one of the three figures and the total follows on its own.

## Syntax

`=SUM(number1, [number2], ...)`

- `number1` is a range such as `B2:B4`, a single cell, or a typed number.
- `number2` and the rest are optional. Each one is added to the running total.
- There is no condition and no lookup. SUM adds what it is given.

The arguments are separated by commas, and a range is written with a colon: `B2:B4` means the three cells in column B from row 2 down to row 4. The parentheses matter. Without the closing one, Excel will not accept the formula and offers to fix it, which is usually a sign the range is unfinished.

## Examples

### Example 1: a column of revenue

A small table holds region names in column A and Q1 revenue in column B. North is 1200, South is 1450, West is 930. The cursor sits in B5, under the numbers.

`=SUM(B2:B4)`

B5 shows 3580. The formula names three cells, but nothing about it is fixed: type 1500 over the South figure and B5 becomes 3630 as soon as you press Enter. That is the difference between a total and a set of numbers that happens to sit next to each other.

### Example 2: a range with a label in it

Ranges get dragged too far. Suppose the selection is `B2:B6`, where B5 holds the word Total and B6 is empty. SUM ignores both and still returns 3580, because text and empty cells are not numbers. There is no error, and that is the useful part: a heading caught in the range does not break the formula.

The same forgiveness is a trap when the good data is text. If an imported column stored `1200` as text rather than as a number, SUM skips it without a word and the total is quietly short. Select the cell and look at its alignment: numbers sit on the right by default, text sits on the left.

### Example 3: adding two blocks

Revenue for a second quarter sits in D2:D4. One formula can add both columns:

`=SUM(B2:B4,D2:D4)`

The comma separates two ranges and SUM adds all six cells. This works with any number of blocks, which is why the arguments are written as `number1, [number2], ...`: `=SUM(B2:B4,D2:D4,F2:F4)` is a three-quarter total in a single cell. If a cell appears in two ranges it is added twice, so check for overlap before stacking ranges.

## What goes wrong

| Result | What it means | The fix |
| --- | --- | --- |
| `#VALUE!` | A cell in the range cannot be read as a number in this context | Find the text value, or use `SUMIF` to add only the numbers |
| `#NAME?` | The function is misspelled, for example `SUMM` or `SU` | Type `=SUM(` and let Excel complete it |
| A total that is low | Numbers stored as text were skipped | Check the alignment of the column, then convert the text |
| A total that is high | The range includes a subtotal further down the column | Stop the range above the subtotal row |
| `0` | The range is empty or points at the wrong column | Read the range addresses, not the column letters |

The last row of the table is the one that survives longest in real files. A total placed at the bottom of a column, then a new range dragged to include rows below it, adds the old total to the new figures. The number is plausible and wrong, which is the worst combination. Read the range in the formula bar before you trust the answer.

## Practice

The drill below shows the revenue table and asks for the total of the Q1 column. Type the formula as you would in Excel and press Check. The expected answer is the number the formula should return, so the range has to be the three data rows, not the whole column.

## Questions

### Does SUM ignore text inside a range?

Yes. Text and empty cells inside a range are skipped, so a heading caught by a wide range does not cause an error. A cell that holds an error value such as `#N/A` is different: the error travels through SUM and the total becomes that error.

### Why does my total show 0 when the column is full of numbers?

Either the numbers are stored as text, or the range points somewhere else. Align a suspicious cell to the left and right in turn: if it moves, it is text. A quick test is `=ISNUMBER(B2)`, which returns `TRUE` for a real number and `FALSE` for text that looks like one.

### Is SUM the same as the plus sign?

`=B2+B3+B4` and `=SUM(B2:B4)` return the same number here. The difference appears when the data grows: adding a row inside a SUM range expands the range, while a typed `=B2+B3+B4` has to be edited by hand. For a longer column, SUM is also shorter to read and easier to check.

### Should the total sit above the numbers or below them?

Below is the habit in accounting and most templates, and it reads well because the total arrives after the data. Above the column also works if that is the convention in the file. Pick one and keep it: a sheet where some totals are at the top and others at the bottom costs the reader a second look every time.
