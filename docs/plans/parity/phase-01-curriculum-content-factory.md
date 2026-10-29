# Phase 1 — Curriculum model and content factory


> Part of the [reference-parity plan](00-overview.md). This file is self-contained:
> scope, work breakdown, acceptance criteria, tests and risks for this phase only.

**Duration:** 2 weeks tooling + 8–12 weeks content (runs in parallel from here on)
**Depends on:** phase 0 · **Blocks:** phases 2, 3, 7

---

## Objective

Turn content from "10 hand-written JSON files" into a factory: a versioned schema that expresses
multi-screen lessons and all five screen types, a validator that makes bad content impossible to
merge, an authoring CLI, the full 88-lesson catalog as metadata, and the 16 curriculum groups with a
curated recommended order.

Engineering is 2 weeks. The rest of the phase is writing, and it is the longest pole in the whole
program.

## Scope

**Tooling**
- Schema v2 for lessons and screens (see overview §7) with `schemaVersion`.
- `packages/content-lint`: validation, fixture enforcement, link checking, duplicate detection,
  reading-level check on prompts.
- Authoring CLI: `content:new`, `content:check`, `content:fixtures`, `content:preview`.
- A local preview route that renders any lesson and steps through its screens with fixtures.

**Content**
- `content/tracks/excel.json`: 88 lessons (number, slug, title, group, order), 16 groups, recommended
  order. **Metadata only** — numbers, titles and grouping are facts about the syllabus; every
  question and explanation is written fresh.
- 14 category page definitions (15 groups are surfaced; `combined` folds into the dashboard, matching
  the reference which has no combined page).
- Authored lessons, in cohorts of 10, starting with lessons 1–10 rewritten into schema v2.

## Status

- [x] **1. Schema v2, model only.** `packages/content/schema.js` owns the lesson schema now:
      `normalizeLesson(raw, file)` reads `schemaVersion: 1` (the flat lesson) or `2` (`screens[]`) and
      returns one shape — `{ id, slug, level, title, docs, schemaVersion, screens[] }` with **no**
      per-screen field left at the top level, so a renderer cannot read the stale copy. v1 labels its
      errors with an empty screen prefix, which is why every existing `content/…` message is
      byte-identical; v2 prefixes them `screens[N].`. Screen types outside
      `formula | chord | sequence | picture | workbook` fail, and so do known types that do not render
      yet — a page with a drill nobody can pass is worse than a red build. Prompt limits split: 160 for
      v1 (its layout), 220 for v2. `screenAt(lesson, index)` is the single accessor; the player passes
      an index, everything else takes screen 0. `tests/schema-v2.test.js` (17 tests) pins the window. Ambiguous files are refused rather than guessed
      at: `screens[]` on a lesson that is not version 2 fails (it would render the flat drill and drop
      the screens), and so does a version 2 lesson that still carries flat screen fields at the top
      level — the migration in step 9 has to be a real move, not a copy.
- [x] **2. Fixtures.** Every screen must ship six accepted and six rejected formulas (the plan asks
      for twelve; six is the floor CI refuses to go under), and each one is replayed through the real
      grader in both directions — an accepted formula that grades `ok: false` is a broken drill that
      only a replay catches. A rejection may declare its rule; when it does, the grader's rule must
      match, which is what keeps `hints` honest. The strongest check is coverage of failure paths:
      every rule the screen advertises (`require` ids, `forbid` ids, `rules` ids, `require-ref`,
      `syntax`, `value`, `error`) must be produced by at least one rejection, so no hint ships
      unreachable.
- [x] **3. Validator.** `npm run content:check`, wired into `npm run check` and CI. It fails on
      duplicate prompts, prompts over one sentence (warning — a capstone may name three techniques in
      one long sentence), links to pages the site does not emit, fixture files belonging to no lesson,
      and two sources of truth for one screen (inline fixtures plus a sidecar). Where fixtures live is
      decided by shape: v2 carries them on the screen, v1 keeps the `tests/fixtures/<id>.json` sidecar
      until it is migrated. Dead links resolve against `LESSON_BASES`, which is the two bases the site
      publishes — `/learn/excel/<slug>` (canonical, what the Next app serves) and `/excel/<slug>` (the
      static build, which `next.config.mjs` permanently redirects onto the canonical one). There is no
      `/lessons` namespace and no bare lesson index page, so a link to either fails in the gate rather
      than 404ing in production; a test reads `lib/site.js` and `next.config.mjs` and fails if either
      base moves without this list.
- [x] **4. CLI.** Four commands, all on `content-lint`, all wired as npm scripts. `check` is the gate
      and `fixtures --lesson NN` is the author's table; both shipped with the validator. `new` fills the
      first planned slot — in `--group` when one is named, the first planned slot anywhere otherwise —
      and this is the one place a planned entry becomes an authored one, so a lesson cannot be created
      somewhere the site does not look for it. The slot hands over title, level and group; the slug is
      derived from the title so a URL is never a second decision; `--lesson` is the number stamped on
      the *file* and must be the next free one, because ids are dense and follow the order lessons were
      written in. That is deliberately not the published number, which is position among authored
      lessons: scaffolding into `lookup` today writes `11-…` and publishes as lesson 8, and the command
      prints both, plus how many lessons move up. What it writes is the smallest drill that passes
      every rule (SUM over two cells, six accept + six reject, a hint per advertised path, validating
      docs), because a skeleton that fails the gate teaches an author to stop trusting the gate; the
      prompt and `docs.explain` say "replace this scaffold" in place, so an unedited scaffold reads as
      unfinished. `preview` prints the page a reader gets — title and URL, level, group, trial status,
      prompt, the grid with the target cell marked, docs, hints by rule id, and the fixture table — and
      runs off the loader rather than the linter, so it works on a lesson that does not yet pass.
      `tests/content-lint.test.js` scaffolds into a sandbox and then runs `check` on the result, which
      is the acceptance criterion below enforced rather than asserted: the file, the rewritten slot and
      the 11-of-88 tally are all checked after the CLI writes them.
- [x] **5. Catalog.** `content/track.json` is the site map: **16 groups and 88 lesson slots** (10
      authored, 78 planned), one file instead of the `content/tracks/excel.json` this plan named —
      the repo already had `track.json`, and a second track file would be the same two-answers
      problem the fixture rules refuse. A slot is authored when it carries an `id` and planned when it
      carries `title` + `level`; there is no `status` field, so the two cannot disagree with the file.
      An authored entry names only its id and group — title, slug and level stay in the lesson file,
      and carrying either here fails the loader. `group` is a **tag, not a block**: list order is the
      order learners meet lessons, so the 10 live drills keep their shipped numbering while planned
      slots sit beside the lesson they follow from. Published numbering is position among *authored*
      lessons, which is why inserting a slot never renumbers a page and publishing one does.
      `normalizeTrack()` owns the structure (unknown group, duplicate group id, planned entry with no
      level, group with no lessons, no authored entry, `freeLessonCount` above the authored count) and
      `loadContent()` cross-checks the authored ids against the files; `tests/track-schema.test.js`
      (13 tests) pins every error path. The catalog replaces three things the reference site covers
      that a formula grader cannot grade — keyboard shortcuts, cell-selection click-paths, pivot
      tables and the dashboard walkthrough — with three it can: `rounding`, `errors`, `aggregate`.
      `npm run catalog:reference` prints the reference's 17 categories and 7 empty slots next to our
      16 groups, mapping each one; it reads the gitignored `reference/` mirror, so it stays out of CI
      and degrades to a note when the mirror is absent; a row it cannot read as either a lesson or an
      empty slot fails the run instead of quietly shrinking the inventory. The lint grew two catalog
      rules: duplicate titles across planned and published slots are errors, and a group a learner can
      reach with no `intro` is an error too — the copy lands in step 6, and the rule was scoped to
      reachable groups so a group whose lessons are all still planned owes nothing.
      `tests/build.test.js` pins the ordering contract with a catalog whose order disagrees with the
      filenames; the shipped corpus cannot prove it, because there the two orders are the same list.

The renderer moved with the model rather than after it: `exercise-page.mjs`, `sheet.mjs` and
`verify.mjs` now resolve `screenAt(entry.exercise)` and read the drill off the screen, so there is no
window in which two shapes are both live.

- [x] **6. Groups.** All 16 groups carry an `intro`: 150–250 words each, authored here rather than
      lifted, because these are the pages search traffic lands on and a caption would be worse than
      nothing. Each one names the functions the group actually teaches, states which levels its slots
      sit at, and says which of them already run, so the copy cannot drift quietly out of date with
      the catalog beside it. With the copy written the lint rule became an error: a group with a
      published lesson and no `intro` fails `content:check` instead of warning, while a group whose
      lessons are all still planned owes nothing. `tests/content-lint.test.js` pins both sides —
      stripping every intro from a catalog copy yields exactly one error naming the nine reachable
      groups, and stripping the one from a planned-only group yields none — and a third test keeps
      the shipped 16 inside the word range the plan asked for. The temporary invariant that read
      `app/` and promised to flip the rule when a category page appeared is gone along with its
      reason: severity no longer depends on which routes exist.

## Out of scope

- Player UI (phase 2) beyond what the preview needs.
- Server persistence — progress stays local until phase 4.
- SQL content (phase 8).

## Work breakdown

1. **Schema v2.** Extend `content/exercises/*.json`: `screens[]` replaces the single-shot lesson;
   screen `type` ∈ `formula | chord | sequence | picture | workbook`; keep `require`/`forbid`/
   `requireRef`/`rules`/`hints`/`docs` at screen level.
2. **Fixtures.** Every screen declares `fixtures: { accept: string[], reject: string[] }`. Reject
   cases must cover: wrong function, wrong argument count, wrong reference, wrong value, syntax
   error, and "right answer, wrong technique". Minimum 6 + 6.
3. **Validator.** `content:check` fails on: unknown schema version, missing fixtures, duplicate screen
   ids, unreferenced categories, a lesson number with no track entry, category count mismatch, dead
   internal links, a prompt over 220 characters.
4. **CLI.** `content:new --lesson 11 --group lookup` scaffolds the file with a passing skeleton;
   `content:fixtures --lesson 11` runs every fixture through the grader and prints a table;
   `content:preview --lesson 11` renders it locally.
5. **Catalog port.** Script reads `levelInfo.js` from the mirror (research only) and emits
   `content/tracks/excel.json` with numbers, titles and groups. Curate the recommended order by hand
   — the reference's order is a sensible starting point, but groups should be re-sequenced for our
   own lesson content.
6. **Groups.** Define the 16 groups with slug, title, short intro (150–250 words, authored), and
   lesson membership. Category intros are real content, not filler: they are the SEO landing copy.
7. **Authoring guide.** `docs/content-authoring.md`: voice, difficulty ladder, prompt style
   (imperative, one action), how to write a hint per failure code, the fixture checklist, a worked
   example lesson.
8. **Cohorts.** Publish lessons in batches of 10; each batch must pass `content:check` and a human
   accuracy review before merge.
- [x] **7. Authoring guide.** `docs/content-authoring.md` is the whole procedure in one page: the loop
      (`content:new` → `preview` → `fixtures` → `content:check` → `npm test`), what a lesson file is,
      the identity rules (`id` = file name, kebab slug, title unique across all 88 slots), the level
      ladder, prompt style, grid and expectation design, the four ways a screen constrains an answer,
      the fixture checklist, the `docs` block, and the catalog slot. It is written against the code
      rather than from memory: every limit it states is the limit the loader or the gate enforces, and
      the failure messages it quotes are the strings `content:check` actually prints, so an author can
      match what they see to what they read. Two decisions are worth keeping. **The worked example is a
      real lesson, not a sketch:** the VLOOKUP approximate-match drill in the guide was built in a
      sandbox copy of the corpus and run through the gate — 6 accepted and 7 rejected fixtures, 167
      fixtures replayed, `✓ content passes` — so the example cannot document a lesson that does not
      ship. **The fixture rules are stated as the gate checks them:** `rule` is compared to the
      grader's verdict rather than trusted, rules run before evaluation (which is why
      `=VLOOKUP(A6,A2:B5,2,FALSE)` is filed under `match-type` and not `#N/A`), and every advertised
      rule must be reached by a rejection. The README's "Adding lesson 11" now leads with `content:new`
      and links the guide instead of restating it; its stale `≤160 chars` prompt limit went with the v1
      shape.
- [x] **9. Migration.** All ten lesson files are `schemaVersion: 2` with one `screens[]` entry each,
      and the ten sidecars under `tests/fixtures/` are deleted. The move is provable because nothing
      observable moved: `tests/golden/snapshot.json` is byte-identical, which required
      `tests/golden/capture.mjs` to normalize the lesson and grade its first screen instead of reading
      the flat file plus its sidecar. `content:check` still reports 10 lessons, 10 screens and 154
      fixtures replayed, and `next:build` still emits the same 11 pages.

      Three decisions are worth keeping. **The screens own their fixtures, reasoning included:** a v2
      `reject` list holds `{ formula, rule, why }`, not bare formulas, so the reason a case is wrong
      travels with the case it explains and the gate can check the *claim* (`rule`), not only the
      verdict. `validateScreen` therefore reads `entry.formula` when the entry is an object and keeps
      accepting the bare string; without that, the loader would have refused every migrated lesson
      while the linter linted it happily — the two had specified the shape apart. **Nothing had to be
      duplicated to keep the old shape working:** `tests/lessons.js` normalizes the corpus once and
      hands each test either the merged single-screen `exercise` or `toV1()`, so `content.test.js`,
      `fixtures.test.js`, `build.test.js` and `client.test.js` read one bridge instead of each
      reimplementing the flatten; `toV1` deliberately drops `fixtures`, because a v1 lesson keeps
      those in its sidecar and putting them flat would describe a shape v1 never had. **The sidecar
      path stays readable, and tested:** `content-lint` still accepts a flat lesson with
      `tests/fixtures/<id>.json`, still refuses a v2 lesson that left its fixtures behind, and still
      refuses both at once; `check` needs no fixture directory at all now, which a test pins, because
      silently creating it would hide the day a lesson loses its fixtures.

- [ ] **8. Cohorts.** Ten lessons per batch, each green in `content:check` and through a human
      accuracy review before it merges. **Cohort two is 2 of 10 in.** Lesson 11 is VLOOKUP approximate
      match (`11-vlookup-approximate-match-needs-a-sorted-column`), catalog slot 37, published as
      lesson 8 of 11 — the first file whose number disagrees with where the page sits, because the
      slot decides the reading order and the file name only records the order lessons were written.
      The drill is a commission band table read with `TRUE`; `match-type` (the fourth argument) is the
      rule the lesson exists for, so `=VLOOKUP(A6,A2:B5,2)` and `=VLOOKUP(A6,A2:B5,2,FALSE)` are both
      rejected on it, while `=VLOOKUP(A6,A2:B5,2,1)` is accepted because Excel's `1` is `TRUE`.
      Expected value `0.05` was computed by hand before the JSON (`docs/phases/02-exercise-content.md`
      records the arithmetic) and pinned in `tests/audit.js`, and the `[answer]` cell, the six hints
      and the four `docs` errors were read through `content:preview` rather than the JSON.

      Publishing it exposed a maintenance trap worth recording: eleven assertions across eight files
      hardcoded *the corpus* — 10 lessons, 154 fixtures, 11 pages, "10 of 88", "the next free number is
      11". Every one now derives its number from what it is actually checking (files on disk, the
      catalog, the sitemap being read, `lessons.length + 1`), so a cohort no longer costs a hunt
      through the suite — the three Playwright specs, which `check` does not run, carried four of
      them and were already red. The two literals that stayed are the ones that are the specification: 88
      catalog slots and 16 groups. `tests/golden/snapshot.json` grew by 25 lines and lost none, which
      is what a new lesson should look like in a record of every grader verdict.

      Lesson 12 is HLOOKUP read across the header row of a monthly price sheet, and it cost the grader
      a function rather than costing content a shape: `HLOOKUP` was in the catalog and not in the
      evaluator, so the drill could not be authored honestly without it. VLOOKUP and HLOOKUP are now
      one `axisLookup` walk that differs only in which edge holds the keys and which the index counts,
      and VLOOKUP's messages are byte-identical afterwards — the golden snapshot and the 90 grader
      tests proved the refactor behaviour-preserving before the three HLOOKUP tests landed. It also
      settled a table-shape question the phase had not asked: HLOOKUP's range has to start at the key
      row, so the label column stays outside `B1:D3`, and the first draft of the grader fixture did not
      — `=HLOOKUP(4200,A1:D2,2)` read the label cell and answered #N/A.

## Acceptance criteria

- [x] `content:new --lesson 11` produces a file that renders, grades and passes `content:check` with
      no framework knowledge.
- [x] CI fails when any screen lacks 6 accepted or 6 rejected fixtures.
- [x] Every fixture verdict matches its declared expectation across all authored lessons.
- [ ] `content/tracks/excel.json` contains 88 lessons and 16 groups; counts match the catalog.
- [x] 10 migrated lessons keep their existing behaviour (golden snapshots from phase 0 unchanged).
- [x] Category intros authored for all 16 groups (150–250 words each, enforced by a test).
- [x] `docs/content-authoring.md` exists and a second person can author a lesson from it unaided.

## Content throughput assumption

10–15 screens per author-day including fixtures and review. 88 lessons × ~7 screens ≈ 600 screens
≈ 8–12 author-weeks. Plan the calendar around content, not around code.

## Test plan

| Test | Type |
|---|---|
| Schema accepts a valid lesson, rejects each malformed variant (12 cases) | unit |
| Every screen's fixtures pass (accept) and fail (reject) | integration, runs in CI |
| Catalog counts: 88 lessons, 16 groups, no duplicate numbers | unit |
| Migration: v1 lesson → v2 loader output identical verdicts | golden |
| CLI: scaffold → check → preview completes headlessly | e2e |

## Risks

| Risk | Mitigation |
|---|---|
| Fixture rule feels heavy and gets bypassed | CLI generates the skeleton; the check is one command |
| Content quality drifts across authors | authoring guide + reviewer checklist + 10-lesson calibration batch |
| Scope creep into "content CMS" | JSON in git is the CMS; no admin UI for content |
| Schema churn after lessons are written | freeze v2 at end of week 2; additive changes only |
