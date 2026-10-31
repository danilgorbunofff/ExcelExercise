---
title: XLOOKUP in Excel, exact match without counting columns
summary: XLOOKUP takes the value to find, the range to search and the range to return. Two ranges instead of a table and a column number, and a fifth argument for the missing case.
description: How XLOOKUP works in Excel with two ranges, three worked examples, what #N/A means here, and a drill that reads a price from a SKU.
function: XLOOKUP
exercise: xlookup-exact-match-no-column-counting
syntax: =XLOOKUP(lookup_value, lookup_array, return_array, [if_not_found])
updated: 2026-02-14
---

`=XLOOKUP(G2,A2:A5,D2:D5)` reads the SKU in G2, finds it in A2:A5, and returns the price from the same position in D2:D5. TX-103 is the third SKU, so the answer is the third price, 9.5. No column number, no fourth argument to remember.

## Syntax

`=XLOOKUP(lookup_value, lookup_array, return_array, [if_not_found], [match_mode], [search_mode])`

- `lookup_value` is the value to find, such as a SKU or an ID.
- `lookup_array` is the single column or row to search.
- `return_array` is the column or row to read the answer from.
- `if_not_found` is optional and takes the place of an `IFNA` wrapper.
- `match_mode` defaults to exact match, which is the behaviour VLOOKUP needs a `FALSE` for.
- `search_mode` defaults to first to last; use `-1` to search from the bottom.

The first three arguments are the whole function in ordinary use. The two ranges are read in parallel, position by position. The third entry of the search range answers which row, and the third entry of the return range is the answer. Because both are named directly, the answer can sit to the left of the search column, and adding a column to the table breaks nothing.

## Examples

### Example 1: a SKU to a price

A price list has SKUs in A2:A5, descriptions in B, cost in C and price in D. The SKU to look up sits in G2.

`=XLOOKUP(G2,A2:A5,D2:D5)`

TX-103 is the third SKU in the list, so the function returns the third price, 9.5. The cost column sits between the description and the price, and the formula does not care: it never counts columns, so it cannot miscount them.

### Example 2: a friendly message instead of #N/A

A SKU that is not on the list returns `#N/A`. When a blank or a note reads better, put the fallback in the fourth argument:

`=XLOOKUP(G2,A2:A5,D2:D5,"not on the list")`

The same formula now prints those words instead of the error. This is shorter than `=IFNA(XLOOKUP(...),"not on the list")` and does the same job. The judgment call is the same one as with IFERROR. A missing SKU is often a fact someone needs to see. Use a soft message where the sheet is read by people, and leave the error where it is checked by people.

### Example 3: last match, not first

SKU codes get reused in some systems, and the newest row is the one that matters. Set the sixth argument to `-1`:

`=XLOOKUP(G2,A2:A5,D2:D5,"not on the list",0,-1)`

The search starts at the bottom of the range and returns the last SKU that matches. The fifth argument stays `0` for exact match, which is the default. Spelling out both is worth doing the first few times, because the last two arguments are easy to swap.

## What goes wrong

| Error | What it means | The fix |
| --- | --- | --- |
| `#N/A` | The value is not in the search range | Check the range covers the last row, and check for spaces |
| `#VALUE!` | The search and return ranges are different sizes | Give both the same number of rows |
| `#NAME?` | The name is misspelled, or the version is older than XLOOKUP | Use INDEX+MATCH on that machine |
| Every result is the first row | The search range points at names instead of codes | Point it at the SKU column |
| A price belongs to the wrong SKU | The two ranges start on different rows | Start both on the same row |

The last row of that table is the one that hides. Two ranges of the same size but different starting rows line up incorrectly, and every answer after the first belongs to a neighbour. Nothing errors. Read the two ranges in the formula bar and check that both begin on row 2.

## Practice

The drill below shows the price list and asks for the price of one SKU. Type the three arguments in order, then press Check. The expected answer is a price, so a SKU returned instead means the return range points at column A rather than column D.

## Questions

### Is XLOOKUP available in my Excel?

In Microsoft 365, Excel 2021 and later, and in the web app, yes. Excel 2019 and 2016 do not have it, and a file that uses it shows `#NAME?` there. If a workbook travels between machines that differ, INDEX+MATCH is the safe pair.

### Why do I not need a FALSE argument?

Exact match is the default `match_mode`. XLOOKUP finds the value or returns `#N/A`; it never quietly returns the nearest row below, which is what a VLOOKUP does when the fourth argument is left out. If you do want banded behaviour, `match_mode` has options for the next smaller and next larger item.

### Can XLOOKUP return more than one cell?

Yes. If `return_array` covers several columns, the result spills across the row: one formula returns the description, cost and price together. This works in Microsoft 365 and needs an empty area to the right, otherwise the formula returns `#SPILL!`.

### What is the difference between XLOOKUP and XMATCH?

XMATCH returns the position rather than the value, so it is the MATCH half of INDEX+MATCH. It is useful when you need the row number itself, for example to feed an INDEX into a different column than the one you searched.
