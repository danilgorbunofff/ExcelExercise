---
title: COUNTIF in Excel, count the rows that match
summary: COUNTIF counts the cells in one range that meet one condition. The criteria decides everything, and text criteria need quotation marks.
description: How COUNTIF works in Excel, counting text, numbers and blank cells, three worked examples, its common errors, and a drill on a ticket log.
function: COUNTIF
exercise: countif-open-tickets
syntax: =COUNTIF(range, criteria)
updated: 2026-02-14
---

`=COUNTIF(B2:B9,"Open")` reads eight cells and returns 4, because four of them say Open. There is no total to check and nothing to sort: the answer is a count of the rows that match. When the status of one ticket changes, the number moves.

## Syntax

`=COUNTIF(range, criteria)`

- `range` is the block of cells to read. Only this block is searched.
- `criteria` is what a cell has to be. Text goes in quotes, a number does not.

A text criterion is exact by default: `"Open"` does not count `"open"` or `"Open "` with a space on the end. Numbers can be written as a comparison in quotes, which looks odd but works: `">10"`, `"<=100"`, `"<>0"`. The quotes are needed because the whole thing, operator and number, is a piece of text that COUNTIF parses. Comparing to a cell reference drops the quotes and keeps the operator: `=">"&D2`.

## Examples

### Example 1: counting one status

A support log has eight tickets in B2:B9 with five different statuses. To count the open ones:

`=COUNTIF(B2:B9,"Open")`

The answer is 4. Nothing in the formula changes if the log grows, as long as the range covers the new rows. That is the difference between a count and a typed number someone maintains by hand.

### Example 2: counting above a limit

The same function counts numbers with a comparison. If the log also carried the hours each ticket has been open in column C:

`=COUNTIF(C2:C9,">48")`

This returns how many tickets have passed two days. The `>` sits inside the quotes, together with the number, because COUNTIF reads the criteria as text and decides what to do with it. Typing `>48` without quotes is a syntax error.

### Example 3: a count that follows a cell

Hard-coding 48 makes the sheet rigid. Put the threshold in a cell and build the criteria from it:

`=COUNTIF(C2:C9,">"&F2)`

F2 holds 48, the `&` joins the operator and the cell into one piece of text, and COUNTIF reads the result. Change F2 to 12 and the count updates. This is the form to use for anything that will be tuned later, because the number lives in one visible place instead of inside six formulas.

## What goes wrong

| Result | What it means | The fix |
| --- | --- | --- |
| `0` when matches exist | The criteria is not what the cells contain, often a trailing space or different case | Try `"*open*"` to see if spacing is the problem |
| `#VALUE!` | The first argument is a single value, not a range, or the quotes are missing | Pass a range such as `B2:B9` |
| `#NAME?` | The name is misspelled, for example `COUNTIFF` | Let Excel complete the name for you |
| A count that is one short | The range stops a row before the last entry | Extend the range, or use a whole column |
| Everything counts | The criteria is `"*"`, which matches any text | Use `"<>"` to count non-blank cells instead |

The one-short count is the most common of these. A range typed as `B2:B8` on a log with nine rows misses the newest ticket, and the number is wrong by exactly one until someone notices. Selecting the range with the mouse and dragging instead of typing the address avoids most of it.

Case is not a factor: COUNTIF treats `"open"` and `"Open"` as the same criterion. If you need a case-sensitive count, use `SUMPRODUCT` with `EXACT`, which is a different lesson and rarely needed on a status column.

## Practice

The drill below shows the ticket log and asks how many tickets are Open. Type the formula with the range and the word in quotes, then press Check. A result of 0 usually means the quotes are missing or the range points at the wrong column, and a result of 8 means the criteria matched everything.

## Questions

### Why does COUNTIF return 0 when I can see the word in the cell?

Look for a space. A cell that reads `Open ` with a trailing space is not equal to `"Open"`, and the difference is invisible in the grid. Widen the column, or click the cell and read the formula bar. Excel's own filter shows the same trap: two entries that look identical appear as separate items in the list.

### How do I count cells that are not blank?

Use `=COUNTIF(A2:A100,"<>")`. The `<>` operator inside quotes means not equal to nothing, which covers any cell holding text or a number. `COUNTA` does the same job and is shorter, but it also counts cells whose formula returns an empty string.

### Can COUNTIF use more than one condition?

Not on its own. `COUNTIFS` takes pairs of range and criteria and counts the rows that satisfy all of them: `=COUNTIFS(B2:B9,"Open",C2:C9,">48")`. Use COUNTIF for one condition and COUNTIFS as soon as there is a second, rather than trying to squeeze two tests into one.

### Does COUNTIF work with wildcards?

Yes. `*` stands for any number of characters and `?` for exactly one, so `"North*"` counts every cell starting with North. A literal asterisk needs a tilde in front: `"~*"`. Wildcards work on text criteria only; they are ignored when the criteria is a number.
