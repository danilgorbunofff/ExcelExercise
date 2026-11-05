---
title: Use INDEX MATCH to look left of the key
question: How do I look up a value that sits to the left of the key?
summary: MATCH returns the row a price sits on, INDEX reads the product name from that row, and the answer comes from a column VLOOKUP cannot reach.
description: INDEX and MATCH together to read a value left of the key, why the exact-match zero is required, and the errors to expect.
function: INDEX
family: lookup
drills: index-match-look-left-of-the-key
updated: 2026-02-18
---

`=INDEX(A2:A5,MATCH(B6,B2:B5,0))` returns Junction box. The price 3.25 is the second price down the list, so MATCH says 2, and INDEX reads the second product name. The name sits to the left of the price, which is exactly the direction VLOOKUP refuses to look.

## Answer

`=INDEX(A2:A5,MATCH(B6,B2:B5,0))` is the whole formula, and it is built inside out. The inner half is `MATCH(B6,B2:B5,0)`: find 3.25 in the price column and report the position it was found at. The outer half is `INDEX(A2:A5,2)`: read the second cell of the product column. Written together, the position from MATCH is handed to INDEX, and nobody has to type the number 2.

Read the two ranges as the two things you know. `B2:B5` is where you look, `A2:A5` is where you answer from. They must be the same height, because MATCH's position is counted inside its own range and INDEX spends it inside its own.

## Why it works

- MATCH answers a question about position: where does this value sit. INDEX answers a question about content: what is at this position.
- Neither function knows about the other, which is why they nest cleanly. The outer function owns the answer, the inner one owns the position.
- The return column can sit anywhere. Left of the key, right of it, three columns away on another sheet. All that matters is that it is one column, and that MATCH's range is one column too.
- The `0` is the exact-match flag and it is not decorative. Prices are stored in the order things were priced, not in price order. An approximate match then returns whichever row happened to sit just below the lookup value: a real product name, a real price, and the wrong answer.
- Because the lookup value is a cell reference rather than a typed number, one edit changes the question. Point B6 at 2.75 and the answer becomes Conduit without the formula being touched.

The same shape works with two MATCH functions for a grid. One MATCH finds the row label and the other finds the column label, and that pair of positions is what a two-way lookup is. A VLOOKUP with `MATCH` in its column argument does the same job, but it still needs the key to be the leftmost column.

## What goes wrong

| What you see | What it means | The fix |
| --- | --- | --- |
| `#N/A` in every row | MATCH found the value nowhere: a trailing space, a number stored as text, or a price that is simply not in the list | `=COUNTIF(B2:B5,B6)` tells you whether the value is there at all; `TRIM` the key column before looking |
| `#REF!` | INDEX was given a range shorter than the matched position, so the row number points past its end | make the two ranges the same height: `A2:A5` with `B2:B5`, not `A2:A5` with `B2:B9` |
| A wrong product, no error | the `0` is missing, so MATCH picked the nearest lower price in an unsorted column | add the zero; an approximate match on unsorted data is a wrong answer that never announces itself |
| The answer never moves | the lookup value was typed into the formula instead of pointed at | reference the cell that holds the value you are asking about |
| `#VALUE!` | `A2:B5` was passed to INDEX, so INDEX was asked for one cell but given a block | give INDEX the single column to read: `A2:A5` |

The first two are loud. The third is the one that costs money, because a plausible part name next to a plausible price looks right by eye. When a lookup result looks wrong and no error appears, check the third argument before you suspect the data.

## Practice

The exercise below is the whole job on a four-row price list: a product column, a unit price, and a price to identify. Type the nested formula and it is graded against the reference, so a missing zero and a wrong range each come back with their own message.

### Where to go next

| Page | Why it helps |
| --- | --- |
| [INDEX and MATCH](/excel-functions/index-match) | The argument order, the other functions that do this, and the version each one needs. |
| [two-way INDEX MATCH](/formulas/two-way-index-match) | The same idea in two directions: a grid read by row and column at once. |
| [VLOOKUP with a wildcard](/formulas/vlookup-with-a-wildcard) | The neighbouring problem rather than the same one, for a key you only partly know. |
