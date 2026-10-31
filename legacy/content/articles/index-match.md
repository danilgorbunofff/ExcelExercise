---
title: INDEX and MATCH in Excel, a lookup that points either way
summary: MATCH finds which row a value sits on, INDEX returns the value at a row and column. Nested, they look up a value and can look left, which VLOOKUP cannot do.
description: How INDEX and MATCH work together in Excel, three worked examples, why the row numbers have to agree, and a drill on a staff directory.
function: INDEX
exercise: index-match
syntax: =INDEX(return_column, MATCH(lookup_value, search_column, 0))
updated: 2026-02-14
---

`=INDEX(C2:C6,MATCH(D3,A2:A6,0))` reads an employee ID from D3, finds that ID in A2:A6, and returns the salary in the same row of C2:C6. With E-103 in D3 the answer is 88000. Two functions, one answer, and no column counting.

## Syntax

`=INDEX(array, row_num, [column_num])` and `=MATCH(lookup_value, lookup_array, [match_type])`

- `MATCH` returns a position: `MATCH("E-103",A2:A6,0)` returns 3 because the ID is the third value in that range.
- `INDEX` returns what is at a position: `INDEX(C2:C6,3)` returns the third salary in that range, 88000.
- The `0` in MATCH means exact match, and it should always be written.

Nesting them is the point. MATCH produces the number, INDEX consumes it, and neither function needs to know how wide the table is. VLOOKUP needs a column count; this pair does not, which is why a column inserted in the middle of a sheet breaks a VLOOKUP and leaves an INDEX+MATCH alone.

## Examples

### Example 1: an ID to a salary

Column A holds five employee IDs from A2 to A6, column B holds names, column C holds salaries. The ID to look up sits in D3.

`=INDEX(C2:C6,MATCH(D3,A2:A6,0))`

MATCH walks down A2:A6 and finds E-103 at position 3. INDEX then reads position 3 of C2:C6, which is 88000. Two ranges, each in one place, and no count of how many columns sit between the ID and the salary.

### Example 2: looking left

The same table can be read from right to left. To get the name that belongs to an ID:

`=INDEX(B2:B6,MATCH(D3,A2:A6,0))`

B2:B6 is to the right of A2:A6 here, but nothing in the formula depends on that. Point the return range at a column to the left, such as a name in column A with the ID in column C. The formula still works. This is the case VLOOKUP cannot handle at all. It is also why the pair is worth learning even in workbooks that use XLOOKUP.

### Example 3: a two-way lookup

INDEX also takes a column number, which turns it into a grid reader. With months across the top row and product names down column A:

`=INDEX(B2:M20,MATCH(J2,A2:A20,0),MATCH(K2,B1:M1,0))`

The first MATCH finds the product's row, the second finds the month's column, and INDEX returns the cell where they meet. One formula reads any cell of the table, and the report needs two cells of input rather than a rebuilt formula per month.

## What goes wrong

| Error | What it means | The fix |
| --- | --- | --- |
| `#N/A` | MATCH did not find the value | Check for spaces and numbers stored as text |
| `#REF!` | The position from MATCH is bigger than the range in INDEX | Make both ranges the same height |
| `#VALUE!` | MATCH or INDEX was given too few arguments | MATCH needs three, INDEX needs two |
| A value from the wrong row | Two ranges start on different rows | Start both on the same row |
| `#NAME?` | The name is misspelled, or quotes are missing | Let Excel complete the name |

The `#REF!` row is specific to this pair. MATCH returns a position inside its own range, and INDEX tries to use that position inside a different range. If the search range is taller than the return range, a match near the bottom produces a position INDEX cannot reach. The result is `#REF!`, not a wrong number. That is a good failure: it points straight at the mismatch.

`#N/A` is the quieter one. A trailing space in the ID, or one table where IDs are text and another where they are numbers, is enough. `TRIM` on the criteria and `EXACT` on two cells side by side will show you which of the two it is.

## Practice

The drill below shows the directory and asks for a salary by ID. Type the INDEX around the MATCH, with the `0` as the third argument of MATCH, then press Check. A `#N/A` message means the value was not found in the range you named.

## Questions

### Why not just use VLOOKUP?

Because VLOOKUP counts columns inside a block and only searches the first column of it. Add a column to the table and the count is wrong; put the key to the right of the value and VLOOKUP cannot reach it. INDEX+MATCH reads each range by name and starts from its own first cell, so both problems disappear.

### Should I use XLOOKUP instead?

In a new workbook, yes if your version of Excel has it. XLOOKUP does the same job with two ranges and no nesting: `=XLOOKUP(D3,A2:A6,C2:C6)`. INDEX+MATCH is still worth knowing because it works in every version, including files that older colleagues open and web versions that lag behind.

### What does the 0 in MATCH do?

It asks for an exact match and nothing else. Leave it out and MATCH assumes the search column is sorted ascending and returns the nearest value below, which is a wrong answer with no error. `1` and `-1` are for sorted bands and are rarely what you want.

### Why do the two ranges need the same height?

Because MATCH answers with a position, and INDEX reads a position. If the search range covers A2:A6 and the return range covers C2:C7, then position 5 points at different rows in each. Same start row, same number of rows: that is the requirement, and it is the first thing to check when an INDEX+MATCH returns `#REF!`.
