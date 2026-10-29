# Phase 1 — Curriculum Content Factory: Verification Plan

Scope: the content pipeline — schema v2, the linter, the fixture-replay grader contract, the
`content:new` scaffolder, the golden snapshot, and the authored lessons themselves.

## Assessment

**Solid tooling, High Risk on scope.**

The factory works and is proven: 16 lessons across 20 screens and 268 fixtures validate, and every
fixture's expected verdict is replayed against the real grader on every run (111 accepted, 157
rejected, zero disagreements). Schema v2, the v1 bridge and the sidecar path are all pinned by
tests, including the two ways a lesson can carry fixtures twice.

Scope is the redness: **16 of 88** catalogued lessons, and only **9 of 16** groups have any drill.
Seven groups (`intro`, `text-change`, `errors`, `date`, `aggregate`, `arrays`, `modeling`) have
authored intro copy and no lesson, so they get no page at all. That is honest — a group with an
empty intro and no lessons must not render a page promising exercises — but it means the site a
visitor sees is a fifth of the curriculum, and `content:check` prints that on every run and still
exits `✓`.

## Critical Failure Modes

**1. Green gate, one-fifth curriculum.** `content:check` passes at 16 of 88. Nothing fails when the
lesson count stops growing. Any process that reads only the exit code will report the curriculum as
done. The count must be read from the output line, not from the tick.

**2. The curriculum uses four of five screen types.** Of 20 shipped screens, 17 are `formula`, 1
`picture`, 1 `chord` and 1 `sequence` — the latter two added to lesson 03 on 2026-10-29, which is why
the keyboard renderers now have a page a visitor can reach. `workbook` is the type no lesson asks for,
so that one renderer still ships unexercised by content. The factory can express it and the schema
accepts it; the catalog simply has no lesson that needs one. This is a *content* gap with an *engine*
consequence — see failure mode 1 in the phase-2 doc.

**3. The fixture-replay contract is a floor, not a review.** 268 fixtures replay against the grader,
which proves the *code* agrees with the *authored expectations*. It does not prove either agrees
with Excel, and it does not prove a lesson teaches anything. The human accuracy review is Phase 1
criterion 8, and it is 5 of 10 through cohort two.

**4. Empty groups are a documented divergence, not a bug.** `track.groups` reports 16 and 9 group
pages ship. `verify` and the group-page tests pin the shipped set, so a future contributor adding
lesson 17 to `date` gets a new page and a new count with no diff in the group catalog — the two
numbers must be re-derived, not assumed.

**5. Golden snapshot scope is narrower than "the grader".** `tests/golden/` freezes verdicts for
the fixtures of the lessons that exist. A grader change that only affects a formula no current
lesson uses is invisible until someone authors that lesson — which is exactly when it is most
expensive to debug.

**6. Content lint vs. schema drift.** The linter and the schema once specified the same shape
differently and nothing caught it; the fix was `tests/lessons.js` normalising the corpus once so
every test reads one bridge. The risk recurs whenever a new field is added to one and not the other.

**7. `content:new` writes into the real content tree.** The scaffolder is only safe to exercise
against a temp directory. Running it against `legacy/content/` mid-verification leaves a
half-authored lesson that `content:check` will reject with an error that looks like a real
regression.

## Verification Gate

| # | Command | Expected | If it fails |
|---|---|---|---|
| 1 | `npm run content:check` | `content: 16 of 88 catalogued lessons, 16 groups, 20 screens, 268 fixtures replayed` and `✓ content passes — 111 accepted and 157 rejected formulas agree with the grader` | A lesson violates v2, or a fixture's expected verdict disagrees with the grader. The disagreement is the real signal: either the lesson or the grader is wrong. |
| 2 | `node --test tests/golden.test.js` | `tests 2`, `pass 2` | A grader verdict moved. Confirm it is intended, then `npm run golden:update` and commit the snapshot. |
| 3 | `node --test tests/schema-v2.test.js tests/content.test.js` | `tests 74`, `fail 0` | Schema/lint drift — the shape one layer accepts, the other rejects. |
| 4 | `node --test tests/fixtures.test.js` | `tests 77`, `pass 77` | A lesson's fixture file went missing or a v2 lesson kept its fixtures in the sidecar. |
| 5 | `TMP=$(mktemp -d) && cp -R legacy/content/* "$TMP"/ && node packages/content-lint/cli.js new --lesson 17 --group lookup --content "$TMP" && node packages/content-lint/cli.js check --content "$TMP"` | `✓ created …/17-xlookup-with-a-fallback-when-nothing-matches.json — "XLOOKUP with a fallback when nothing matches" (lookup, Intermediate)`, `takes catalog slot 43, published as lesson 14 of 17`, then `17 of 88 … 281 fixtures` and `✓ content passes — 117 accepted and 164 rejected` | The scaffolder emits something the linter refuses — the factory is broken for the next author. **The flags are `--content`/`--fixtures`, not `--dir`**, and the command writes into the tree it is given: always a temp copy, never `legacy/content/`. |
| 6 | `node --test tests/build.test.js` | `tests 45`, `pass 45` | The build contract moved: page count, module inventory (`summary.session` 5, `summary.client` 4), or bytes. |
| 7 | Manual, per candidate lesson | 10 accepted + 10 rejected fixtures, hints present, prompt names the screen's rule | Invisible to every other check. This is the only column that proves a lesson teaches. |

Recorded as **unmet**, deliberately, and not to be reported as green: 72 lessons, 7 groups without
drills, cohort two at 5 of 10.

## Closure evidence (this verification run)

Run from `/Users/danil/Desktop/excelsupreme` on `30629e8`, Node `v25.9.0` (macOS, arm64).

| Row | Status | Evidence |
|---|---|---|
| 1 | **closed** | `npm run content:check` → `content: 16 of 88 catalogued lessons, 16 groups, 20 screens, 268 fixtures replayed` then `✓ content passes — 111 accepted and 157 rejected formulas agree with the grader` |
| 2 | **closed** | `node --test tests/golden.test.js` → `ℹ tests 2`, `ℹ pass 2`, `ℹ fail 0` |
| 3 | **closed** | `node --test tests/schema-v2.test.js tests/content.test.js` → `ℹ tests 75`, `ℹ pass 75`, `ℹ fail 0` (re-pinned 2026-10-29: `content.test.js` gained a shortcut-acceptance test when lesson 03 shipped a chord and a sequence) |
| 4 | **closed** | `node --test tests/fixtures.test.js` → `ℹ tests 78`, `ℹ pass 78`, `ℹ fail 0` (re-pinned 2026-10-29: gained *keeps formula fixtures off a shortcut screen*) |
| 5 | **closed** | Scaffolder run against a temp copy: `✓ created content/exercises/17-xlookup-with-a-fallback-when-nothing-matches.json — "XLOOKUP with a fallback when nothing matches" (lookup, Intermediate)`, `takes catalog slot 43, published as lesson 14 of 17`, then `content: 17 of 88 … 19 screens, 281 fixtures replayed` and `✓ content passes — 117 accepted and 164 rejected formulas agree with the grader`. `legacy/content/` was not touched (`content:check` still reports 16 of 88). |
| 6 | **closed** | `node --test tests/build.test.js` → `ℹ tests 45`, `ℹ pass 45`, `ℹ fail 0` |
| 7 | **still open** | Human accuracy review is 5 of 10 through cohort two and needs a person reading lessons against Excel. Content-blocked and human-blocked. |

The content-scope rows (72 lessons, 7 groups without drills) cannot close in this session: they need
authoring, not verification. See the "Stop before content authoring" note in the foundation plan.

## Baseline

| Metric | Value |
|---|---|
| Catalogued lessons | 88 |
| Authored lessons | 16 |
| Groups catalogued | 16 |
| Groups with drills / pages | 9 |
| Groups with intro copy and no page | 7 |
| Screens | 20 — 17 `formula`, 1 `picture`, 1 `chord`, 1 `sequence`, 0 `workbook` |
| Fixtures replayed | 268 (111 accepted, 157 rejected) |
| Fixture test count | 78 |
| Schema + content test count | 75 |
| Free lessons | 5 |
| Cohort two progress | 5 of 10 |
| Fixture floor per lesson | 6 accepted + 6 rejected (`MIN_FIXTURES`) |
| Golden snapshot | 2 tests, byte-stable |
