---
title: Count the open tickets with COUNTIF
question: How do I count how many rows have a particular value?
summary: COUNTIF counts the rows that meet one condition. Four of these eight tickets read Open, so it returns 4, and the quoting of the condition is the part people get wrong.
description: How COUNTIF counts rows that match one value, why a text condition needs quotes, which wildcards work, and the errors.
function: COUNTIF
family: count
drills: countif-open-tickets
updated: 2026-02-18
---

`=COUNTIF(B2:B9,"Open")` returns 4. The status column holds eight tickets with five different statuses in it, and exactly four of them read Open. Nothing was filtered, nothing was sorted, and the answer is a number the sheet can print without a pivot table.

## Answer

`=COUNTIF(B2:B9,"Open")` takes two arguments: the range to look through and the condition to look for. The range is the whole status column, `B2:B9`, and the condition is the word Open in double quotes. COUNTIF needs to know it is looking for text, not for a cell named Open.

Reading it out loud is the test: count, in this column, the cells that say Open. If the count comes back one short, the range stopped before the last row, which is the most common reason for an off-by-one in any count.

## Why it works

- COUNTIF never sums, averages or returns a value from another column. It answers one question, how many, which is why it is safe to use on text columns where `COUNT` would return 0.
- Text conditions are quoted, numbers are not. `COUNTIF(B2:B9,"Open")` needs the quotes; `COUNTIF(C2:C9,4)` counts the cells equal to the number four. Quoting a number makes it text and counts nothing.
- Comparisons are written inside the quotes: `">=5"`, `"<>Closed"`, `">"&A1` when the threshold lives in a cell. The operator and the value travel together as one string.
- Wildcards work in the condition, so `"T-10*"` counts the tickets whose ID starts with T-10 and `"*open*"` finds Open inside a longer status. The asterisk belongs to the condition, so it cannot be searched for as a literal asterisk without a tilde.
- Matching ignores case. Open and open are the same status to COUNTIF, which is convenient when the data is inconsistent and dangerous when "OPEN", "Open" and "open" are genuinely three categories. If they are, the count has to be split by something else.
- The condition can be a cell reference: `=COUNTIF(B2:B9,D1)` lets the reader type a status and watch the count follow, without touching the formula.

A second condition needs `COUNTIFS`, which takes pairs of range and condition and counts only the rows that satisfy all of them. Converting a working COUNTIF by adding a comma in the wrong place gives a count of everything, which looks like a working report.

## What goes wrong

| What you see | What it means | The fix |
| --- | --- | --- |
| `#NAME?` | the function name is misspelled: COUNTIFF, COUNITF | one F, one T |
| `#VALUE!` | the condition lost its quotes, so Open was read as a name | wrap the word: `"Open"` |
| A count one short | the range stops at the second-to-last row | extend it to the last ticket: `B2:B9` |
| A count of every row | a wildcard condition such as `"*"`, or a condition that matched an empty string | check the condition and look for cells that are not blank |
| A count of zero for a status you can see | a trailing space in the data, or the status is stored with different capitalisation than you assumed | `TRIM` the column, or count with a wildcard: `"*Open*"` |

The third row is the one that gets published, because a count that is one short is still a number. The fifth is the one that gets argued about, because the row is right there on screen. In both cases the range and the quoting are the things to check first, and the data second.

## Practice

The exercise below is an eight-ticket support log with four Open rows in it. The count is graded against the reference formula. A range that stops a row early and a condition without quotes each come back with their own message.

### Where to go next

| Page | Why it helps |
| --- | --- |
| [COUNTIF](/excel-functions/countif) | The long-form explanation, including `COUNTIFS` and the versions that have it. |
| [total one region's rows with SUMIF](/formulas/sum-one-regions-rows-with-sumif) | The same two ranges doing arithmetic instead of counting. |
| [count only the numbers](/formulas/count-only-the-numbers-with-count) | Where the traps live when "how many match" is not the question. |
