---
title: Look up a supplier you only partly know
question: How do I look up a value when I only know the start of the name?
summary: A7&"*" turns a partial name into a pattern, and VLOOKUP returns the first row that matches it. The wildcard lives in the lookup value, so the cell stays editable.
description: How VLOOKUP matches a partial name with a wildcard, why the fourth argument must be FALSE, which row wins, and the errors.
function: VLOOKUP
family: lookup
drills: vlookup-with-a-wildcard
updated: 2026-02-18
---

`=VLOOKUP(A7&"*",A1:C6,3,FALSE)` returns 7. The cell holds Northwind, no supplier is called exactly that, and three of them start with it. VLOOKUP reads the pattern "Northwind followed by anything", finds the first supplier it matches (Northwind Air) and returns column 3 of that row: seven days.

## Answer

`=VLOOKUP(A7&"*",A1:C6,3,FALSE)` has one unusual part, and it is the first argument. `A7&"*"` concatenates the text in A7 with an asterisk, so the lookup value is a pattern rather than a word. Inside VLOOKUP's text comparison, `*` stands for any run of characters, so `Northwind*` matches Northwind Air, Northwind Rail and Northwind Sea.

Everything after the comma is ordinary VLOOKUP: the table `A1:C6` with the supplier names in its first column. `3` is lead time, the third column of that table, and `FALSE` asks for an exact match on the pattern.

## Why it works

- The wildcard is a character in the lookup value, not a setting. It works in VLOOKUP, `MATCH`, `COUNTIF` and `SUMIF` for the same reason: those functions read `*` as "anything".
- `FALSE` is not optional here. Approximate match sorts text alphabetically and compares in that order; it never reads the pattern. The same formula with `TRUE` returns a neighbouring supplier or `#N/A`, depending on where the cursor lands.
- Three suppliers begin with Northwind, and VLOOKUP returns the first in table order: Air, at seven days. That is a documented rule, not luck: VLOOKUP stops at the first match, and the first match is the topmost row. A longer prefix such as `Northwind R` picks one row and settles it.
- Building the pattern from a cell keeps the page alive. Typing `"Northwind*"` into the formula gives the right number today and stops following A7 the moment someone edits it.
- The asterisk belongs to the search, so it cannot appear in the data. If a supplier name genuinely contains `*`, the tilde is the escape: `~*` matches a literal asterisk.

This answers a different question from an exact lookup. If you know the whole key, look it up exactly and skip the pattern entirely. The wildcard is for the case where the ledger says Northwind and the supplier list offers Northwind Air, Northwind Rail and Northwind Sea. The reader still has to decide which of those the ledger means.

## What goes wrong

| What you see | What it means | The fix |
| --- | --- | --- |
| `#N/A` on a name you can see | the wildcard is missing, so VLOOKUP looked for the literal word Northwind | append `&"*"` to the lookup value |
| The wrong supplier, no error | three names match the pattern and VLOOKUP returned the topmost one | extend the prefix until only one row matches: `Northwind R` |
| `#REF!` | the column number reaches past the table: `A1:C6` is three columns wide | count the columns, and remember the first column is 1, not 0 |
| `#VALUE!` | the column number is text such as `"lead"` rather than a number | write `3`, or `MATCH` a header to find the number |
| A number that never changes | the pattern was typed into the formula instead of built from the cell | reference the cell: `A7&"*"` |

The first row is the one people hit, and it looks like bad data rather than a missing asterisk. Before you go looking for a trailing space in the supplier column, read your own first argument. If it has no `*` in it, the lookup is exact and Northwind is not in the list.

Wildcards also need care with numbers. A pattern only compares text, so a column holding numbers stays an exact-match column. A cell holding the text `12` will not match `12` typed as a number, which is the same number-versus-text trap that makes an exact lookup fail.

## Practice

The exercise below is a six-row supplier table with three Northwind entries in it. Type the lookup with the pattern in it and it is graded against the reference. A missing asterisk and a wrong column number each come back with a different message.

### Where to go next

| Page | Why it helps |
| --- | --- |
| [VLOOKUP](/excel-functions/vlookup) | The argument order, the alternatives, and what each one needs installed. |
| [look up a value to the left of the key](/formulas/look-up-a-value-to-the-left-of-the-key) | The problem next door, for when your columns are the wrong way round. |
| [look across a row with HLOOKUP](/formulas/hlookup-look-across-a-row) | The same search in the other direction, when the labels you are matching run across the top of the sheet. |
