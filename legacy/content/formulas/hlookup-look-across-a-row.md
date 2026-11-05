---
title: Read a month's price from across the top
question: How do I look a value up when the labels run across the top row instead of down a column?
summary: HLOOKUP searches the first row and reads down the row number you give it, so Feb against a month header row returns the price and not the units. The row number counts rows the way VLOOKUP counts columns.
description: How HLOOKUP reads labels that run across the top, why its third argument counts rows, why the fourth must be FALSE, and the errors.
function: HLOOKUP
family: lookup
drills: hlookup-look-across-a-row
updated: 2026-02-18
---

`=HLOOKUP(B4,B1:D3,3,FALSE)` returns 5. Feb is the second month across the top row, the third row of that block holds prices, so HLOOKUP reads down to row 3 and finds 5. The same search written with VLOOKUP would look down column B for a month and find nothing, because the labels are not there.

## Answer

`=HLOOKUP(B4,B1:D3,3,FALSE)` is VLOOKUP with the axes swapped. The lookup value is the month in B4. The table `B1:D3` starts at the header row, because that first row is what gets searched. The `3` is a row number inside that block (header is row 1, units row 2, prices row 3), and `FALSE` makes the month match exactly.

HLOOKUP finds Feb in column C, then reads down that column to row 3. The answer is the price for the month that was asked for, and the units row is never touched.

## Why it works

- The third argument counts rows down from the top of the table, which is exactly what VLOOKUP's third argument does with columns. Both count from 1 at the edge of the range you passed, not from the top of the sheet.
- The block has to begin at the header row. If `B1:D3` were written as `B2:D3` the month row would be gone and HLOOKUP would search a row of numbers for the word Feb.
- `FALSE` is required here. The headers run Jan, Feb, Mar, which is calendar order, not alphabetical order. Approximate match is only safe on a first row sorted ascending, and this one is not, so Excel is free to stop on a neighbouring month. The exercise rejects the formula when the fourth argument is missing, even though Excel would happily run it.
- The lookup value is a cell, so the answer follows the month. Type Mar into B4 and the price becomes 5.25 with no formula change.
- A horizontal table like this is usually a report layout rather than a data layout. If the same information is stored as a column of months, VLOOKUP or `INDEX`/`MATCH` is the simpler tool. HLOOKUP exists for the sheets that arrive already laid out across the top.

There is no HLOOKUP note on this site yet, so the closest long-form explanation is the VLOOKUP note: the argument order is identical and only the direction changes. Reading across with `INDEX` and `MATCH` is also possible. `MATCH` searches the header row and `INDEX` reads down the column it found, and that version does not care which edge the labels are on.

## What goes wrong

| What you see | What it means | The fix |
| --- | --- | --- |
| The units figure instead of the price | the third argument is 2, which is the row above the prices | count the rows in the block: header 1, units 2, price 3 |
| `#N/A` for a month you can see in the row | the table range starts below the header row, so the search row holds numbers | include the header row: `B1:D3`, not `B2:D3` |
| A neighbouring month's price, no error | approximate match is in force on headers that are in calendar order, not sorted order | pass `FALSE` as the fourth argument |
| `#REF!` | the third argument points below the bottom of a three-row block | with `B1:D3` the argument can only be 1, 2 or 3 |
| `#VALUE!` | the third argument is the word `price` rather than a number | write `3`; let a `MATCH` on the header column find the number if it moves |

The first two rows account for nearly every HLOOKUP that "returns the wrong thing". Both are counting mistakes in the third argument or in the range's starting corner. Both leave a number on screen instead of an error, so check them against a second month before you trust the table.

## Practice

The exercise below is the three-month price sheet. Months run across the top, units in one row, prices in the next, and one month to ask about. It grades against the reference, so a wrong row number and a missing `FALSE` each come back with their own message.

### Where to go next

| Page | Why it helps |
| --- | --- |
| [VLOOKUP](/excel-functions/vlookup) | The same argument order in the vertical direction, with the full explanation. |
| [look up a value to the left of the key](/formulas/look-up-a-value-to-the-left-of-the-key) | The same job when the labels are down a column instead of across a row. |
| [VLOOKUP with a wildcard](/formulas/vlookup-with-a-wildcard) | Partial names in either direction. |
| [commission bands by approximate match](/formulas/vlookup-approximate-match-needs-a-sorted-column) | Revenue added up band by band, where the layout decides which mode is safe. |
