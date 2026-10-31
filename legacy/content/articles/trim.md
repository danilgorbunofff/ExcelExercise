---
title: TRIM in Excel, remove the spaces that break a lookup
summary: TRIM removes spaces from the ends of a cell and collapses doubled spaces inside it. Imported lists arrive full of them, and they are the usual reason two values that look identical do not match.
description: How TRIM works in Excel, why a trailing space breaks MATCH and VLOOKUP, three worked examples, what TRIM does not fix, and a cleanup drill.
function: TRIM
exercise: clean-up-an-imported-list
syntax: =TRIM(text)
updated: 2026-02-14
---

`=TRIM(A2)` returns the text in A2 with leading and trailing spaces removed and any run of spaces inside it reduced to one. Typed by hand, a cell rarely has them. Pasted from a PDF, an email or another system, it often does. `"  Ana  Lopez "` becomes `"Ana Lopez"` and starts matching the other table.

## Syntax

`=TRIM(text)`

- `text` is a single cell or a piece of text. A whole range does not work outside dynamic array Excel, which is a common cause of `#VALUE!`.
- The result is text, always. A number that went through TRIM comes back as text, and that matters for later maths.

The difference between `TRIM` and `CLEAN` is worth knowing. `CLEAN` removes non-printing characters such as line breaks and tabs that arrive from other systems. `TRIM` removes ordinary spaces, including the doubled ones that `CLEAN` leaves alone. A list pasted from an export often needs both: `=TRIM(CLEAN(A2))`.

## Examples

### Example 1: the cell that looks right and is not

An imported name column holds `"  Ana  Lopez  "` in A2. On screen it reads Ana Lopez, and a `MATCH` against a clean list returns `#N/A`.

`=TRIM(A2)`

The result is `"Ana Lopez"`. Two spaces between the names became one, and the padding at both ends went away. Nothing else changed: the capitalisation, the spelling and the single space between the words are all left as they were.

### Example 2: spacing and case together

The same import has names in capitals, in lower case and in a mix. `PROPER` capitalises each word:

`=PROPER(TRIM(A2))`

`"  ANA  LOPEZ "` becomes `"Ana Lopez"`. Order matters here for reading, not for the result: `TRIM(PROPER(A2))` gives the same text. Once both are applied, the column matches a hand-typed list, and the lookup that failed earlier starts returning numbers.

### Example 3: a key that lines up across two systems

To join two tables on a name, build a normalised key in a helper column:

`=LOWER(SUBSTITUTE(TRIM(A2)," ","."))`

`"  Ana  Lopez "` becomes `"ana.lopez"`. TRIM takes out the padding and the doubled space, `SUBSTITUTE` replaces the remaining space with a dot, and `LOWER` makes the case uniform. Do the same thing to the name column in the other table, then look up on the keys. The join stops depending on how each system spelled the name.

## What goes wrong

| Problem | What it means | The fix |
| --- | --- | --- |
| Spaces survive | They are non-breaking spaces, `CHAR(160)`, not ordinary ones | `=TRIM(SUBSTITUTE(A2,CHAR(160)," "))` |
| `#VALUE!` | TRIM was given a range in a version without dynamic arrays | Point it at one cell and fill down |
| `#NAME?` | The name is misspelled, for example `TRM` | Let Excel complete it |
| A number stops adding up | TRIM always returns text | Wrap in `VALUE`, or keep the original column |
| Nothing changed | The cell has no spaces at either end | Check with `=LEN(A2)` against the visible text |

The non-breaking space is the one that wastes an afternoon. It arrives from web pages and from some PDF exports, looks exactly like a space, and TRIM ignores it because it is not one. `=LEN(A2)-LEN(TRIM(A2))` counts the ordinary spaces removed; if that is 0 and the cell still refuses to match, the character is a `CHAR(160)` and `SUBSTITUTE` is the tool.

The text-number problem is the other trap. A key column built with TRIM cannot be summed, because every result is text. Keep the cleaned key in its own column and leave the original numbers alone, rather than overwriting a data column with formulas that change its type.

## Practice

The drill below shows an imported name with padding and doubled spaces, and asks for it cleaned and properly capitalised. Type the formula, then press Check. The expected answer is the name itself, so a result with the double space in it means TRIM is missing, and a result in capitals means PROPER is.

## Questions

### Does TRIM remove spaces in the middle of a cell?

It reduces a run of two or more spaces to one, so `"Ana  Lopez"` becomes `"Ana Lopez"`. It never joins two words into one, because the words need a space between them to stay readable. Removing every space is `SUBSTITUTE(A2," ","")`, which is a different job.

### Why does my VLOOKUP still fail after TRIM?

Because the problem is often on the other side of the lookup. Cleaning the value you search for does not clean the column you search in. Apply TRIM to both, or clean the source column once and paste the results back as values.

### Is TRIM enough for a list pasted from a website?

Usually not. Web text can carry non-breaking spaces, tabs and line breaks, and TRIM only handles ordinary spaces. `=TRIM(CLEAN(SUBSTITUTE(A2,CHAR(160)," ")))` is the version that covers all four, and it is worth saving somewhere you can find it again.

### Does TRIM change the cell permanently?

No, it returns a new value in the cell that holds the formula. To make the cleaning permanent, copy the formula column and paste it back with Paste Special, Values, over the original. Do that only after checking the results, because the original text is gone once the paste is done.
