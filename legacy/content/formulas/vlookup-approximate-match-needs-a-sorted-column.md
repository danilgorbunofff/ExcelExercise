---
title: Read a commission band with VLOOKUP
question: How do I look up which band a number falls into?
summary: Approximate match walks down the first column and stops at the last band that does not overshoot. So 4200 lands in the band that starts at 1000, and the rate is 0.05. A sorted first column is the whole contract.
description: How VLOOKUP approximate match picks a band, why the first column must be sorted, what happens when it is not, and the errors.
function: VLOOKUP
family: lookup
drills: vlookup-approximate-match-needs-a-sorted-column
updated: 2026-02-18
---

`=VLOOKUP(A6,A2:B5,2,TRUE)` returns 0.05. 4200 is above the band that starts at 1000 and below the one that starts at 5000, so the rate that applies is the one on the 1000 row. The bands are the sorted thresholds, and approximate match is the mode that reads thresholds rather than exact keys.

## Answer

`=VLOOKUP(A6,A2:B5,2,TRUE)` differs from an exact lookup in one argument and one assumption. The `TRUE` is the fourth argument, and it asks for approximate match. The assumption is that the first column of `A2:B5` is sorted ascending: 0, 1000, 5000, 10000.

With those two things true, VLOOKUP walks down the first column and stops at the last value that does not overshoot 4200. That is 1000, in row 3. Column 2 of that row holds 0.05, so that is the answer.

`1` is the same argument and the same behaviour. Leaving it out entirely defaults to `TRUE`, which is why a band lookup can work for months without the person who wrote it knowing why.

## Why it works

- Approximate match is a threshold search, not a fuzzy text match. It is built for the tables where each row means "from this number upwards": commission tiers, postage bands, tax brackets, discount breaks.
- The band row is the *lower* edge of its band. 4200 gets the 1000 rate, not the 5000 rate, because 4200 has not reached 5000 yet. Reading the wrong edge is a one-row error that moves every answer in the table.
- The sorted column is what makes the walk possible. VLOOKUP does not scan the whole column and pick the closest; it steps down until the next value would overshoot and then returns the row it is on. On an unsorted column the step where it overshoots can happen anywhere, so the answer depends on the order the rows happen to be in.
- The third argument counts columns in the table, so `2` is the rate. A `1` returns the band itself (1000), which is a plausible-looking number in a plausible-looking cell, and completely the wrong thing.
- Exact match on the same table returns `#N/A` for 4200, because no band *starts* at 4200. That is not a mistake in the formula; it is the wrong mode for the question. Approximate match is only for thresholds, so when you know the whole key, look it up by that key instead.

The same band table can be read with `XLOOKUP` and match mode `-1`, which means "exact or the next smaller item". `LOOKUP` also does it, since it is approximate by nature and takes no mode argument at all. Both still need the column sorted, because both are threshold searches underneath.

## What goes wrong

| What you see | What it means | The fix |
| --- | --- | --- |
| A rate from a neighbouring band | the first column is not sorted ascending, so the walk overshot somewhere unexpected | sort `A2:B5` ascending by the band column, and keep it sorted as bands are added |
| `#N/A` for a value you know is there | exact match is in force, so no band starting exactly at that number was found | pass `TRUE` as the fourth argument, or `1` |
| `#N/A` for a tiny value | the value is below the first band, so the walk leaves the table at the top | add a `0` band, or wrap the formula in `IF` for the below-first-band case |
| The band number appears instead of the rate | the third argument is 1, which returns the first column of the table | count the columns: band 1, rate 2 |
| `#REF!` | the third argument points past the right edge of a two-column table | `A2:B5` holds two columns, so the argument can only be 1 or 2 |

The first row is the one that never says it is broken. An unsorted band table returns a rate, the rate is a real rate, and the only way to find out is to check a second value by hand. If a band lookup and a colleague's disagree, sort the table before comparing formulas.

## Practice

The exercise below is a four-band commission table and one revenue figure. It grades against the reference, so exact match, an unsorted column and a wrong third argument each come back with a different message. The second screen asks you to point at the row the revenue needs.

### Where to go next

| Page | Why it helps |
| --- | --- |
| [VLOOKUP](/excel-functions/vlookup) | The full argument list. |
| [look it up by that key](/formulas/look-up-a-value-to-the-left-of-the-key) | For when you know the whole key instead of a threshold. |
| [VLOOKUP with a wildcard](/formulas/vlookup-with-a-wildcard) | The same function with a different first argument, for a partial name rather than a threshold. |
| [look across a row with HLOOKUP](/formulas/hlookup-look-across-a-row) | The same walk turned sideways, when the thresholds run across the top of the sheet. |
