# Phase 2 — Exercise content

**Purpose:** author the 10 lessons as data so the site has something real to grade, and so lesson
11 is a content task rather than an engineering task.

**Depends on:** phase 1 schema (rules and `expect` shape).
**Unblocks:** phases 3, 4, 5.

## Deliverables

```
content/
  track.json                     # the catalog: title, promise, groups, lesson slots, freeLessonCount
  exercises/
    01-sum-basics.json
    02-average-scores.json
    03-countif-open-tickets.json
    04-if-pass-fail.json
    05-sumif-region.json
    06-round-markup.json
    07-vlookup-exact.json
    08-index-match.json
    09-left-find-prefix.json
    10-capstone-margin.json
```

## Exercise schema

```json
{
  "id": "01-sum-basics",
  "slug": "sum-basics",
  "level": 1,
  "title": "SUM: total a column",
  "prompt": "In B7, total Q1 revenue (B2:B4) with a single function.",
  "answerCell": "B7",
  "grid": { "startCell": "A1", "rows": [["Region", "Q1", "Q2"], ["North", 1200, 900]] },
  "expect": { "value": 3580 },
  "require": [{ "id": "func-sum", "func": "SUM", "minArgs": 1 }],
  "forbid": [],
  "requireRef": "B2",
  "rules": [{ "id": "exact-match", "type": "matchType", "func": "VLOOKUP", "arg": 4, "values": [false, 0] }],
  "hints": {
    "func-sum": "Use SUM over the three cells instead of adding them one by one.",
    "require-ref": "Your answer must refer to the data, not repeat the number.",
    "value": "The total is off. Check the range you summed."
  },
  "docs": {
    "syntax": "=SUM(number1, [number2], ...)",
    "explain": "Two or three paragraphs of real explanation, not keyword filler.",
    "errors": [{ "code": "#VALUE!", "text": "A cell in the range contains text that cannot be summed." }],
    "atWork": "Why this shows up in a real job task."
  }
}
```

`grid.rows` is row-major from `startCell`. `null` or `""` means a blank cell. Only `answerCell` is
editable in the UI; everything else is given data.

Optional message overrides, so a lesson can speak in its own words instead of the grader's default:
`expect.tolerance` (default `1e-9`), `expect.message` (wrong value), `expect.rangeMessage` (the answer
was a whole block instead of one value), `successMessage`, and a per-rule `message` on any `require`,
`forbid` or `matchType` rule.

## The 10 lessons

| # | Slug | Level | Answer cell | Prompt (short) | Expected | Enforced rule |
|---|---|---|---|---|---|---|
| 1 | `sum-basics` | 1 | `B5` | Total Q1 revenue | `3580` | must use `SUM` |
| 2 | `average-scores` | 1 | `B7` | Average the five scores | `88.5` | must use `AVERAGE` |
| 3 | `countif-open-tickets` | 1 | `B10` | Count "Open" tickets | `4` | must use `COUNTIF` |
| 4 | `if-pass-fail` | 1 | `C2` | Pass at 70+ | `"Pass"` | must use `IF`, must reference `B2` |
| 5 | `sumif-region` | 2 | `B7` | Total North amounts | `900` | `SUMIF` with a sum range (`minArgs: 3`) |
| 6 | `round-markup` | 2 | `B6` | Total × 1.08, rounded to 2dp | `4450.4` | must use `ROUND(...,2)` and `SUM` |
| 7 | `vlookup-exact` | 2 | `E2` | Salary for `E-104` | `54000` | 4th argument `FALSE`/`0` |
| 8 | `index-match` | 3 | `E3` | Salary for `E-103`, no VLOOKUP | `88000` | `INDEX` + `MATCH`, `VLOOKUP` forbidden |
| 9 | `left-find-prefix` | 3 | `B6` | Prefix before the first `-` in `B2` | `"ORD"` | `LEFT` + `FIND` |
| 10 | `capstone-margin` | 3 | `B7` | North gross margin %, 1dp | `44.8` | `IFERROR` + `SUMIF` + `ROUND(...,1)` |

**What is not enforceable.** There is no rule type that forbids a *literal* argument, so lesson 9's
"no magic numbers" (`LEFT(B2,3)`) cannot be rejected — only the presence of `LEFT` and `FIND` and the
`B2` reference can be. The hint says why the literal is a bad idea and the docs say it again; the
grader stays quiet. Adding a `literalArgs` rule type is a phase-3 schema question, not a content one.

**Boundary data.** Lesson 4's one data row scores exactly 70, because a single answer cell can only
catch the `>` / `>=` confusion the lesson warns about if the row sits on the threshold. A score of 74
let `=IF(B2>0,…)` and `=IF(B2>=1,…)` grade correct — the lesson's own documented error was unpublishable.

**Text case.** The grader compares a text result exactly (see phase 1), so `=IF(B2>=70,"pass","fail")`
is rejected on lesson 4 while `SUMIF`/`COUNTIF` criteria stay case-insensitive, as in Excel. Any future
text lesson gets the same behaviour for free.

Datasets are small on purpose: 3–6 data rows, readable at a glance, no scrolling.

## Work breakdown

1. Write `track.json` with `freeLessonCount: 5` and the ordered lesson list. Phase 1's catalog step
   later reshaped this file into `groups` plus 88 lesson slots, where the ten lessons below are the
   authored slots — see [`packages/content/README.md`](../../packages/content/README.md) for the shape
   a new lesson goes into.
2. Author lessons in order of dependency (1, 2, 3, 4 are level 1; 5–7 level 2; 8–10 level 3).
3. For each lesson, compute the expected value **by hand** and cross-check with the evaluator before
   committing the JSON. Never copy the evaluator's output into `expect` — that hides evaluator bugs.
4. Write the `docs` block as the page's SEO body: syntax, a worked example with real numbers, 2–3
   named errors with causes, and one "this is what the task looks like at work" paragraph. Minimum
   150 words per page; no templated sentence swaps (thin programmatic pages get deindexed).
5. Name hints per rule id, not per lesson. The hint must name the mistake:
   "You omitted VLOOKUP's 4th argument, so Excel used an approximate match" — not "try again".

## Consistency checks before moving on

These are automated in [`tests/content.test.js`](../../tests/content.test.js) so they cannot rot:

- Every `answerCell` sits inside the grid rectangle and is blank in the given data.
- Every `requireRef` value holds real data (a typo would make hardcoding undetectable).
- Every `hints` key matches a rule id the grader can emit, plus `value`, `syntax`, `error` and
  `require-ref` (`requireRef` accepted as a spelling). No learner can reach a rule with a generic
  message.
- Every lesson carries its own `error` copy, distinct from its wrong-answer hint, and a reference
  answer with `+1/0` appended proves the copy is what a broken formula actually receives.
- Every function named in a rule exists in phase 1's library (`KNOWN_FUNCTIONS`).
- Every `docs` block is at least 150 words with two or more named errors.
- `track.json` lists each file exactly once, in catalog order — which is the published numbering — and
  keeps the paywall strictly inside the authored lessons.
- The reference answer grades `ok: true` **and** its value equals a literal typed independently in
  the test's audit table, so neither the JSON nor the evaluator can drift alone.
- Three or more plausible wrong answers per lesson are rejected, each with a non-empty hint.

### Arithmetic audit trail

Every expected value below was computed by hand before the JSON was written, then the evaluator was
only used to confirm. The literals live in `AUDIT` in `tests/content.test.js`.

| # | Formula | Work | Value |
|---|---|---|---|
| 1 | `=SUM(B2:B4)` | 1200 + 1450 + 930 | `3580` |
| 2 | `=AVERAGE(B2:B6)` | 442.5 / 5 | `88.5` |
| 3 | `=COUNTIF(B2:B9,"Open")` | T-1001, T-1003, T-1005, T-1007 | `4` |
| 4 | `=IF(B2>=70,"Pass","Fail")` | 70 ≥ 70 (on the boundary on purpose) | `"Pass"` |
| 5 | `=SUMIF(A2:A6,"North",B2:B6)` | 320 + 180 + 400 | `900` |
| 6 | `=ROUND(SUM(B2:B4)*1.08,2)` | 4120.74 × 1.08 = 4450.3992 | `4450.4` |
| 7 | `=VLOOKUP(D2,A2:C6,3,FALSE)` | E-104 is row 4 of A2:A6, column 3 | `54000` |
| 8 | `=INDEX(C2:C6,MATCH(D3,A2:A6,0))` | E-103 is position 3, C2:C6[3] | `88000` |
| 9 | `=LEFT(B2,FIND("-",B2)-1)` | `-` at 4, so 3 characters | `"ORD"` |
| 10 | `=IFERROR(ROUND((rev−cost)/rev*100,1),"")` | (2500 − 1380) / 2500 × 100 | `44.8` |

## Acceptance criteria

- 10 valid JSON files that `buildCells()` can load without errors. **Done — 17 content tests.**
- Every exercise solves correctly with its reference answer and fails with at least three plausible
  wrong answers.
- Each `docs` block reads like something a person wrote, with numbers specific to that dataset.

## Risks and traps

- **Authoring content against your own grader.** Cross-check expected values independently; a grader
  bug plus a matching content bug is invisible until a user complains.
- **Cramming three concepts into one lesson.** One function family per lesson; combine only at the
  capstone.
- **Copy-paste docs.** Six near-identical paragraphs is the failure mode that kills programmatic SEO.

## Out of scope

Localisation, images/screenshots of Excel, video, per-exercise quizzes beyond the single formula,
certificate copy (phase 5 placeholder only).
