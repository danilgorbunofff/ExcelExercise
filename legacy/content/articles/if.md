---
title: IF in Excel, one test and two answers
summary: IF runs a single comparison and returns one value when it is true and another when it is false. The order of the two results is the part people get wrong.
description: How IF works in Excel with a pass or fail check, three worked examples, the four ways it goes wrong, and a drill that grades an exam column.
function: IF
exercise: if-pass-fail
syntax: =IF(logical_test, value_if_true, value_if_false)
updated: 2026-02-14
---

`=IF(B2>=70,"Pass","Fail")` looks at B2, decides whether the score reaches 70, and prints one of two words. With 70 in B2 the answer is Pass. Change B2 to 68 and the same formula returns Fail, with no editing. That is the whole function: one test, two outcomes.

## Syntax

`=IF(logical_test, value_if_true, value_if_false)`

- `logical_test` is a comparison that ends up true or false, such as `B2>=70` or `C2="Yes"`.
- `value_if_true` is what the cell shows when the test passes.
- `value_if_false` is what it shows when the test fails.

The comparison operators are the ones you would write on paper: `>` greater than, `<` less than, `>=` at least, `<=` at most, `=` equal, `<>` not equal. Two equals signs is the classic mistake, because `B2==70` is not a valid comparison in Excel and the formula is rejected. Text results need quotation marks; numbers do not. `"Pass"` is a word, `Pass` without quotes is a name Excel cannot find.

## Examples

### Example 1: a pass or fail column

Thirty exam rows, scores in column B, the pass mark at 70. In C2:

`=IF(B2>=70,"Pass","Fail")`

Ana scored exactly 70, so `B2>=70` is true and C2 reads Pass. Dragged down the column, the formula checks each row in turn. The `>=` matters: with `>` alone, a student on exactly the pass mark fails, and that is the kind of error nobody notices until a result is challenged.

### Example 2: numbers instead of words

Not every IF prints text. A bonus sheet might pay 5 percent of salary on a hit and nothing otherwise:

`=IF(C2>=100000,5%*C2,0)`

The true result is a calculation, the false result is a zero. Both branches are allowed to be any formula or value, and only the chosen one is returned. A zero is often better than a blank here, because a blank cell disappears from a SUM while a zero keeps the column honest.

### Example 3: two conditions at once

A test can combine comparisons with `AND`:

`=IF(AND(B2>=70,C2="Yes"),"Pass","Fail")`

Now a student needs the score and the attendance. `AND` returns true only when every part is true, so one missing condition is enough to fail. `OR` is the looser version: it returns true when any part is true. Both are worth knowing before writing a second IF inside the first.

## What goes wrong

| Result | What it means | The fix |
| --- | --- | --- |
| `FALSE` | The third argument was left out, so a failed test shows the test's own value | Always write both results |
| `#NAME?` | A word result was typed without quotes | Wrap text in `"` |
| Every row says Fail | The two results are in the wrong order | True comes second, false third |
| `#VALUE!` | The test compares text with a number, such as `B2>=70` where B2 holds "seventy" | Compare like with like |
| Nothing changes when you sort | The range uses relative references that moved | Lock the references with `$` |

The swapped-branches row is worth a second look because the sheet still looks right. Every cell contains a word, the column is full, and the only clue is that everyone failed. When a whole column returns one answer, read the formula and check which side of the comma each result sits on.

The `#VALUE!` row is the other frequent one, and it usually comes from imported data. A score pasted from another system can arrive as text, and any comparison against a number then fails. `ISNUMBER` tells you which it is, and `VALUE` converts a text number back to a real one.

## Practice

The drill below shows a short exam table and asks for the pass or fail word for one row. Type the formula with the comparison, the word for passing and the word for failing, in that order, then press Check. If the message says the result is FALSE, the third argument is missing; if it says `#NAME?`, a word is missing its quotes.

## Questions

### Why does my IF show FALSE instead of the word Fail?

Because the third argument is not there. `=IF(B2>=70,"Pass")` is legal Excel: when the test fails, the function returns the test's own value, which is FALSE, and the cell prints that word. Add the false result and the column reads properly.

### Can IF return a blank instead of a word?

Yes, with empty quotes: `=IF(B2>=70,"Pass","")`. The cell is then not empty, it holds text of zero length, which matters later: `COUNTBLANK` counts it, `ISBLANK` does not. If you need the cell to stay empty, leave the formula out and type the value in by hand.

### How do I handle three outcomes?

Nest a second IF in the false branch: `=IF(B2>=90,"A",IF(B2>=70,"Pass","Fail"))`. It works, and it reads badly once there are four or five branches. `IFS` was added for exactly that case and keeps each test and result on one line.

### Do I need quotation marks around numbers?

No. `=IF(B2>=70,1,0)` is correct. Quotes around a number make it text, so `"1"` will not add up in a later SUM and will not compare equal to 1 in another cell.
