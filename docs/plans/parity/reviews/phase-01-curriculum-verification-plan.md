# Phase 1 — Curriculum Content Factory: Verification Plan

Scope: the content pipeline — schema v2, the linter, the fixture-replay grader contract, the
`content:new` scaffolder, the golden snapshot, and the authored lessons themselves.

## Assessment

**Solid tooling, High Risk on scope.**

The factory works and is proven: 16 lessons across 22 screens and 268 fixtures validate, and every
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

**2. The curriculum uses all five screen types — closed 2026-10-29.** Of 21 shipped screens, 17 are
`formula`, 1 `picture`, 1 `chord`, 1 `sequence` and 1 `workbook`. The shortcuts were added to lesson 03
and the workbook to the capstone (`10-capstone-margin`, which asks for a margin read from a
downloaded `.xlsx`), so every renderer has a page a visitor can reach. It took three screens and a
pipeline change to get there: `formula`-only assumptions in `tests/content.test.js`, the golden
capture, the build payload contract and `tests/audit.js` all had to learn the new type, which is the
same lesson in miniature — a type that ships without content stays untested where it matters. See
failure mode 1 in the phase-2 doc.

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
| 1 | `npm run content:check` | `content: 16 of 88 catalogued lessons, 16 groups, 22 screens, 268 fixtures replayed` and `✓ content passes — 111 accepted and 157 rejected formulas agree with the grader` | A lesson violates v2, or a fixture's expected verdict disagrees with the grader. The disagreement is the real signal: either the lesson or the grader is wrong. |
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
| 1 | **closed** | `npm run content:check` → `content: 16 of 88 catalogued lessons, 16 groups, 22 screens, 268 fixtures replayed` then `✓ content passes — 111 accepted and 157 rejected formulas agree with the grader` (re-pinned 2026-10-29 from `18 screens` → `20` → `21` → `22` as screens shipped; the verdict counts never moved) |
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
| Screens | 21 — 17 `formula`, 1 `picture`, 1 `chord`, 1 `sequence`, 1 `workbook` |
| Fixtures replayed | 268 (111 accepted, 157 rejected) |
| Fixture test count | 78 |
| Schema + content test count | 75 |
| Free lessons | 5 |
| Cohort two progress | 5 of 10 |
| Fixture floor per lesson | 6 accepted + 6 rejected (`MIN_FIXTURES`) |
| Golden snapshot | 2 tests, byte-stable |

## Re-pin after the content push (2026-10-30)

Everything above is the state of this verification run — 16 of 88 authored, 268 fixtures — and it
stays as written. The catalog has since been authored out. This section records the same gate rows
re-run against the current tree, run from `/Users/danil/Desktop/excelsupreme` on branch
`phase-0-port-shell`. Nothing above is edited to match it.

| Row | Status | Evidence (re-run 2026-10-30) |
|---|---|---|
| 1 | **closed** | `npm run content:check` → `content: 88 of 88 catalogued lessons, 16 groups, 152 screens, 1946 fixtures replayed` then `✓ content passes — 903 accepted and 1043 rejected formulas agree with the grader` |
| 2 | **closed** | `node --test tests/golden.test.js` → `ℹ tests 2`, `ℹ pass 2`, `ℹ fail 0` (snapshot grew to 88 lessons, 2492 verdicts) |
| 3 | **closed** | `node --test tests/schema-v2.test.js tests/content.test.js` → `ℹ tests 78`, `ℹ pass 78`, `ℹ fail 0` |
| 4 | **closed** | `node --test tests/fixtures.test.js` → `ℹ tests 598`, `ℹ pass 598`, `ℹ fail 0` |
| 5 | **closed, with the refusal as the evidence** | `node packages/content-lint/cli.js new --lesson 89 --group lookup --content "$TMP"` → `group "lookup" has no planned slots left — add one to track.json before scaffolding a lesson in it`. With every slot authored there is no free slot to scaffold into, so the row's own command cannot be replayed as written; the flow is covered by `node --test --test-name-pattern "scaffolds a lesson" tests/content-lint.test.js` → `ℹ tests 1`, `ℹ pass 1`, which appends a planned slot to a sandbox catalog and then scaffolds, lints and passes against it. |
| 6 | **closed** | `node --test tests/build.test.js` → `ℹ tests 45`, `ℹ pass 45`, `ℹ fail 0` |
| 7 | **still open** | Unchanged in kind: a person has to read lessons against Excel. It now covers 88 lessons rather than 16 |

The content-scope rows are closed: 0 of 88 remain `planned`, 0 groups lack drills, and every group
has a page (`verified 88 lesson pages, the index, the dashboard, the pricing page and 16 group pages
— 4378 checks passed`). The three array lessons that finished the catalog are 86-88, and authoring
them turned up one engine bug that is now fixed rather than recorded: `UNIQUE` answered multi-column
ranges with column 1 only. See the superseded-scope note in
`docs/plans/parity/phase-01-curriculum-content-factory.md`.
