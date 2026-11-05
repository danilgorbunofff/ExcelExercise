# Phase 1 — Variant grading (anti-hardcoding)

**Status:** shipped — grader, schema, lint refusals, deriver and a six-screen pilot are green
(1941 tests, `content:check` 1952 fixtures, 122-page build). Rolling `variants` out to the remaining
146 screens is a hand step, described in the deviations log.
**Depends on:** nothing. Ships standalone.
**Unblocks:** phase 2 (drills can be trusted on a page), phase 3 (problem pages reuse the same pass).
**Size:** one schema field, one evaluation pass, one lint command. No new dependency.

---

## Purpose

Today a learner can pass a screen by typing the number instead of the formula whenever the screen
does not declare `requireRef`, and a `SUM` over a hand-picked range passes a screen that asked for a
whole column. `forbid` catches a specific function, not a copied constant.

Variant grading closes this with the cheapest possible mechanic: re-evaluate the submitted formula
against a hidden mutated copy of the same grid. A formula that hardcodes the answer produces the
wrong value on the mutated grid and fails.

This is the only engineering item adopted from the external blueprint
([overview §5](00-overview.md)), and it is adopted in the smallest form that works: no engine swap,
no worker, no second parser.

## Deliverables

| # | Change | File |
|---|---|---|
| 1 | `variants[]` accepted, validated and passed through | `packages/content/schema.js` |
| 2 | Second evaluation pass with `rule: "hardcoded"` | `packages/grader/grade.js` |
| 3 | `hardcoded` message in the grader's voice | `packages/grader/grade.js` (`DEFAULT_MESSAGES`), `legacy/src/site/messages.mjs` |
| 4 | Per-screen `variants` derived from the reference formula | `packages/content-lint/` |
| 5 | Refusal of inert or unpassable variants | `packages/content-lint/` |
| 6 | At least one rejected fixture citing `hardcoded` per slice | `legacy/content/exercises/*.json` |
| 7 | Tests, including a mutation test for the pass itself | `tests/grader.test.js`, `tests/content-lint.test.js` |

## Work breakdown

1. **Schema.** Add `variants` to the formula-screen field list (`packages/content/schema.js:37`,
   `FORMULA_FIELDS`). Shape, per screen:

   ```json
   "variants": [
     { "id": "prices-up", "cells": { "B2": 1450, "B3": 980 }, "expect": { "value": 3580 }, "why": "one input changed" }
   ]
   ```

   Rules: `id` kebab-case and unique within the screen; `cells` a non-empty map of A1 keys to a
   number, string or boolean; `expect.value` required; `why` a short sentence (max 200) explaining
   what the mutation changes about the answer. Reject `variants` on picture, chord and sequence
   screens with a message in the same voice as the existing `reference` rejections
   (`schema.js:204`, `:427`, `:451`).

2. **Grader pass.** In `grade()` (`packages/grader/grade.js:245`), after the visible-value
   comparison succeeds and before `return outcome(true, "correct", …)`:

   ```js
   for (const variant of exercise.variants ?? []) {
     const cells = { ...cells, ...variant.cells };
     const mutated = evaluate(ast, createContext(cells, { clock: pinnedClock(exercise.today) }));
     if (!compareToExpected(mutated, variant.expect.value, tolerance)) {
       return outcome(false, "hardcoded", exercise, { value: mutated, expected: variant.expect.value, variant: variant.id });
     }
   }
   ```

   Order matters and is the contract: syntax → `require` → `forbid` → `requireRef` → `rules` →
   visible value → **variants** → correct. A submission that is structurally wrong is told that
   first, not told it hardcoded. Errors thrown while evaluating a variant are treated as a variant
   mismatch with the error code preserved, never as `internal`.

3. **Message.** Add to `DEFAULT_MESSAGES`:

   > `That answer is right for this table but not for the same table with different numbers — which means it is typed in rather than calculated.`

   Hint key `hardcoded`, falling back to `hints.value` like every other rule
   (`grade.js:24–31`). Mirror the string in `legacy/src/site/messages.mjs` so the static build and
   the app say the same thing; `tests/messages.test.js` already enforces that pairing.

4. **Derivation at lint time, never at runtime.** Add `content-lint variants`:

   - `node packages/content-lint/cli.js variants` prints, per screen, the mutation it proposes and
     the expected value computed by evaluating the screen's own reference formula
     (`screen.reference`, or lesson-level `docs.reference` when the screen has none — the same
     rule the schema already uses at `schema.js:472`).
   - `content-lint variants --write` writes the `expect` block back into the JSON, the way
     `tests/golden/update.mjs` handles goldens.
   - `check` verifies every stored `expect.value` equals the freshly computed one, so a variant
     cannot silently drift from the reference formula.

   The browser never evaluates a reference formula to grade. Reference formulas are content, and
   content is compiled.

5. **Refusals** (both are lint errors, not warnings):

   - **Inert variant:** expected mutated value equals the visible expected value. It proves nothing
     and should be replaced with a mutation that changes the answer.
   - **Unpassable variant:** the reference formula itself fails the variant. Either the mutation is
     wrong or the reference is, and both are authoring bugs.
   - **Blind variant:** the mutation touches no cell the reference formula reads. Same class of
     error as inert, caught earlier.

6. **Pilot, then spread.** Do not retrofit 88 lessons in one commit:

   | Step | Scope | Why here |
   |---|---|---|
   | 1 | 3 screens: `01-sum-basics` (formula-1), `02-average-scores`, one lookup screen | One aggregate, one average, one reference-based formula — the three shapes that exist |
   | 2 | The 3 free lessons | They are what a visitor sees first |
   | 3 | Every formula screen in the 88 lessons | With `content-lint variants --write`, then a read-through of the `why` strings |

   Each step keeps `npm test` green and adds its own rejected fixture.

7. **Fixtures.** For each pilot slice add a `reject` entry that names the new rule, e.g.

   ```json
   { "formula": "=3580", "rule": "hardcoded", "why": "types the answer instead of summing the column" }
   ```

   `content:fixtures` replays these; the fixture floor (`MIN_FIXTURES`, `content-lint/cli.js:183`)
   stays satisfied.

## Acceptance gate

```sh
npm test                 # grader + schema + lint tests, all green
npm run content:check    # schema, variants verified against reference formulas, legal
npm run content:fixtures # every accepted/rejected fixture replays to its declared rule
```

Done when:

- A formula that passes the visible table but fails a variant returns `{ ok: false, rule: "hardcoded" }`,
  proven by a test, not by inspection.
- Deleting the variant loop from `grade.js` reddens at least one test. This is the point of the
  phase; a pass with no mutation coverage is a comment with a `for` loop.
- Every `variants` entry in content satisfies lint's three refusals.
- A lesson with no `variants` grades exactly as it does today — the pass is additive, and the
  existing 1915 tests are the proof.

### Gate evidence (recorded, not asserted)

| Claim | How it was shown |
|---|---|
| The `hardcoded` rule fires only after the visible answer was right | Every piloted rejection grades `correct` with `variants` stripped and `hardcoded` with them in place; `tests/grader.test.js` replays the same pair |
| Deleting the pass reddens tests | `for (const variant of exercise.variants ?? [])` replaced with `for (const variant of [])` → 3 grader tests and 13 fixture tests fail; file restored byte-identical, 735/735 green |
| The browser can grade a variant | `tests/build.test.js` asserts the built payload's `variants` deep-equal the content file's, and the built `excel/average-scores.html` carries all three |
| Lint refuses inert, blind and unpassable variants | `tests/content-lint.test.js`, "content-lint: the anti-hardcoding pass" (7 cases) |
| The pass is additive | 1941 tests green, `content:check` 1952 fixtures, 122-page build, snapshot gained 4 variants and 2 fixtures with no verdict changes |

## Risks

| Risk | Mitigation |
|---|---|
| Variants get authored to match a wrong reference, so both agree | The unpassable-variant refusal plus a read-through of `why` at step 3; the reference is reviewed by a human, the value is not |
| `hardcoded` fires on a legitimate absolute-constant answer | That is a content bug, not a grader bug: if a screen genuinely wants `=0.2` typed in, it must not declare variants. Document this in the authoring guide |
| Message reads as an accusation on a near-miss | Only fires after the visible answer was already correct; the copy says "right for this table", not "wrong" |
| Variant count inflates lesson JSON | `MAX_VARIANTS` caps a screen at 3 (see deviation 2); one edit per input is enough |

## Non-goals

- Replacing the evaluator with HyperFormula or Univer (licence and bundle cost; see
  [overview §7](00-overview.md)).
- Randomised or generated datasets at runtime — content stays compiled and deterministic.
- Retiring `requireRef` or `forbid`. Variants catch a *different* failure: `requireRef` catches "did
  not point at the data", variants catch "pointed at too little of it".
- Sanitising user formulas differently from today; the evaluator's existing surface is unchanged.

## Deviations log

Everything below is a deliberate departure from the plan above, recorded so phase 2 does not
rediscover it.

1. **Deliverable 3 shipped in one file, not two.** `legacy/src/site/messages.mjs` holds no grader
   copy — every grading line, including `hardcoded`, lives in
   `packages/grader/grade.js` (`DEFAULT_MESSAGES`). The `messages.mjs` half of that row was dropped.
2. **The cap is 3 variants, not 2.** Three is what `MAX_VARIANTS` in `packages/content/schema.js`
   enforces, and it is what the deriver needs to touch three different inputs on a wide grid.
   Two inputs is not enough to stop a formula that hardcodes the third.
3. **The pass has to cross the browser boundary.** Grading runs client-side
   (`legacy/src/client/drill.js`), so `screenPayload` in `legacy/src/site/exercise-page.mjs` now
   carries `variants`. `tests/build.test.js` asserts the built payload matches the content file; that
   test is the only proof the browser can grade a variant. This was missing from the deliverables
   table.
4. **`compareToExpected` exists as its own export.** The comparison was inline in the visible-value
   check; the variant pass and `content-lint` both need it, so it is exported from
   `packages/grader/grade.js`. It requires a numeric `tolerance` — passing `undefined` makes every
   `0 <= NaN` false and silently disables the inert-variant refusal. Both callers use
   `screen.expect.tolerance ?? 1e-9`.
5. **`content-lint variants` is a deriver with a small, fixed edit vocabulary**, not an oracle. It
   edits one input cell at a time: numbers by +100 when `|value| ≥ 100` else +1, then ×2 on a second
   pass; labels by swapping in another label from the same column. It skips anything that is not
   storable (finite number, non-blank string, boolean), never swaps a label for a grid's first-row
   header on a multi-row grid, and re-sends each input cell at most once.
6. **A derived variant must agree with the fixtures already accepted by that screen.** The first
   full `--write` produced 124 lint errors, because derived variants rejected formulas the corpus
   already accepts — `=ROUND(DAYS(C2,B2)/7,0)` against reference `=DAYS(C2,B2)/7`, and fallback text
   such as `"Unknown"` versus `"None"`. The deriver now evaluates every `screen.fixtures.accept`
   formula on the edited grid and discards any variant on which one of them no longer produces the
   derived value. After this filter a full sweep rewrites 117 screens and leaves exactly 117 errors,
   all of them the one hand step below.
7. **`TODAY()` screens need the screen's clock.** `checkVariants` and the deriver both evaluate with
   `{ today: screen.today }`; without it the derived value drifts from what `check` computes (54
   months against 23).
8. **Two things cannot be derived, so spreading the pilot is a hand step.** Every screen with
   `variants` advertises the `hardcoded` rule, and `tests/fixtures.test.js` then requires a
   `hints.hardcoded` line and one rejection filed under `hardcoded`, otherwise `check` fails with
   `never exercises the "hardcoded" failure`. `variants --write` prints that reminder after every
   screen it rewrites. A 152-screen rollout is therefore 146 screens of writing a rejection each —
   worth doing slice by slice as content is already touched, not in one sweep. Counting lessons
   (`18`, `48`…), threshold lessons and `FIND`/`SEARCH` lessons are inert under every edit the
   vocabulary can make; `nothing to propose` is the honest result there and is not a defect.
9. **The pilot is six screens, not the whole catalog**: `01-sum-basics`, `02-average-scores`,
   `07-vlookup-exact`, and the free lessons `27-what-a-formula-actually-does`,
   `28-cell-references-relative-and-absolute`, `29-autosum-and-the-status-bar-total`. Each carries
   authored `variants`, `hints.hardcoded`, and one rejection that grades `correct` with the variants
   removed and `hardcoded` with them in place — that pair is the phase's acceptance evidence.
10. **Grader copy lands in the message, not the outcome shape.** `tests/corpus.js`'s `OUTCOME_KEYS`
    freezes the outcome shape, so a variant id travels only inside `message`.

