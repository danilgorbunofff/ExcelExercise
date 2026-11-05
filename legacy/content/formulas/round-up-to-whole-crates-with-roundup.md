---
title: Round a part crate up to a whole crate
question: How do I always round up instead of to the nearest number?
summary: 476 units at twelve to a crate is 39.67. ROUNDUP orders 40 crates because the part crate ships, ROUNDDOWN counts the 39 full ones, and ROUND agrees with ROUNDUP today by luck.
description: How ROUNDUP and ROUNDDOWN move one way only, why ROUND is wrong for crates, what the digits argument does, and the errors.
function: ROUNDUP
family: round
drills: roundup-and-rounddown-one-direction-only
updated: 2026-02-18
---

`=ROUNDUP(B5/12,0)` returns 40. The three items add up to 476 units, a crate holds twelve, and 476 divided by 12 is 39.67. A part crate still has to be ordered, so the answer is the next whole crate: forty.

## Answer

`=ROUNDUP(B5/12,0)` takes two arguments: the number to round and how many decimals to keep. `B5/12` is the division, and the `0` says keep no decimals at all, so the result is a whole number of crates.

ROUNDUP always moves away from zero, whatever the digits after the point are. 39.01 rounds up to 40 just as 39.99 does. `ROUNDDOWN` is the mirror: it always moves toward zero, so 39.99 becomes 39 and the eight leftover units stay on the floor until someone decides what to do with them.

## Why it works

- `ROUND` is not a substitute. 39.67 rounds to 40 today, which is why a form built with `ROUND` appears to work. Drop the total to 470 and the same formula returns 39, because the decimal crossed a half, not because the business rule changed. ROUNDUP never does that.
- The second argument is not always 0. `ROUNDUP(A1,2)` rounds money up to the cent, which is what a quote does when it must not under-recover. `ROUNDUP(A1,-2)` rounds up to the nearest hundred, for a budget that has to be requested in round numbers.
- The direction is the whole decision, so it belongs to the question, not to the data. Crates, staff, van loads and print runs round up because the leftover has to be carried. Full units that have been completed, whole months elapsed and days already worked round down because the leftover has not happened yet.
- Keeping the division inside the formula keeps the page honest. Typing `39.67` in loses the link to the unit counts the moment a crate size changes.
- `MROUND` and `CEILING` round to a multiple rather than to a power of ten: `=CEILING(B5,12)` goes straight to 480, a whole number of units in crates of twelve. It is the better tool when the answer must be a multiple, and ROUNDUP is the better tool when it must be a count.

The rounding family also includes `INT` and `TRUNC`. Both chop the decimals off without asking: `INT` rounds down forever, while `TRUNC` rounds toward zero. For positive numbers `ROUNDDOWN`, `INT` and `TRUNC` all agree. That is why code tested on positive numbers, then handed a credit note, starts returning odd results.

## What goes wrong

| What you see | What it means | The fix |
| --- | --- | --- |
| 39 instead of 40 | `ROUNDDOWN` or `INT` where the part crate had to ship | `ROUNDUP` for anything that has to be carried whole |
| 40 today, 39 next month | `ROUND` in place of `ROUNDUP`, agreeing with it only above the midpoint | `ROUNDUP`; the direction is the rule, not the decimal |
| Cents appearing in a currency total | the second argument is not the number of decimals the currency has | `=ROUNDUP(A1,2)` for a two-decimal currency |
| `#VALUE!` | the digits argument is text, or a range was passed where one number belongs | pass a number: `0`, `2` or `-2` |
| `#DIV/0!` | the units-per-crate cell is still empty, so the division had no divisor | fill the crate size, or guard with `IF(crate=0,0,B5/12)` |

The second row is the one worth remembering, because it is a formula that passed its test. A rounding function that agrees with the right answer for the values seen so far is not one that implements the rule. The difference only shows up in the month the numbers move.

## Practice

The exercise below is a three-item order and a crate size. The first screen asks for the crates to order and the second for the crates that are completely full. Both are graded against a reference formula, so the wrong direction comes back with its own message.

There is no rounding note on this site yet, so the table below starts at the arithmetic notes.

### Where to go next

| Page | Why it helps |
| --- | --- |
| [SUM explained](/excel-functions/sum) | How the 476 units get totalled before the division. |
| [clamping a lookup to a band](/formulas/vlookup-approximate-match-needs-a-sorted-column) | The same shape in another direction: a number matched to the rule it falls under, not to the nearest thing on the sheet. |
| [count the non-empty cells](/formulas/count-the-non-empty-cells-with-counta) | The counting version of the same care, for when the count itself is the question. |
