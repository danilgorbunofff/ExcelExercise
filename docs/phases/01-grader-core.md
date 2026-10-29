# Phase 1 — Grader core

**Purpose:** turn a learner's formula string into a verdict that can explain itself.
This is the part competitors cannot copy quickly, so it gets built and tested before any UI exists.

**Depends on:** nothing (the only pre-existing file is `src/grader/address.js`).
**Unblocks:** phases 2, 3, 5.

## Deliverables

| File | Responsibility |
|---|---|
| `src/grader/address.js` | A1 ↔ row/col conversion, range expansion (already present) |
| `src/grader/errors.js` | `FormulaError` carrying an Excel error code (`#VALUE!`, `#N/A`, `#DIV/0!`, `#REF!`, `#NAME?`) plus a position |
| `src/grader/tokenize.js` | numbers, text, booleans, refs, ranges, identifiers, operators, `%`, `(` `)` `,` `;` |
| `src/grader/parse.js` | Pratt parser → AST: `number`, `string`, `boolean`, `ref`, `range`, `call`, `binary`, `unary`, `percent` |
| `src/grader/values.js` | `RangeValue`, coercion to number/text/boolean, comparison, blank handling |
| `src/grader/functions.js` | built-in library (below) |
| `src/grader/evaluate.js` | AST evaluation against a cell map, lazy `IF`/`IFERROR` |
| `src/grader/grade.js` | syntax → structure → execution → equivalence → outcome |
| `src/grader/index.js` | public API: `grade(exercise, input)`, `buildCells(exercise)`, `compute(formula, cells)`, `structure(formula)`, plus the tokenizer/parser/value helpers |

## Function library (scope is deliberate)

Aggregates: `SUM`, `AVERAGE`, `COUNT`, `COUNTA`, `MIN`, `MAX`, `SUMIF`, `COUNTIF`.
Logic: `IF`, `IFERROR`, `AND`, `OR`, `NOT`.
Lookup: `VLOOKUP`, `HLOOKUP`, `XLOOKUP`, `INDEX`, `MATCH`.
Text: `LEN`, `LEFT`, `RIGHT`, `MID`, `FIND`, `SEARCH`, `UPPER`, `LOWER`, `PROPER`, `TRIM`,
`CONCAT`, `CONCATENATE`, `TEXTJOIN`.
Math: `ABS`, `ROUND`, `ROUNDUP`, `ROUNDDOWN`.

Anything outside this list returns `#NAME?` with a message naming the function — that is a better
teaching outcome than silently mis-evaluating.

## Work breakdown

1. **Tokenize.** Strip a leading `=`; ignore whitespace; support `"text"` and `'text'`; support
   `$A$1` absolute refs and `A1:B4` ranges; treat `;` as `,`. Unclosed text and unknown characters
   raise `FormulaError` with the character offset so the UI can show a caret.
2. **Parse.** Binding powers: comparisons `10`, `&` `20`, `+ -` `30`, `* /` `40`, `^` `50`
   (right-associative). Prefix `+`/`-`; postfix `%`. A call node keeps its raw name and argument ASTs
   so rules can inspect structure without evaluating.
3. **Values.** Blank cells are `null`: `0` in arithmetic, `""` in text, ignored by aggregates,
   counted by `COUNTA` as empty. Text-to-number coercion only for numeric strings.
   Comparisons are numeric when both sides are numeric, otherwise case-insensitive text.
4. **Functions.** Implement Excel semantics for the edge cases the lessons actually teach:
   `SUM` ignores text inside ranges but errors on a text literal argument; `ROUND` is half away from
   zero; `VLOOKUP` defaults to approximate and returns `#N/A` when unsorted input misses;
   `MATCH` supports `0`, `1`, `-1`; `INDEX` out of bounds returns `#REF!`; `FIND` is case-sensitive,
   `SEARCH` is not; wildcards `*` and `?` in `SUMIF`/`COUNTIF`/`MATCH`/`XLOOKUP`.
5. **Evaluate.** Single recursive walker with a context `{ getCell(key) }`. `IF` and `IFERROR`
   receive unevaluated ASTs so the untaken branch cannot throw.
6. **Grade.** Return a stable shape:

```js
{
  ok: false,
  rule: "exact-match",          // machine id, also the hint key
  message: "VLOOKUP's 4th argument was left out, so Excel guessed an approximate match.",
  hint: "Add FALSE (or 0) as the 4th argument.",
  value: 54000,
  expected: 54000
}
```

Rule evaluation order (first failure wins): `syntax` → `require` → `forbid` → `requireRef` →
`matchType` → `value`.

## Acceptance criteria

- `parse("=SUM(B2:B4)")` returns a call node with one range argument.
- `parse("=IF(B2>=70,\"Pass\",\"Fail\")")` nests correctly and does not throw.
- `=sum($b$2:$b$4)` and `=SUM(B2,B3,B4)` produce the same value.
- `=ROUND(4120.74*1.08,2)` returns `4450.4`, not `4450.3992`.
- `=1/0` surfaces `#DIV/0!` as a `FormulaError`, not `Infinity`.
- `=VLOOKUP("E-104",A2:C6,3)` returns `rule: "exact-match"` given the lesson 7 rules.
- The module imports cleanly in Node with no globals touched.

## Gate

Phase 1 is complete when `npm test` is green and every acceptance criterion above has a named test.
Status: **built and audited** — `src/grader/` (9 modules) with 76 tests in `tests/grader.test.js`.
Two strict review passes found seven real defects (listed under *Audit findings*), all fixed and
covered by the `review regressions` suites.

## Implementation notes (as built)

Decisions made while writing the modules that phase 2 needs to know about.

- **Outcome shape gained two fields.** `grade()` returns `{ ok, rule, message, hint, value, expected,
  code, position }`. `code` carries the Excel error code (`#DIV/0!`, `#N/A`, `#NAME?`…) and `position`
  the character offset of a syntax error, so the UI can draw a caret. Both are `null` when irrelevant.
- **Cells hold values, not formulas.** `buildCells()` flattens `grid.rows` from `grid.startCell`;
  `""` and `null` both become blank. There is no recalculation, so a dataset cannot contain a formula
  that another cell depends on.
- **`COUNTA` does not count `""`.** Excel counts an empty-string result as non-empty; we treat `null`
  and `""` the same because the datasets are literals. Documented rather than hidden.
- **`SUMIF` aligns and resizes `sum_range`**, exactly like Excel: the sum range is re-expanded from
  its own top-left corner to the width and height of the criteria range, so `SUMIF(A2:A4,"North",B2)`
  sums `B2:B4`. A `sum_range` narrower or shorter than `range` is no longer a silent truncation.
- **Logical values in a reference are ignored by `SUM`/`AVERAGE`/`MIN`/`MAX`/`SUMIF`.** Excel counts
  `TRUE` as 1 only when it is passed directly (`=SUM(TRUE,2)` is 3) and skips it inside `A1:A3`.
  `COUNT` is numbers-only and `COUNTA` counts booleans, which already matched.
- **`TRIM` only knows the space character.** `=TRIM("a\tt\tb  c ")` collapses the double space and
  keeps the tabs, as Excel does. `PROPER` treats an apostrophe as a word boundary (`O'Brien`).
- **Approximate lookups stop at the first row that breaks the direction.** On sorted data this is
  exact Excel behaviour; on unsorted data it is deterministic instead of arbitrary. The lessons only
  ever use sorted data.
- **A `require` rule with `minArgs` fires before `matchType`.** Lesson 7 must therefore *not* set
  `minArgs: 4` on its `func-vlookup` rule, or the specific "you left out the 4th argument" hint can
  never be reached; the `exact-match` rule owns that case.
- **Arity is enforced before evaluation.** `=SUM()` and `=IF(1)` fail with a named message rather than
  a confusing `#VALUE!` from inside the function.
- **Unsupported functions are `#NAME?` and name themselves**, in a sentence, so the learner sees
  "SUMPRODUCT is not one of the functions this track covers" instead of a bare error code.
- **`IF` without a third argument returns `FALSE`**; a blank argument (`=IF(A1,,0)`) evaluates to
  blank, which propagates as an empty cell rather than `#VALUE!`.
- **Locale decimal commas are still out of scope** — `1,5` parses as two arguments. Reject it in
  content review rather than half-supporting it.
- **`grade()` now catches every range-valued answer.** A formula whose result is a whole block
  (`=B2:B4`) comes back as a `value` outcome — "your formula points at the block B2:B4 instead of
  producing one value" — rather than throwing out of the grader.
- **Two hard limits protect the tab.** A range covering more than 100,000 cells (`MAX_RANGE_CELLS`)
  fails with `#NUM!` before it is materialised, and the parser refuses nesting deeper than 64 levels
  (`MAX_DEPTH`) with a syntax outcome. Both used to be able to freeze or crash the page.
- **A range passed where a rule inspects one argument is a rule failure, not a crash.** A `matchType`
  rule compares a single value, so `=VLOOKUP("E-104",A2:C4,3,A2:A3)` comes back as the rule's own
  outcome ("its 4th argument points at the block A2:A3 instead of a single value") instead of throwing.
  `grade()` has no path left that raises for learner input; the corpus test in the *review round 2*
  suite holds that line.
- **`matchType` and `require.minArgs` apply to every call of the function, not just the first.** A
  learner who writes `=IF(x,VLOOKUP(...FALSE),VLOOKUP(...))` has to get both right; a nested call
  cannot smuggle a missing 4th argument past the rule. Content written for the ten lessons already
  satisfies this.
- **`MIN`/`MAX` of a block with no numbers is `0`**, as in Excel; only `AVERAGE` reports `#DIV/0!`.
  `MIN`/`MAX` fold with `reduce` rather than `Math.min(...numbers)`, so a 100,000-cell range cannot
  overflow the argument limit.
- **`COUNTIF`/`SUMIF` accept a lone cell reference** (`=COUNTIF(A2,"E-101")`), promoting it to a 1×1
  range. Other functions that want a block (`VLOOKUP`, `MATCH`, `INDEX`, `XLOOKUP`) stay strict;
  pointing them at a single cell is a content error worth surfacing.
- **Outcome messages are plain text and must stay that way.** `formatValue` echoes learner text, so
  submitting `="<img src=x onerror=...>"` puts that string inside a message. The drill must write
  messages with `textContent`/`textNodes`, never `innerHTML`; see phase 5.
- **An argument that points at an empty cell is "missing", not `FALSE`.** `checkMatchType` treats a
  blank value as the absent-argument case, closing the hole where `=VLOOKUP(...,3,Z9)` satisfied an
  "exact match" rule through `blank == 0`.

## Audit findings

Seven defects found across two strict review passes, each now fixed and pinned by a test in a
`review regressions` suite.

| # | Round | Defect | Evidence before the fix |
|---|-------|--------|-------------------------|
| 1 | 1 | `grade()` threw instead of returning an outcome when the result was a range | `=B2:B4` raised `#VALUE!` out of `grade()` |
| 2 | 1 | Booleans inside a range were counted by `SUM`/`AVERAGE` | `SUM(A1:A3)` was 6, Excel says 5 |
| 3 | 1 | A single-cell or short `sum_range` threw or truncated | `=SUMIF(A2:A4,"North",B2)` raised `#VALUE!` |
| 4 | 1 | A blank 4th `VLOOKUP` argument satisfied the `exact-match` rule | `=VLOOKUP(...,3,Z9)` graded `ok: true` |
| 5 | 1 | A large range was expanded without a cap | `=SUM(A1:ZZ10000)` ran >60 s and was manually killed |
| 6 | 1 | Deep nesting overflowed the stack instead of reporting a syntax error | 500 nested `(` crashed with `RangeError` |
| 7 | 2 | The same throw survived on the *rule* path: `checkCallArgument` compared the argument outside its `try/catch` | `=VLOOKUP("E-104",A2:C4,3,A2:A3)` under an `exact-match` rule raised `#VALUE!` out of `grade()` |

Round 2 also fixed three deviations that no lesson trips but that a curious learner would: `MIN`/`MAX`
of a numbers-free block reported `#DIV/0!` instead of `0`, `COUNTIF`/`SUMIF` rejected a lone cell
reference while `SUMIF`'s own `sum_range` accepted one, and an unreachable `matchMode === 2` branch sat
in `XLOOKUP`. `expandRange` no longer builds an unused `keys` copy of its address grid.

Cosmetic deviations fixed alongside round 1: `PROPER("o'brien")` returned `O'brien`, `TRIM` ate tabs,
and `parseRef` accepted rows past 1,048,576 and columns past `XFD`. Known and accepted: `INDEX(range,0,n)`
returns a whole column in Excel and reports `#VALUE!` here, and a text condition in `IF` is treated as
truthy rather than `#VALUE!` — neither appears in the ten lessons.

## Risks and traps

- **Over-scoping the evaluator.** Only the 35 functions above (33 eager plus the lazy `IF`/`IFERROR`) are needed for 15 lessons. Resist
  `SUMPRODUCT`, array spill, and formatting.
- **Greedy regex tokenizing.** `A1:B4` vs `A1` vs a function named `LOG10` — tokenize before
  classifying, and treat `:` as punctuation.
- **Locale decimal commas.** Out of scope; document it rather than half-supporting it.
- **Floating point.** Compare with `1e-9`, never `===`.
- **Text is not a number.** `=` ignores case in Excel, so `valuesEqual` (used by criteria and by
  `matchType` arguments) stays case-insensitive — but the text a formula *writes into* a cell keeps
  its case. `compareToExpected` therefore compares a string result to a string expectation exactly,
  otherwise `"pass"` grades correct for a lesson that asks for `"Pass"` while the learner's sheet
  shows something else.

## Out of scope

Named ranges, cross-sheet refs (`Sheet2!A1`), arrays/spill, dates and serial numbers, number
formats, circular references, volatile functions.
