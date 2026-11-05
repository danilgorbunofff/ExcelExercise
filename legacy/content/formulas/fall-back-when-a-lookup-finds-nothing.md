---
title: Say "not stocked" instead of #N/A
question: How do I stop a lookup showing #N/A when the value is not in the list?
summary: The fourth argument of XLOOKUP is the text to show when nothing matches, so the cell reads as a sentence. It has to be the fourth argument; anywhere else it is read as a column.
description: How to give XLOOKUP a fallback when a key is missing, why #N/A appears when it sits in the wrong slot, and the IFERROR route.
function: XLOOKUP
family: lookup
drills: xlookup-with-a-fallback-when-nothing-matches
updated: 2026-02-18
---

`=XLOOKUP(B5,A2:A4,B2:B4,"not stocked")` returns not stocked. The list holds TX-101, TX-102 and TX-103, the cell asks about TX-104, and the fourth argument is the sentence to print instead of an error. A reader gets an answer they can act on rather than a code they have to look up.

## Answer

`=XLOOKUP(B5,A2:A4,B2:B4,"not stocked")` adds one argument to the three-argument form. The first is the key and the second the column it should be in. The third is the column to answer from, and the fourth the text for a key that is not in the second column at all.

The argument order is fixed, and this is where it goes wrong. The fallback is the fourth slot and nothing else. Moved into the third slot it becomes the column to return from, and XLOOKUP tries to read a text value as a range, which returns `#VALUE!`.

## Why it works

- XLOOKUP evaluates the first three arguments, fails to find the key, and instead of raising `#N/A` returns whatever the fourth argument holds. The cell then contains text, which is a value the sheet can sum around, sort and print.
- The fallback is returned exactly as written, capitalisation included. In a formula it is a literal string. In a report it is the sentence the reader sees, so write one that belongs in a sentence: "not stocked", not "ERROR".
- A fallback is not the same as hiding an error. `IFERROR` wraps any formula and catches every error, including the ones that mean the formula itself is broken: a wrong range, a wrong column, a typo in the function name. The fourth argument only answers the one case it is named for: the key was searched for properly and is genuinely not there.
- If the older install has no XLOOKUP, `IFERROR(VLOOKUP(...),"not stocked")` is the same idea with the blunt instrument attached. Use it knowing it will also swallow a broken range.
- Because the lookup value is a cell reference, one edit moves the question. Point B5 at TX-102 and the answer becomes a price with no formula change.

This is the counterpart to a log lookup. When the key is present more than once and you want the newest row, search the log from the bottom instead. When the key is absent entirely and the cell still has to say something, the fourth argument is the fix, and it costs no helper column and no `IF`.

## What goes wrong

| What you see | What it means | The fix |
| --- | --- | --- |
| `#N/A` even though a fallback was written | the fallback landed in a column slot rather than the fourth one | count the commas: key, search column, return column, fallback |
| `#VALUE!` | the search column and the return column are different sizes, so rows cannot be paired | same height on both: three SKUs against three prices |
| The fallback appears for a SKU that exists | a trailing space or a number-versus-text mismatch, so the key really was not found | `TRIM` the column, or check the cell with `=COUNTIF(A2:A4,B5)` |
| Every row reads "not stocked" | the search column is the price column, so no SKU is ever found there | swap the second and third arguments back |
| `#NAME?` | the install predates XLOOKUP | `=IFERROR(VLOOKUP(B5,A2:B4,2,FALSE),"not stocked")` |

The third row is the one that wastes an afternoon. A fallback that fires for a value you can see on screen means the lookup failed, and the reason is almost always in the data rather than the formula. Check the length of the cell against the length of the text you think is in it.

## Practice

The exercise below is a three-SKU list asked about a fourth SKU. That is exactly the case no exact lookup can answer. It grades against the reference formula, so a fallback in the wrong slot and mismatched ranges each come back with their own message.

### Where to go next

| Page | Why it helps |
| --- | --- |
| [XLOOKUP](/excel-functions/xlookup) | The argument list, the alternatives, and the versions that have them. |
| [get the newest price from a log](/formulas/search-a-log-from-the-bottom-with-xlookup) | The same function reading a repeated key. |
| [look it up with a wildcard](/formulas/vlookup-with-a-wildcard) | The other way a lookup comes back empty, when the value is a partial name rather than a missing SKU. |
