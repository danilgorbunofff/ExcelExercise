# Phase 3 — Grading verification

**Purpose:** make the grader trustworthy. The product promise is "we can tell exactly why your
formula is wrong", and that promise is only as good as the fixture suite behind it.

**Depends on:** phases 1 and 2.
**Unblocks:** phase 4 (pages can be generated with confidence), phase 6.

## Deliverables

```
tests/fixtures/01-sum-basics.json      # per exercise, named after the exercise id
...
tests/fixtures.test.js                  # invariants A–D, coverage, perf, message quality
tests/corpus.js                         # shared hostile corpus (HOSTILE, OUTCOME_KEYS)
tests/grader.test.js                    # unit tests; imports the same corpus
```

Fixture shape:

```json
{
  "accepted": ["=SUM(B2:B4)", "=sum($b$2:$b$4)", "=SUM(B2,B3,B4)", "=SUM(B2:B4)+0"],
  "rejected": [
    { "formula": "=B2+B3+B4", "rule": "func-sum", "why": "no SUM used" },
    { "formula": "=SUM(B2:B3)", "rule": "value", "why": "range too short" },
    { "formula": "=SUM(B2:B4)*2", "rule": "value", "why": "double counted" }
  ]
}
```

## Work breakdown

1. **Unit tests for the tokenizer and parser:** whitespace, absolute refs, ranges, nested calls,
   text with commas, `%`, unary minus, comparison operators, and three malformed inputs that must
   throw with a position.
2. **Unit tests for the evaluator:** each function's normal case and one edge case (blank cells in
   `SUM`, text in `COUNT`, `ROUND` half-away-from-zero, `VLOOKUP` miss → `#N/A`, `FIND` case
   sensitivity, `IFERROR` swallowing an error).
3. **Fixture suite:** drive every exercise through `grade()`.
   - Invariant A: every `accepted` formula returns `ok: true`.
   - Invariant B: every `rejected` formula returns `ok: false` **and** the documented `rule`
     (this is what catches a rule that silently stops firing).
   - Invariant C: each exercise's reference answer is present in `accepted`.
   - Invariant D: no formula in any fixture, and no formula in the shared hostile corpus, makes
     `grade()` throw. It returns an outcome or nothing; the UI has no `try/catch` around a
     keystroke. The corpus was extracted from `tests/grader.test.js` into `tests/corpus.js` and is
     now exercised against all ten lessons, not just the one the unit tests happened to use.
4. **Message quality test:** for every rejection the returned `message` is longer than 15 characters
   and does not equal `"Incorrect"`; `hint` is non-empty.
5. **Regression guard:** a test asserts each exercise has at least 6 accepted and 6 rejected
   fixtures, and that every `hints` key is reachable by some fixture.
6. **Perf guard:** grading 1,000 submissions of a lesson completes well under a second (the dossier's
   <16 ms claim becomes a measured number, printed by the test).

## Coverage targets

| Exercise | Accepted variants | Rejected variants |
|---|---|---|
| 1 SUM | 4+ (range, list, `$`, lowercase) | 3+ (no function, short range, doubled) |
| 7 VLOOKUP | 4+ (exact variants, lowercase id) | 4+ (missing 4th arg, `TRUE`, wrong column, wrong id) |
| 8 INDEX/MATCH | 3+ | 3+ (VLOOKUP forbidden, approximate MATCH, hardcoded) |
| 10 capstone | 3+ | 4+ (no IFERROR, 2dp, wrong region, wrong denominator) |

Actual counts: 6 accepted and 7–12 rejected per lesson (154 formulas in total: 60 accepted, 94 rejected).

The remaining lessons follow the same pattern; 6+6 is the floor, not the target.

## Where the fixtures corrected the plan

Drafting the fixtures by hand before running them produced ten disagreements with the grader. In
every case the grader was right and the draft was wrong, and the reason was always the same thing:
**rule order**. `grade()` runs `syntax` → `require` (the function must be used) → `forbid` → and
only then `requireRef` (the answer must read the reference cell) → `evaluate` → `value`. So:

- `=1200+1450+930` on lesson 1 reports `func-sum`, not `require-ref`; typing the numbers never
  reaches the reference check because SUM is missing first. Same for lesson 2's hand-arithmetic and
  lesson 5's `=320+180+400`.
- `=VLOOKUP(D3,A2:C6,3,FALSE)` on lesson 8 reports `func-index`, not the forbidden-function rule:
  INDEX has to be present before a forbidden VLOOKUP is even considered. The `no-vlookup` hint is
  only reachable by a formula that uses both.
- Lesson 9's `LEFT` lesson also requires `FIND`, so `=LEFT(B2,3)` is rejected as `func-find` — it is
  not the unenforceable case it looked like. Only "a formula that hardcodes the right number of
  characters while also calling `FIND`" is unenforceable, and no fixture claims otherwise.
- Lesson 6 requires both `ROUND` and `SUM`, so `=SUM(B2:B4)*1.08` is `func-round` and
  `=ROUND(B2*1.08,2)` is `func-sum`; neither is a `value` failure.
- Lesson 10 wraps everything in `IFERROR`, so a `/0` inside it is *caught* and the outcome is
  `value` (`""` instead of `44.8`) — which is the correct teaching moment, not a bug. Getting a real
  `error` outcome there needs the division outside the wrapper.
- `=SUM(A2:B4)` on lesson 1 is genuinely correct: `SUM` ignores the text month labels in column A.
  Excel agrees, so it belongs in `accepted`, not `rejected`.

Two lessons learned that outlive phase 3: a fixture is a *claim about behaviour* and only running it
tells you whether the claim is true; and the hint-reachability test has to assert the rule id
exactly, because `hintFor` silently falls back to the `value` hint and would otherwise report
coverage that does not exist.

## Acceptance criteria

- `npm test` exits 0 and prints a per-exercise summary. ✅ 152 tests: 87 grader, 17 content, 48
  fixture. The perf test prints the per-exercise formula counts and the measured cost of 1,000+
  gradings (13 ms, ~13 µs each on the development machine).
- Deliberately breaking one rule in `grade.js` makes the suite fail, then reverting restores green.
  ✅ Verified twice by hand: disabling the `requireRef` check fails 16 tests; making
  `compareToExpected` always succeed fails 26.
- No fixture depends on the UI. ✅ The suite imports `content/*.json` and `src/grader/*` only.

## Risks and traps

- **Testing only happy paths.** The rejected list is where the product quality lives.
- **Asserting exact message text.** Assert the `rule` id, and separately assert messages are
  non-empty and human-length; otherwise every wording improvement breaks the suite.
- **Silent numeric comparison.** A `1e-9` tolerance test must exist; `4450.4` vs `4450.3992` is the
  exact case the competitor fails.

## Out of scope

Browser/E2E automation (phase 6 does a manual browser pass), visual snapshots, load testing.
