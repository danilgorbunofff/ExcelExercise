---
title: VLOOKUP in Excel, exact match first
summary: VLOOKUP finds a value in the first column of a table and returns something from the same row. The fourth argument decides whether it has to match exactly.
description: How VLOOKUP works in Excel with the exact-match form, three worked examples, the four errors it returns, and a drill to type it yourself.
function: VLOOKUP
exercise: vlookup-exact
syntax: =VLOOKUP(lookup_value, table_array, col_index_num, FALSE)
updated: 2026-02-14
---

VLOOKUP looks for a value in the first column of a table and returns a value from the same row. The version worth learning is `=VLOOKUP(lookup_value, table_array, col_index_num, FALSE)`: it finds an exact match or returns `#N/A`. Give it the ID E-104 in a staff list and it hands back that person's salary.

## Syntax

`=VLOOKUP(lookup_value, table_array, col_index_num, [range_lookup])`

- `lookup_value` is the thing you are looking for, such as a product code or an employee ID.
- `table_array` is the block of cells to search. The first column of that block is the only one searched.
- `col_index_num` counts columns inside the block, starting at 1 for the looked-up column itself.
- `range_lookup` is `FALSE` for an exact match. `TRUE` is the approximate form and needs a sorted column.

Two facts explain most of the confusion. VLOOKUP only searches the leftmost column of the block you pass it, so it can never look left. And the column number is counted inside the block, not on the sheet, so `2` means the second column of `table_array`.

## Examples

### Example 1: an ID to a salary

The directory holds IDs in column A, names in B and salaries in C, with rows 1 to 6 in use. The ID to find sits in D2.

`=VLOOKUP(D2, A2:C6, 3, FALSE)`

VLOOKUP reads D2, walks down A2:A6 until it finds `E-104`, then moves three columns right inside the block and returns 54000 from C5. If the ID is not there, the result is `#N/A` and no salary is shown. That refusal is the point of the exact match: a wrong number that looks plausible is worse than an error.

### Example 2: copied down a column

Drag the formula down and the lookup value moves with it, from D2 to D3, D4 and so on. That is what you want. The table should not move, so lock it:

`=VLOOKUP(D2, $A$2:$C$6, 3, FALSE)`

The dollar signs hold the block still while the lookup value walks down the column. Without them the block slides to A3:C7, A4:C8, and rows near the bottom of the list start returning `#N/A` for no visible reason. This is the single most common VLOOKUP bug in shared workbooks.

### Example 3: a clean label instead of an error

A missing ID is not always a mistake. Sometimes the row simply has no match yet, and `#N/A` sprayed across a report looks broken. Wrap the formula:

`=IFERROR(VLOOKUP(D2, $A$2:$C$6, 3, FALSE), "not found")`

`IFERROR` catches the error and prints whatever text you give it. Use it when a blank or a note is the honest answer, and skip it when a missing match is a fact someone needs to see. Hiding `#N/A` under an empty string is how a broken join survives a whole quarter unnoticed.

## What goes wrong

| Error | What it means | The fix |
| --- | --- | --- |
| `#N/A` | The value is not in the first column of the block | Check for trailing spaces and text stored as numbers |
| `#REF!` | The column number is wider than the block | Count again from the block's first column |
| `#VALUE!` | The block is not a range, or the column number is zero | Pass a real range such as `A2:C6` |
| Wrong value, no error | Approximate match with an unsorted column | Put `FALSE` in the fourth argument |

The `#N/A` case deserves a second look, because the text is there and still does not match. Typed or imported data carries invisible spaces, so `E-104 ` and `E-104` are two different values. `TRIM` cleans that up, and `EXACT` will show you the difference. Numbers exported as text cause the same problem in reverse: the ID looks like 10104, but it is a string, and a numeric lookup never finds it.

Sorted columns are the other trap. `TRUE` is the default when the fourth argument is left out, and it assumes the first column is sorted ascending. On an unsorted list it returns the nearest value below the one you asked for. Nothing errors, the answer is simply wrong, and the sheet looks fine. If a VLOOKUP ever returns a value from the wrong row, check for a missing fourth argument before anything else.

## Practice

The drill below uses a five-person directory and asks for the salary that belongs to E-104. Type the formula the way you would in Excel, with the comma-separated arguments in order, and press Check. The cell reference in the label tells you where the answer belongs. If it fails, the message names the part that went wrong rather than just saying "wrong".

## Questions

### Why does VLOOKUP return #N/A when the value is clearly there?

Look at the characters, not the letters. A trailing space, a number stored as text, or a value pasted with a non-breaking space all produce a value that looks identical and compares as different. Select the cell, press F2, and read the formula bar, or test the two values with `=EXACT(A2, D2)`.

### Should I use VLOOKUP or XLOOKUP?

XLOOKUP is simpler and can look left. Use it in a new workbook if your version of Excel has it. VLOOKUP is still everywhere: old files, other people's templates, shared sheets. Knowing it is not optional, and knowing the exact-match form is what keeps it honest.

### Is TRUE ever the right fourth argument?

Yes, for banded data such as tax brackets or shipping tiers, where the table is deliberately sorted and you want the nearest band below. In that case sort the column, lock the range, and say so in a note next to the formula. For anything keyed by an ID, name or code, use `FALSE`.
