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
      accuracy review before it merges. **Cohort two shipped through lesson 16, cohort three as ten
      lessons, 17–26, and cohort four as ten more, 27–36.** Lesson 11 is VLOOKUP approximate match (`11-vlookup-approximate-match-needs-a-sorted-column`), catalog slot 37, published as
      lesson 8 of 12 — the first file whose number disagrees with where the page sits, because the
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

      Lesson 13 is the same function with the lookup value built instead of given: `A7&"*"`, catalog
      slot 39, published as lesson 10 of 13 — which pushed the capstone and the INDEX/MATCH pair one
      place later in the reading order without touching their URLs. It cost the grader nothing, and that
      is the interesting part: wildcard matching, the exact-match gate and the `matchType` rule were all
      already in place, so the lesson is one JSON file and its `AUDIT` row. What it has to teach is the
      pairing rather than the wildcard alone — the pattern only matches under `FALSE`, so
      `=VLOOKUP(A7&"*",A1:C6,3)` and `...,3,TRUE)` are both rejected on `match-type`, and the bare name
      `=VLOOKUP(A7,A1:C6,3,FALSE)` is rejected because it stops at #N/A. It also refuses the right answer
      by the wrong route: `=INDEX(C1:C6,MATCH(A7&"*",A1:A6,0))` returns 7 and is rejected on
      `func-vlookup`. One grader gap surfaced while authoring and was left open deliberately: wildcard
      matching has no `~` escape, so `COUNTIF(A2:A9,"~*")` and friends diverge from Excel, and cycle
      detection stays off while lesson 09's reference formula reads the cell it fills.

      Lesson 14 is the first drill with two keys and no new machinery: `=VLOOKUP(A6,A1:C5,MATCH(B6,A1:C1,0),FALSE)`
      is catalog slot 40, published as lesson 11 of 14, and it is four rules that already existed —
      `func-vlookup`, `func-match`, a `match-exact` on MATCH's third argument and a `match-type` on
      VLOOKUP's fourth. The drill's whole
      arithmetic is the offset contract: `MATCH` counts inside the range it is given and `VLOOKUP` counts
      from the first column of its table, so the right answer read over `B1:C1` returns 90 on `value`
      rather than 110, which is the mistake the lesson exists to catch. It also exposed the limit of
      `requireRef` — one cell, so `B6` is enforced and a hardcoded product name still passes — and that
      is now written down in phase 2 rather than worked around in content.

      Lesson 15 is the first XLOOKUP drill and the first lesson where the answer column is not the one
      the key sits in: `=XLOOKUP(A6,A2:A5,D2:D5)` reads the third SKU and returns the third price,
      catalog slot 41, published as lesson 12 of 15. The evaluator already had XLOOKUP, so the work was
      content, and the drill teaches the parallel walk rather than the argument list — the cost column
      sits between the keys and the prices precisely so that `C2:C5` is a wrong answer with a plausible
      number in it. Match mode is deliberately *not* a rule: exact is XLOOKUP's default, and a
      `matchType` on the fifth argument rejects a missing argument, so enforcing it would force learners
      to write `,,0` to say what the default already says.

      Authoring it caught a defect in the factory rather than in the lesson: `content:new` emitted
      string rejections while the corpus is `{ formula, rule, why }` and `npm test` demands the object,
      so every scaffolded lesson failed the gate seconds after a CLI message claimed its fixtures
      already worked. The scaffold now writes the objects, `content:check` refuses a bare string or a
      short `why` at the same threshold the test uses, and a test pins the scaffold's own output so the
      two cannot drift again.

      Lesson 16 closed cohort two. Cohort three then shipped as one batch of ten, lessons 17–26, on
      the same vertical slice: `content:new` scaffold, full rewrite, every fixture replayed through the
      real `grade()` before the gate, one `AUDIT` row per screen, then the three gate commands. The ten
      files, their catalog slots and where the catalog now publishes each one:

      | File | Slot | Published | Teaches |
      |---|---|---|---|
      | `17-min-and-max-fastest-and-slowest` | 13 | 3 | MIN and MAX over one column |
      | `18-count-numbers-only-and-what-it-skips` | 20 | 5 | COUNT, and the three things it skips |
      | `19-counta-count-the-non-empty-cells` | 21 | 6 | COUNTA on a checklist of blanks |
      | `20-roundup-and-rounddown-one-direction-only` | 34 | 10 | the two one-way rounds, 476 / 12 |
      | `21-xlookup-with-a-fallback-when-nothing-matches` | 43 | 18 | XLOOKUP's fourth argument |
      | `22-match-find-a-value-s-position` | 47 | 20 | MATCH's third argument, on unsorted data |
      | `23-index-a-value-at-a-row-and-column` | 48 | 21 | INDEX with a row and a column |
      | `24-len-left-and-right-count-and-cut` | 53 | 23 | LEN, LEFT, RIGHT on a 15-character code |
      | `25-concat-and-the-operator` | 65 | 25 | CONCAT, and why the space is an argument |
      | `26-iferror-catch-the-error-show-your-text` | 69 | 26 | IFERROR around a failed lookup |

      Five of the ten are drills whose rule is arithmetic rather than syntax: lesson 18's grid holds
      `n/a`, a blank and the text `7` so that a count of 3 is the whole lesson; lesson 20 plays 39.67
      both ways so that `ROUNDUP` → 40 and `ROUNDDOWN` → 39 are two screens of one sheet, with a
      `matchType` on the digits argument so `,2)` is rejected with a plausible number in it; lesson 24
      measures `Invoice 2026-03` at 15 characters before cutting `Inv` and `6-03` off it. The rest are
      argument-shape drills and reuse rules that already existed: `func-count`, `func-counta`,
      `func-roundup`, `func-xlookup` (min 4 args, which is what forces the fallback), `func-match` with
      `match-exact` on argument 3, `func-index` (min 3, so the column cannot be dropped),
      `func-concat` (min 2, so the space has to be passed), `func-iferror` (min 2). No grader function
      was added for this batch, and no rule type was either.

      Four traps, all recorded because they will recur in the next batch:

      **The published number moves, and money follows it.** Slots decide the reading order, so
      publishing slot 20 at position 5 pushed `03-countif-open-tickets` from #3 to #4 — past
      `freeLessonCount: 3`. The drill at the boundary now shows the `#grace-pass` button, not the
      `#paywall-email` form that later lessons show, so the Playwright helper `passGate(page)` races
      `#paywall` against `#formula` and falls back to whichever control is actually on screen. Two
      specs asserted the old free/paid handover and one asserted `"1 of 16"`; all three now derive
      their numbers from `loadSite().index.length` and the gate helper.

      **Three corpus-wide assumptions were in the suite, and all three now derive.** `content:new`
      shifting the catalog turned `tests/content.test.js`'s advertised task count red, and the two
      catalog lint tests picked a literal group (`text-change`) that had no published lessons and
      asserted a literal list of nine intro-less groups. They now compute the owed-intro set from
      `track.json` (`entry.group === group.id && entry.id`) and pick the first group whose lessons are
      all still planned, so shipping a lesson into a new group cannot go stale again. The published
      task count in `track.json`'s `promise` is content, not a test assumption, and was bumped to 26.

      **Titles now need escaping to be found on a page.** `paywall.test.js` asserted
      `body.includes(candidate.exercise.title)`, which held until the first title with an apostrophe
      (`MATCH: find a value's position`) arrived and the page emitted `&#39;`. The assertion now
      compares against `esc(title)` — what the renderer actually emits — rather than the raw title.

      **The evaluator diverges from Excel in three places content has to work around.** `COUNT(B2,B3,B4)`
      coerces numeric text passed as a scalar argument and counts it, so a multi-argument count is not
      the same answer as a range count and cannot be used as a second accepted form. A trailing comma
      (`,)`) leaves an argument slot empty, which a `matchType` rule reads as *absent* rather than as
      the default, so `=ROUNDUP(B5/12,)` is rejected on `whole-crates` — Excel would accept it. And a
      grid must be rectangular: `["Row to read", 3]` under a four-column header is refused with
      `rows[4] has 2 cells, expected 4`, so the label rows in an INDEX grid are padded with `null`.

      Gate output for the batch, verbatim: `tests 884`, `suites 144`, `pass 884`, `fail 0`;
      `content: 26 of 88 catalogued lessons, 16 groups, 36 screens, 444 fixtures replayed`;
      `✓ content passes — 195 accepted and 249 rejected formulas agree with the grader`;
      `built 42 pages (1505.3 kB of HTML+CSS)`; `next routes: 42 prerendered pages match the shared
      templates`; `verified 26 lesson pages, the index, the dashboard, the pricing page and 11 group
      pages — 1382 checks passed`; `82 passed (14.0s)` from `npx playwright test`; `vendor: 25 files
      match manifest.json`; `pass 129` from `db:check`. `tests/golden/snapshot.json` grew by 271 lines
      and lost none — additive only is what a new lesson has to look like in a record of every verdict.

      One gap this batch walked up to and did not cross: `require` must hold at least one function, so a
      lesson whose whole point is a comparison — slot 26, "TRUE and FALSE" — cannot be authored with
      today's rule types. It stays `planned` until a rule type exists for it; authoring it as a
      function drill would teach something else.

      Cohort four shipped as the next batch of ten, lessons 27–36, on the same slice — scaffold, full
      rewrite, every fixture replayed through the real `grade()`, one `AUDIT` row per screen, three gate
      commands. Only two groups were reachable end to end, because a group whose first planned slot
      needs a grader function the evaluator does not have stays blocked until the evaluator grows it.
      What shipped, and where the catalog now publishes it:

      | File | Slot | Published | Teaches |
      |---|---|---|---|
      | `27-what-a-formula-actually-does` | 1 | 1 | the first formula, SUM over one column |
      | `28-cell-references-relative-and-absolute` | 2 | 2 | `$` anchoring, and what moving a formula does |
      | `29-autosum-and-the-status-bar-total` | 3 | 3 | AutoSum as a shortcut for SUM |
      | `30-vlookup-and-xlookup-on-the-same-table` | 44 | 22 | VLOOKUP and XLOOKUP against one table |
      | `31-lookup-functions-summary` | 45 | 23 | picking the right lookup for the job |
      | `32-index-match-look-left-of-the-key` | 49 | 27 | INDEX/MATCH with a key on the right |
      | `33-two-way-index-match` | 50 | 28 | row and column read by two MATCHes |
      | `34-index-and-match-summary` | 51 | 29 | INDEX/MATCH against a whole 2-D range |
      | `35-textjoin-join-a-range-and-skip-blanks` | 66 | 34 | TEXTJOIN's delimiter and ignore-empty |
      | `36-upper-lower-and-proper` | 67 | 35 | UPPER, LOWER and PROPER on one name |

      The intro group now has lessons in the slots the catalog reserved for it, which moved the free
      handover for real: `freeLessonCount: 3` is still the documented decision ("the opening drills are
      the free entry point"), but the opening drills are the intro ones now, so `01-sum-basics` is
      published 4 and sits behind the gate. Fifteen Playwright tests drove `/learn/excel/sum-basics`
      and read `#formula`; they now drive the first free drill, resolved once in `lib/site.js` as
      `freeDrill()` so a catalog that moves the boundary again fails in one place instead of five.
      Their literals stayed hand-computed against that drill (35 crates in `B5`, `=SUM(B2:B3)` → 21),
      and the arrow-key walk was re-cut for its `A1:B5` block. `freeLessonCount` was not raised to keep
      the old lesson free: the count is a product decision and the tests follow it, not the reverse.

      The rest of the batch is argument-shape drills over rules that already existed — `func-sum`,
      `func-vlookup` (min 3, without it a missing fourth argument is filed `func-vlookup` instead of
      `exact-match`), `func-xlookup`, `func-index` (min 3), `func-match` with `match-exact`,
      `func-textjoin` (min 2, so the delimiter has to be passed), `func-upper`, `func-proper`. No
      grader function and no rule type was added.

      Three traps, and the corpus-wide test assumptions that went stale under them (the same shape as
      cohort three's, which is why they are recorded rather than fixed once):

      **A text answer cannot be coaxed with arithmetic.** `=UPPER(B2)&""` is a string and grades, but
      `=UPPER(B2)+0` is `#VALUE!` in this evaluator, so a "two ways to say it" second accepted form has
      to be a spelling the evaluator really accepts. Same for lookups: `=XLOOKUP(...)+0` on a text
      column is an error, not a tolerance.

      **`requireRef` is a hard gate, so every reject has to name the cell.** A fixture that never
      references the answer's reference cell is filed `require-ref` before its rules or its evaluation
      are consulted, which silently reclassified a `value` reject in lesson 32 into a `require-ref`
      one. Rejects now carry the reference explicitly, and the two-way INDEX rejects are `+0` and `*1`
      so they still read the key.

      **`tests/build.test.js` and `tests/content-lint.test.js` were still hardcoded to lesson one.**
      The mount contract (`aria-colcount`, `data-cell`, row count, ref chip), the structured-data and
      canonical assertions, the serve test's URL and both sandbox scaffold tests named `sum-basics`, a
      literal group and the scaffold's default slug. All of them now derive from `lessons[0]` or from
      the catalog, so the next cohort cannot turn them red. The published task count in `track.json`'s
      `promise` is content, not an assumption, and was bumped to 36.

      Gate output for the batch, verbatim: `tests 933`, `suites 144`, `pass 933`, `fail 0`;
      `content: 36 of 88 catalogued lessons, 16 groups, 48 screens, 600 fixtures replayed`;
      `✓ content passes — 267 accepted and 333 rejected formulas agree with the grader`;
      `built 53 pages (2441.1 kB of HTML+CSS)`; `next routes: 53 prerendered pages match the shared
      templates`; `verified 36 lesson pages, the index, the dashboard, the pricing page and 12 group
      pages — 1834 checks passed`; `82 passed (13.1s)` from `npx playwright test`; `vendor: 25 files
      match manifest.json`. `tests/golden/snapshot.json` grew and lost nothing.

      Nine groups were blocked on the evaluator, not on authoring effort: `sum` (SUMIFS), `count`
      (COUNTIFS), `statistical` (LARGE), `logical` (IFS/SWITCH/IS — and a comparison rule type, which
      `require` cannot express), `rounding` (MROUND), `errors` (IFNA), `date` (TODAY and the rest),
      `aggregate` (SUMPRODUCT/SUBTOTAL/AGGREGATE) and `arrays` (UNIQUE/FILTER/SORT). Authorable then
      without touching the engine: `text-search` (slot 54, MID), `capstone` (slot 60) and `modeling`
      (slot 85) — three lessons, not seventy-two.

### Grader extension: eight of the nine blocked groups unblocked

      `packages/content/schema.js` validates every function a lesson names in `require`/`forbid`/
      `rules` against `KNOWN_FUNCTIONS`, so a group is blocked until the function exists in the
      registry. The registry grew by roughly thirty-five functions, all of them authored to Excel's
      documented result rather than to convenience:

      - `sum`: SUMIFS, plus the `IFS` family for `count` (COUNTIFS/AVERAGEIFS/MINIFS/MAXIFS).
      - `statistical`: MEDIAN, MODE, LARGE, SMALL, RANK — each fed by ranges, because
        `aggregateNumbers` refuses scalar text but ignores text *inside* a block.
      - `logical`: IFS, SWITCH, ISBLANK, ISNUMBER, ISTEXT, ISLOGICAL, NA, ISERROR, ISNA. IFS,
        SWITCH, IFNA, ISERROR and ISNA are **lazy** in `evaluate.js` so their branches short-circuit
        — `=IFS(FALSE,1/0,TRUE,7)` is 7, not `#DIV/0!`.
      - `rounding`: MROUND, FLOOR, CEILING, with a tie rounding away from zero and the
        `sign(multiple)` rules for FLOOR/CEILING.
      - `errors`: NA and IFNA. IFNA catches `#N/A` only, never any other code.
      - `aggregate`: SUMPRODUCT, SUBTOTAL and AGGREGATE over codes 1–11 (plus 14/15 for AGGREGATE).
      - `arrays`: UNIQUE, SORT, FILTER, answered through a new `spill()` range value.
      - `logical` also needed a rule type the schema could not express: `require` could name a
        function but not an operator. `require` now accepts `{ "op": ">" }` (and the other five
        comparison operators), which `packages/grader/grade.js` satisfies by walking the AST for a
        binary node with that operator.

      Two divergences are deliberate and documented in the code. `#CALC!` does not exist in
      `packages/grader/errors.js`, so FILTER with no matches throws `#N/A`. And `=B1:B4>1000`
      returns a four-row block of booleans element-wise rather than a grid spill; comparing two
      blocks still throws, because that path is a matrix and stays unsupported.

      Gate output for the extension, verbatim: `tests 953`, `suites 151`, `pass 953`, `fail 0`;
      `content: 36 of 88 catalogued lessons, 16 groups, 48 screens, 600 fixtures replayed`;
      `✓ content passes — 267 accepted and 333 rejected formulas agree with the grader`;
      `built 53 pages (2441.1 kB of HTML+CSS)`; `next routes: 53 prerendered pages match the shared
      templates`; `verified 36 lesson pages, the index, the dashboard, the pricing page and 12 group
      pages — 1834 checks passed`; `82 passed (13.5s)` from `npx playwright test`; `vendor: 25 files
      match manifest.json`. No fixture verdict moved: 267 accepted and 333 rejected were already the
      cohort-four numbers.

      `date` is the one group still blocked, and it is blocked on a decision rather than on code.
      TODAY and NOW are volatile, and a drill's `expect.value` is a static scalar, so a date lesson
      cannot be authored unless the screen pins a clock — a field the v2 schema does not have. DATE,
      DAYS, DATEDIF and the serial arithmetic behind them are authorable today; the group's first
      planned slot is the volatile pair, so the group stays unstarted until the clock question is
      settled.

### Pinned clock: the `date` group opens

      The clock question was settled as an additive screen field rather than a new function or a new
      schema version: a screen may carry `"today": "YYYY-MM-DD"`, or `"YYYY-MM-DDTHH:MM"` when the
      drill is about the time of day as well, and the grader reads that moment for TODAY and NOW.
      `packages/grader/evaluate.js` exports `pinnedClock(today)`, `createContext(cells, { clock })`
      carries it, and `grade()` builds the context with `pinnedClock(exercise.today)`. Without a pin
      the evaluator falls back to this machine's clock, so the functions stay volatile by default and
      nothing that does not ask for a date changes. A bare date is local midnight, which is why
      `TODAY()` and `NOW()` are the same number on a date-only pin — a lesson about the time of day has
      to pin a time, and the field accepts one.

      The registry grew by twelve date functions to make the group's five planned slots authorable:
      TODAY, NOW, DATE, YEAR, MONTH, DAY, DAYS, DATEDIF, EDATE, EOMONTH, HOUR and MINUTE, plus WEEKDAY.
      Every one is written to Excel's documented result, including the parts that surprise people:
      `DATE(1800,1,1)` is 3700-01-01, because Excel adds 1900 to any year below it; month and day
      overflow rolls rather than failing (`DATE(2024,13,1)` is 2025-01-01); DATEDIF's `MD` and `YD`
      units are built out of one whole-months number so anniversary overruns decrement instead of
      drifting; EDATE and EOMONTH clamp to the shorter month. `HOUR` and `MINUTE` read the fraction of
      the day through `secondsOfDay`, so they do not inherit float noise from the serial.

      Two traps this batch walked into, recorded because both would have shipped a wrong drill:

      **The pin had to be threaded through four call sites, and the unit tests did not prove the last
      one.** `createContext` was correct, `evaluateFormula` was correct, and the fixture replay was not:
      a bare `"2024-03-15"` produced a live clock, because the `hour`/`minute` defaults in
      `pinnedClock` were the strings `"0"` and the round-trip check compared `date.getHours() !== hour`
      — `0 !== "0"`. The content replay caught it as `Your formula returns 973, but this lesson expects
      14`, which is the number of days between today and 1 March 2024. The defaults are numbers now.
      A unit test that calls `evaluateFormula(..., { today })` never touches the path `grade()` takes,
      so a pinned-clock change is only proved by replaying a fixture.

      **A screen-level `docs` block shadows the lesson's own docs.** `tests/lessons.js` builds the
      single-screen view as `{ ...identity, ...drill }`, so a screen that carries `docs` (the schema
      allows `syntax`, `explain` and `reference` per screen, each capped at 400 characters for
      `explain`) replaces the lesson's docs in that view, and the "docs read like a page" test then
      measures the screen note: 69 words against a floor of 150. The answer is not a longer screen note
      — it is no screen `docs` on a v2 screen. Per-screen reveals come from the screen's own
      `reference` field, which is what `revealOf` reads.

      Lesson 37 published slot 73, the group's first planned slot, and is the model for the other four:

      | File | Slot | Published | Teaches |
      |---|---|---|---|
      | `37-today-and-now-the-volatile-clock` | 73 | 37 | TODAY versus NOW, and HOUR reading the time of day |
      | `38-date-build-a-date-from-parts` | 74 | 38 | DATE assembling a serial from year, month and day |
      | `39-datedif-days-months-or-years-between` | 75 | 39 | DATEDIF's unit strings, and the `#NUM!` on reversed dates |
      | `40-days-and-simple-date-maths` | 76 | 40 | DAYS, and arithmetic on a serial (weeks = days / 7) |
      | `41-date-functions-summary` | 77 | 41 | TODAY + DATEDIF + EOMONTH combined over one row |

      Its two screens are the two halves of the distinction: an ageing column (`=TODAY()-B2`, pinned to
      15 March 2024, a `forbid` on NOW so the fraction of a day cannot creep in) and a log stamp read
      back with `=HOUR(B2)`, pinned to 14:30. The reject fixtures had to be reordered to match the
      grader's check order — `syntax` → `require` → `forbid` → `require-ref` → `matchType` → `error` →
      `value` — because a reject that misses a required function is filed under that function's rule
      before its value is ever computed, and the replay compares the filed rule with the reported one.

      Gate output for the batch, verbatim: `tests 974`, `suites 153`, `pass 974`, `fail 0`;
      `content: 37 of 88 catalogued lessons, 16 groups, 50 screens, 626 fixtures replayed`;
      `✓ content passes — 279 accepted and 347 rejected formulas agree with the grader`;
      `built 55 pages (2562.5 kB of HTML+CSS)`; `next routes: 55 prerendered pages match the shared
      templates`; `verified 37 lesson pages, the index, the dashboard, the pricing page and 13 group
      pages — 1894 checks passed`; `82 passed (14.9s)` from `npx playwright test`; `vendor: 25 files
      match manifest.json`. `tests/golden/snapshot.json` went to 37 lessons and 803 verdicts, 34 added,
      none changed and none removed.

      **Lessons 38–41 closed the group four batches later.** Each lesson is two screens, and each one
      teaches a single distinction rather than a function list: 38 builds a serial from its parts
      (`=DATE(B2,C2,D2)` → 45352; `=DATE(2024,B2+1,1)` → 45383, so month 13 rolls into the next year),
      39 names the unit (**`"Y"` 2 and `"M"` 38 over the same pair of dates**, with `"Q"` and a reversed
      pair both `#NUM!`), 40 contrasts DAYS with plain subtraction and then divides the day count into
      weeks (`=DAYS(C2,B2)/7` → 9), and 41 stops teaching a function and starts combining them: an age
      in whole months against a pinned clock (`=DATEDIF(B2,TODAY(),"M")` → 26) and a payment date on
      the last day of the following month (`=EOMONTH(B2,1)` → 45412). Four traps came out of the batch,
      all of them content-lint findings rather than grader findings:

      - **A grid's `answerCell` is bounds-checked against the header row.** `answerCell` was `D2` over
        a three-column header and content-lint refused it: `outside the 3x3 grid starting at A1`. The
        fix is a real column or a corrected answer cell, never a wider grid.
      - **`docs.reference` must equal `screens[0].reference`.** It is `the answer every single-screen
        surface prints`, and lesson 41's docs carried the second screen's EOMONTH answer. The docs
        block mirrors screen one's formula.
      - **`require[].minArgs` cannot be omitted casually**: the fixture replay compares the reported
        rule with the declared one, so a `require` naming a function the rejects never omit leaves its
        rule unexercised, and the coverage rule then fails the lesson as `never exercises`.
      - **`forbid` is a check-order trap, not a stylistic guard.** A `forbid` on NOW in lesson 41 was
        dropped rather than kept: `=DATEDIF(B2,NOW(),"M")` already fails the `func-today` require
        first, so `no-now` could never be reported, and declaring it would have been a rule that no
        reject exercises.

      Verbatim gate output for the batched close of the group: `tests 1006`, `suites 153`, `pass
      1006`, `fail 0`; `content: 41 of 88 catalogued lessons, 16 groups, 58 screens, 729 fixtures
      replayed`; `✓ content passes — 327 accepted and 402 rejected formulas agree with the grader`;
      `built 59 pages (3014.8 kB of HTML+CSS)`; `next routes: 59 prerendered pages match the shared
      templates`; `verified 41 lesson pages, the index, the dashboard, the pricing page and 13 group
      pages — 2086 checks passed`; `82 passed (12.8s)` from `npx playwright test`; `vendor: 25 files
      match manifest.json`.

### Two more groups: rounding closes, statistics opens

      The `rounding` group had one planned slot left and the `statistics` group had five, so the next
      batch closed the first and opened the second in one pass — six lessons, twelve screens:

      | File | Slot | Group | Teaches |
      |---|---|---|---|
      | `42-mround-and-floor-round-to-a-multiple` | 35 | rounding | MROUND to the nearest multiple, FLOOR downward only |
      | `43-large-and-small-the-nth-highest` | 14 | statistics | LARGE and SMALL picking the nth, not the extreme |
      | `44-median-the-middle-value` | 15 | statistics | MEDIAN over an even count averages the two middles |
      | `45-mode-the-most-common-value` | 16 | statistics | MODE, and what it does when nothing repeats |
      | `46-rank-a-list-without-sorting-it` | 17 | statistics | RANK's third argument choosing a direction |
      | `47-average-functions-summary` | 18 | statistics | AVERAGE, MEDIAN and RANK answering one question |

      Every expected value was probed through `grade()` before it was written down, and two of them
      were wrong as first drafted: `RANK(...,1)` on Ada's 58 is **4**, not 5, and
      `RANK(MEDIAN(B2:B6),B2:B6)` is **3**, not 4. Both sat in hint text and in an `expect`, so both
      would have shipped a drill that tells a correct learner they are wrong. The prober also settled
      the error cases instead of guessing them: `=MROUND(-2.5,1)` is `#NUM!`, `=FLOOR(47,0)` and
      `=MROUND(47,0)` are `#DIV/0!`, `=RANK(B2,B3:B6)` is `#N/A`, and `=MODE(B2:B6)` on the lesson's
      own data still answers 3, so it is not a reject.

      Three findings, one of them a naming rule this batch broke and had to repair:

      - **Lesson ids are dense in the order lessons were written, not the catalog slot number.** The
        statistical cohort was first named `14-large-and-small-…` through `18-…` and the rounding
        lesson `35-mround-…`, because those are their slot numbers. `content:check` passed — nothing
        in the schema checks density — but `npm run golden:update` threw
        `Cannot read properties of undefined (reading 'screens')` (no audit row for the id the capture
        read) and the authoring CLI refused `--lesson 48` with `42 is the next free number`. Renaming
        the six files to `42-…` through `47-…` — ids, audit keys and track entries all renamed together
        — restored the invariant the CLI's own test asserts. A slot number is a catalog position; a
        lesson id is a sequence number.
      - **A reject is filed under the first rule it breaks, not the rule it was written for.**
        `=FLOOR(B3,C3)` was drafted as a `value` reject but reports `require-ref`, because it avoids
        the required cell entirely; it became `=FLOOR(B2,C2-2)` → 44. Likewise `=LARGE(B3:B6,2)`,
        `=RANK(B3,B3:B5,1)` and `=RANK(MEDIAN(B3:B6),B3:B6)` are the forms that legitimately file under
        `require-ref`.
      - **Six rejects per screen is a floor, and declared rules must each be exercised.** The five
        statistical second screens shipped five rejects and content-lint refused them, then refused
        three rules that no reject produced (`func-rank` on screen 17.2, `value` and `require-ref` on
        18.2). Six probed rejects were added rather than one rule dropped.

      Verbatim gate output for the batch: `tests 1054`, `suites 153`, `pass 1054`, `fail 0`;
      `content: 47 of 88 catalogued lessons, 16 groups, 70 screens, 879 fixtures replayed`;
      `✓ content passes — 399 accepted and 480 rejected formulas agree with the grader`;
      `built 65 pages (3767.0 kB of HTML+CSS)`; `next routes: 65 prerendered pages match the shared
      templates`; `verified 47 lesson pages, the index, the dashboard, the pricing page and 13 group
      pages — 2374 checks passed`; `82 passed (14.2s)` from `npx playwright test`; `vendor: 25 files
      match manifest.json`. `tests/golden/snapshot.json` went to 47 lessons and 1121 verdicts, 191
      added over the 41-lesson snapshot, none changed.

### The `sum` group, end to end

      Seven planned slots in one group — the first batch that opens and closes a single group in a
      single pass. Fourteen screens, 176 fixtures:

      | File | Slot | Group | Teaches |
      |---|---|---|---|
      | `48-sumifs-two-conditions-at-once` | 4 | sum | SUMIFS with two pairs, and criteria that must both hold |
      | `49-sumif-a-sum-range-on-another-column` | 5 | sum | SUMIF's third argument summing a column other than the criteria one |
      | `50-add-only-the-positives` | 6 | sum | `">0"` / `"<0"` criteria, and `=-SUMIF(…)` reporting the size of losses |
      | `51-debug-a-total-that-skips-a-row` | 7 | sum | A total that silently drops a text cell, and a subtotal row to exclude |
      | `52-sum-across-several-blocks` | 8 | sum | Several ranges in one SUM; the same question asked of a 3×3 grid |
      | `53-running-total-down-a-column` | 9 | sum | `=SUM(B$2:B2)` — the half-anchored range that grows as it is filled down |
      | `54-sum-functions-summary` | 10 | sum | SUM and SUMIF composed: the total, then the part outside a region |

      Values were probed before they were written, as usual, and the rejects were probed for their
      *reported* rule too — the generator refuses to write a reject that grades correct or that
      files under a different rule than the one the screen advertises. Eight drafts were rewritten
      that way, every time by changing the fixture rather than the rule.

      Four findings, one of them a catalog deviation:

      - **`minArgs` is a literal argument count, not a semantic one.** `SUMIFS(sum_range, range,
        criteria)` is three arguments, so a one-condition SUMIFS satisfies `minArgs: 3` and computes
        900/800 instead of failing — it files under `value`, not `func-sumifs`. `func-sumifs` is
        therefore exercised by a *different* function (`SUMIF`, `SUMPRODUCT`) on the screens that
        advertise it: a rule is proven by the reject written for it, not by the rule's name.
      - **`require-ref` is structural and runs before evaluation.** A reject must not mention the
        required cell at all; a range that is merely misaligned still mentions it, so it files under
        `error` (the misaligned SUMIFS throws). `=SUM(C2:C3,D2:D3)` and `=SUM(B4:B4)` were rewritten
        as `require-ref` rejects once the required cell was taken out of them.
      - **A grid cell holding `"=SUM(B2:B4)"` is text, not a computed subtotal.** `buildCells` does
        not evaluate formula strings inside `grid.rows`, so the subtotal row in lesson 51 is the
        literal 750 and the rejects are written against a literal column. Every other shipped grid
        was audited for embedded formulas at the same time; none had any.
      - **There are no sheet-qualified references in the evaluator at all.** Slot 8 is catalogued as
        "SUM across several sheets", but nothing in `packages/grader/` parses `Sheet!A1`, so the slot
        ships as *SUM across several blocks* — multiple range arguments, which is the transferable
        skill — and the slot title stays as catalogued. Recorded here rather than silently reworded.

      Content-lint caught two authoring habits rather than content errors: `docs.dataset` is capped at
      60 characters (two datasets were 66 and 71) and a screen `prompt` must be one imperative
      sentence under 220 characters (eight prompted as two). The `sum` group growing from two lessons
      to nine also moved the accessible name an a11y test asserts — `1 of 2` became `1 of 9` on
      `/learn/groups/sum` — an expected count moving up with content, not a relaxed assertion.

      Verbatim gate output for the batch: `tests 1110`, `suites 153`, `pass 1110`, `fail 0`;
      `content: 54 of 88 catalogued lessons, 16 groups, 84 screens, 1055 fixtures replayed`;
      `✓ content passes — 483 accepted and 572 rejected formulas agree with the grader`;
      `built 72 pages (4743.3 kB of HTML+CSS)`; `next routes: 72 prerendered pages match the shared
      templates`; `verified 54 lesson pages, the index, the dashboard, the pricing page and 13 group
      pages — 2710 checks passed`; `82 passed (13.9s)` from `npx playwright test`; `vendor: 25 files
      match manifest.json`. `tests/golden/snapshot.json` went to 54 lessons and 1342 verdicts — 221
      added, 0 changed, 0 removed.

### The `count` group closes

      Three planned slots, six screens, 77 fixtures:

      | File | Slot | Group | Teaches |
      |---|---|---|---|
      | `55-countifs-several-conditions` | 21 | count | COUNTIFS with a text pair and with a comparison pair |
      | `56-countif-with-wildcards` | 22 | count | `*` and `?` inside criteria, and which end of the word the star sits on |
      | `57-count-functions-summary` | 23 | count | COUNT counts values, COUNTA counts rows, and the difference is the gap |

      The prober earned its keep again: `*B` on the product list answers **3**, not 2 — "Gadget B"
      ends in B as well as "Widget B" and "Gizmo B" — and the screen had been written expecting 2.
      Two more drafts were rewritten after the prober, not after CI: `COUNT(A2:A9)` on a summary
      screen whose dataset column is B files under `require-ref` (the formula never touches the
      required cell at all), not under `value`; and `COUNTA(B2:B9)` files under the *required
      function* rule before anything is evaluated, so the reject that was meant to prove `value` had
      to become `=COUNT(B2:B9)+1`.

      Two rules the gates enforce that are easy to trip while authoring a group:

      - **Accepted fixtures are a set, not a list.** `tests/fixtures.test.js` refuses a duplicate
        accepted entry (`duplicate accepted entry`, 5 !== 6), which is how the sixth accept on two
        screens was caught copying the reference verbatim. Every accept now differs in case, anchoring
        or arithmetic.
      - **Every rule a screen advertises needs a reject that produces it**, `syntax` included. Two
        screens shipped without a syntax reject and content-lint refused them; the missing
        parenthesis is the reject that proves the parser path, and it belongs on every screen rather
        than only the first.

      Verbatim gate output for the batch: `tests 1134`, `suites 153`, `pass 1134`, `fail 0`;
      `content: 57 of 88 catalogued lessons, 16 groups, 90 screens, 1132 fixtures replayed`;
      `✓ content passes — 519 accepted and 613 rejected formulas agree with the grader`;
      `built 75 pages (5198.6 kB of HTML+CSS)`; `next routes: 75 prerendered pages match the shared
      templates`; `verified 57 lesson pages, the index, the dashboard, the pricing page and 13 group
      pages — 2854 checks passed`; `82 passed (20.4s)` from `npx playwright test`; `vendor: 25 files
      match manifest.json`. `tests/golden/snapshot.json` went to 57 lessons and 1441 verdicts — 99
      added over the 54-lesson snapshot, 0 changed, 0 removed.

### The `logical` group closes

      Six planned slots (25-30, after slot 24 already held `04-if-pass-fail`), twelve screens, 145
      fixtures:

      | File | Slot | Group | Teaches |
      |---|---|---|---|
      | `58-true-and-false-what-a-comparison-returns` | 25 | logical | a comparison *is* a logical value, and quoted `"TRUE"` is not |
      | `59-and-or-not-combining-tests` | 26 | logical | AND demands every test, OR accepts one, NOT flips one |
      | `60-ifs-more-than-two-outcomes` | 27 | logical | ordered IFS pairs and the `TRUE` fallback pair |
      | `61-switch-match-a-list-of-values` | 28 | logical | SWITCH value/result pairs, and text `"3"` never matching `3` |
      | `62-isblanks-and-isnumbers` | 29 | logical | type tests that return logical values, and blank versus empty string |
      | `63-logical-functions-summary` | 30 | logical | `IF(AND(...))` verdicts and a guarded `IF(ISNUMBER(AVERAGE(...)),ROUND(...))` |

      Logical content has traps the earlier groups did not, all of them found by the prober before
      the files were written:

      - **Logical *and* text results are typed.** A boolean expectation accepts `=SUM(...)>100` but
        rejects `=ISBLANK(A3)+0` and `...*1`, because arithmetic turns the logical value into 1 while
        the expectation stays boolean. On the text screens the same applies in reverse: `+""` and
        `*1` answer `#VALUE!` against a label, so those mechanical variants are only safe on numeric
        and boolean screens.
      - **Text results are case-sensitive.** Lowercasing an accept is the obvious sixth variant
        everywhere else; here it changes the answer (`"pass"` is not `"Pass"`), so the extra accepts
        are anchored and absolute forms (`$B$3`, `B$3`, `$B3`) and equivalent thresholds (`>14` for
        `>=15`) instead.
      - **A reject has to be genuinely wrong, not merely shorter.** `=IFS(B3>=90,"A",B3>=80,"B",
        B3>=70,"C")` with no fallback still answers `C` for Ben's 78 and therefore grades correct;
        the same is true of a two-pair `SWITCH` whose value happens to match. Both became different
        labels or different thresholds, which is a stronger lesson than "the fallback was missing".
      - **The rule a reject *declares* is set by the rule engine's order, not by intent.** `=A3=""`
        files under `func-isblank` (a missing required function fires before anything is evaluated),
        and `=ISTEXT(A3)` on an ISBLANK screen files under `func-isblank` too — the rule id names the
        function the screen requires, not the one the learner typed.
      - **`requireRef` has to point at a cell that holds something.** The schema test refuses a
        required cell that is blank ("A4 is blank"), which is precisely why a screen about empty
        cells cannot require the empty cell: screen 1 asks whether A3 — a cell with a word in it —
        is empty, and answers FALSE. The blank cell is still on the grid, and the reject that tests
        it is the one proving `require-ref`.
      - **`require` cannot be empty**, so a screen whose point is "a comparison is already logical"
        still needs a function in the formula: `=SUM(B2:B7)>100` keeps the lesson and satisfies the
        schema, where `=B8>100` would ship a screen with no rules at all.

      Verbatim gate output for the batch: `tests 1182`, `suites 153`, `pass 1182`, `fail 0`;
      `content: 63 of 88 catalogued lessons, 16 groups, 102 screens, 1277 fixtures replayed`;
      `✓ content passes — 591 accepted and 686 rejected formulas agree with the grader`;
      `built 81 pages (6180.9 kB of HTML+CSS)`; `next routes: 81 prerendered pages match the shared
      templates`; `verified 63 lesson pages, the index, the dashboard, the pricing page and 13 group
      pages — 3142 checks passed`; `82 passed (20.4s)` from `npx playwright test`; `vendor: 25 files
      match manifest.json`. `tests/golden/snapshot.json` went to 63 lessons and 1634 verdicts — 193
      added over the 57-lesson snapshot, 0 changed, 0 removed.

### The `errors` group closes

      Three planned slots (69-71), six screens, 76 fixtures:

      | File | Slot | Group | Teaches |
      |---|---|---|---|
      | `64-ifna-catch-only-a-missing-match` | 69 | errors | `IFNA` catches `#N/A` and nothing else, on a grid where the typed key has no price |
      | `65-reading-error-values` | 70 | errors | `ISNA` and `ISERROR` *ask* about an error, and `INDEX` past the last column raises `#REF!` |
      | `66-error-handling-summary` | 71 | errors | `IFERROR` nets any failure, including the `#DIV/0!` that `IFNA` lets through |

      The traps here are about where an error is allowed to exist at all:

      - **An error cannot live in a grid.** `buildCells` stores JSON scalars and never evaluates a
        grid formula, so there is no way to put `#N/A` in a cell and ask the learner to find it. Every
        lesson here has to *raise* the error inside the answer formula and then catch it.
      - **`IFNA` is narrower than learners expect.** `=IFNA(1/0,"x")` throws instead of falling back,
        because `#DIV/0!` is not `#N/A`. That is the whole point of lesson 66 screen 2, and it is why
        the `IFNA` reject there is filed under `func-iferror` — the required function fires before
        the formula is even evaluated.
      - **`require` constrains the accept list, not just the rejects.** `XLOOKUP`, `INDEX(MATCH(...))`
        and `IF(ISERROR(...))` all compute the right answer, and all were refused as accepts because
        the screen requires `VLOOKUP`, `ISNA` or `IFERROR`. The extra accepts became anchored and
        absolute variants of the *required* function (`$A$8`, `A$8`, `2,0` for `2,FALSE`, `($B4)`).
      - **A `require-ref` reject has to miss the required cell.** `=IFNA(VLOOKUP("A-1",A2:B7,...))`
        types the key and still references A2 through the lookup *range*, so the rule never fires;
        pointing the range at an empty block (`C1:D7`) is what makes the reject structural.
      - **An approximate match is not a wrong answer.** `VLOOKUP(A2,A2:B7,2,TRUE)` returns the last
        row at or below the key, which for `A-1` is still 10 — a plausible-looking audit wrong that
        grades correct. It was replaced with a `VLOOKUP` missing its `IFNA`.
      - **A blank divisor must be blank in the row being divided.** The first `PRICEQ` draft divided
        `B3/C3` while the empty units cell was on row 4, so the formula answered 5 and the screen had
        nothing to teach; moving the formula to row 4 (`B4/C4`, answer `D8`) restored the `#DIV/0!`.

      Verbatim gate output for the batch: `tests 1206`, `suites 153`, `pass 1206`, `fail 0`;
      `content: 66 of 88 catalogued lessons, 16 groups, 108 screens, 1353 fixtures replayed`;
      `✓ content passes — 627 accepted and 726 rejected formulas agree with the grader`;
      `built 84 pages (6700.3 kB of HTML+CSS)`; `next routes: 84 prerendered pages match the shared
      templates`; `verified 66 lesson pages, the index, the dashboard, the pricing page and 13 group
      pages — 3286 checks passed`; `82 passed (20.6s)` from `npx playwright test`; `vendor: 25 files
      match manifest.json`.

### The `aggregate` group closes

      Four planned slots (77-80), eight screens, 99 fixtures:

      | File | Slot | Group | Teaches |
      |---|---|---|---|
      | `67-sumproduct-multiply-then-add` | 77 | aggregate | `SUMPRODUCT` pairing two columns, then the same call as a weighted-average numerator |
      | `68-subtotal-a-sum-over-a-group` | 78 | aggregate | the function number in front: `9` adds, `4` is MAX, `5` is MIN, `2` counts |
      | `69-aggregate-a-total-that-can-skip` | 79 | aggregate | three arguments — function number, options number, range |
      | `70-aggregate-functions-summary` | 80 | aggregate | a value column and the `SUMPRODUCT` that reproduces it, reconciled as a ratio of one |

      What this group cost:

      - **`minArgs` is part of the requirement, and it fires before evaluation.** `=SUMPRODUCT(B2:B4)`
        was declared a `value` reject and filed as `func-sumproduct`, because one argument fails the
        screen's own `minArgs: 2`. The lesson is real ("one range has nothing to pair with"), so the
        reject stayed and the rule was corrected.
      - **A one-argument call is also the shortest wrong answer**, which made it tempting as *both* a
        function rule and a value rule. It can only be one: the require rule wins, and a value reject
        has to keep both arguments and be wrong on the answer instead
        (`=SUMPRODUCT(B2:B4,B2:B4)` multiplies the prices by themselves).
      - **Floating point decides the fixtures.** `100/9` is `11.111...` and `35/3` is `11.666...`,
        neither of which any literal `expect` can match. Every screen whose answer is not an integer
        wraps the arithmetic in `ROUND(...,1)`, and the unrounded form then becomes a genuine `value`
        reject rather than a near miss in the accept list.
      - **A reject that omits a required function reports the requirement, not the arithmetic.** On
        the reconciliation screen `=ROUND(SUMPRODUCT(...)/SUM(C2:C4),1)` computes 11.1 — the right
        answer by the wrong route — and files as `func-subtotal`, which is exactly the lesson. That
        also means each `require` entry needs its own producing reject, so a two-function screen
        needs two of them.

      Verbatim gate output for the batch: `tests 1239`, `suites 153`, `pass 1239`, `fail 0`;
      `content: 70 of 88 catalogued lessons, 16 groups, 116 screens, 1452 fixtures replayed`;
      `✓ content passes — 675 accepted and 777 rejected formulas agree with the grader`;
      `built 89 pages (7449.2 kB of HTML+CSS)`; `next routes: 89 prerendered pages match the shared
      templates`; `verified 70 lesson pages, the index, the dashboard, the pricing page and 14 group
      pages — 3490 checks passed`; `82 passed (22.1s)` from `npx playwright test`; `vendor: 25 files
      match manifest.json`. `tests/golden/snapshot.json` went to 70 lessons and 1862 verdicts.

### The `text-search` group closes

      Five planned slots (54-58), ten screens, 151 fixtures:

      | File | Slot | Group | Teaches |
      |---|---|---|---|
      | `71-mid-characters-from-the-middle` | 54 | text-search | `MID` reading a fixed slice, then the same call reading a prefix |
      | `72-find-and-search-case` | 55 | text-search | `FIND` reports a case-sensitive position, `SEARCH` ignores case |
      | `73-wildcards-in-text-criteria` | 56 | text-search | `?` and `*` inside a criterion, the same pattern driving `COUNTIF` and `SUMIF` |
      | `74-textbefore-and-textafter` | 57 | text-search | `TEXTBEFORE`/`TEXTAFTER` naming a delimiter instead of counting characters |
      | `75-text-search-summary` | 58 | text-search | `MID` driven by `FIND` beside a wildcard `AVERAGEIFS`, on one table |

      What this group cost:

      - **`TEXTBEFORE` and `TEXTAFTER` did not exist in the grader.** They are advertised by the
        reference site's own level list, so this was a missing engine function rather than a missing
        lesson. Both were added to `packages/grader/functions.js` behind one `sliceOnDelimiter`
        helper that counts delimiters from either end (a negative instance counts backwards), raises
        `#N/A` when the delimiter is absent, and `#VALUE!` on an instance of zero. `SUBSTITUTE` went
        in at the same time for the `text-change` slot. Unit tests for all three live in
        `tests/grader.test.js` under `describe("text")`.
      - **`require-ref` names one cell, not the row.** `=MID(B3,4,4)` looks like a value reject and
        files as `require-ref`, because the reference rule tests whether the *declared* cell appears
        anywhere in the formula. Every row-shifted reject in this group therefore became the
        `require-ref` reject, and the value rejects were rewritten to stay on row 2 and be wrong on
        the arithmetic (`=MID($B$2,3,4)` keeps the hyphen).
      - **`require` fires before `error`, so an error reject has to contain the required function.**
        `=FIND("-",A2,4)` and `=MID(B2,"x",4)` are the two shapes that work: the taught function is
        present, and the failure is a real `#VALUE!` or `#N/A` from it.
      - **The case-sensitivity screen needed a label, not a code.** `=FIND("N",A2)` fails on
        `banana grove` while `=SEARCH("N",A2)` answers 3, which is the whole point of the pair; on a
        code column both functions agree and the lesson has no teeth.
      - **A wildcard accept list can hold plain text honestly.** `=COUNTIF(B2:B5,"North")` is correct
        on the wildcard screen because it demonstrates that the pattern and the word select the same
        rows; the reject list carries `=COUNTIF(B2:B5,"N")`, which selects none.

      Verbatim gate output for the batch: `tests 1281`, `suites 153`, `pass 1281`, `fail 0`;
      `content: 75 of 88 catalogued lessons, 16 groups, 126 screens, 1603 fixtures replayed`;
      `✓ content passes — 747 accepted and 856 rejected formulas agree with the grader`;
      `built 94 pages (8393.0 kB of HTML+CSS)`; `next routes: 94 prerendered pages match the shared
      templates`; `verified 75 lesson pages, the index, the dashboard, the pricing page and 14 group
      pages — 3730 checks passed`; `82 passed (20.3s)` from `npx playwright test`; `vendor: 25 files
      match manifest.json`. `tests/golden/snapshot.json` went to 75 lessons and 1603 verdicts.

### The `text-change` and `modeling` groups close

      Five planned slots (68, 85-88), ten screens, 129 fixtures:

      | File | Slot | Group | Teaches |
      |---|---|---|---|
      | `76-substitute-replace-one-piece-of-text` | 68 | text-change | `SUBSTITUTE` replacing every match, then one named instance |
      | `77-a-commission-sheet-that-updates-itself` | 85 | modeling | an approximate `VLOOKUP` as a rate band, multiplied into a priced answer |
      | `78-a-headcount-and-payroll-summary` | 86 | modeling | `SUMPRODUCT` pairing two columns, then a per-head ratio over it |
      | `79-an-inventory-reorder-report` | 87 | modeling | `MAX` as a zero floor, on one row and then over two column totals |
      | `80-a-monthly-close-checklist-in-formulas` | 88 | modeling | `IF` returning a word instead of a number, beside a quoted not-equal `COUNTIF` |

      What this batch cost:

      - **`VLOOKUP` is pinned at four arguments.** The arity table declares `minArgs: 4`, so the
        approximate form has to say `TRUE` out loud — `=VLOOKUP(B2,$A$7:$B$9,2)` is a `func-vlookup`
        reject rather than an accept. That is the engine being strict about a range lookup's mode, and
        it makes the lesson better: the learner writes the argument the behaviour depends on.
      - **`SUMPRODUCT` pairs ranges element-wise, so a shifted range is not an error.** `C3:C6`
        against `B2:B5` happily multiplies rows 3-6 by rows 2-5 and returns `300000`. The reject is
        therefore filed as `value`, and a separate `=SUMPRODUCT(...)/0` carries the `error` rule.
      - **A reject that omits the required function is not the rule you meant.** `=MAX(0,C2)` looks
        like a value reject on the reorder screen and files as `require-ref`, because the declared
        cell never appears. `=MIN(C2-B2,0)` files as `func-max` for the same class of reason: `MIN`
        is not the function the screen teaches. Value rejects have to keep both the cell and the
        function and be wrong in the arithmetic (`=MAX(0,C2-B2)+2`).
      - **The failure set has to be covered by the *declared* rule, not by what fires.** On the
        sheet-level reorder screen every reject contained `SUM`, so `func-sum` was advertised and
        never produced. Adding `=MAX(0,C2-B2)` — a correct-looking row formula on a screen that asks
        for a sheet total — covers it.
      - **A string answer is case-sensitive.** `=IF(B2=0,"READY","CHECK")` on the close screen is a
        `value` reject, not an accept, because `expect.value` is the literal `"ready"`. The sixth
        accept became `=IF(B2=0,"ready","check")&""`, which also demonstrates that a coerced text
        result still matches.

      Verbatim gate output for the batch: `tests 1322`, `suites 153`, `pass 1322`, `fail 0`;
      `content: 80 of 88 catalogued lessons, 16 groups, 136 screens, 1732 fixtures replayed`;
      `✓ content passes — 807 accepted and 925 rejected formulas agree with the grader`;
      `built 100 pages (9437.7 kB of HTML+CSS)`; `next routes: 100 prerendered pages match the shared
      templates`; `verified 80 lesson pages, the index, the dashboard, the pricing page and 15 group
      pages — 3982 checks passed`; `82 passed (20.4s)` from `npx playwright test`; `vendor: 25 files
      match manifest.json`. `tests/golden/snapshot.json` went to 80 lessons and 1732 verdicts.

### The `capstone` group closes

      Five planned slots (59-63), thirteen screens, 204 fixtures:

      | File | Slot | Group | Teaches |
      |---|---|---|---|
      | `81-a-sales-summary-end-to-end` | 59 | capstone | `SUMIFS` on an amount and a label column, then a comparison over two of them |
      | `82-a-lookup-dashboard-from-three-tables` | 60 | capstone | `INDEX` and `MATCH` on the typed name, then nested through a region column |
      | `83-clean-up-an-imported-list` | 61 | capstone | `TRIM` before `PROPER`, then `TRIM`, `SUBSTITUTE` and `LOWER` nested into a match key |
      | `84-budget-versus-actual-with-a-variance-flag` | 62 | capstone | a rounded variance share, then an `IF` over `ABS` so under- and overspends both flag |
      | `85-formula-audit-fix-five-broken-sheets` | 63 | capstone | an error-code-first repair: a guard, a key test, a type test, a range, and a spelling |

      What this batch cost:

      - **A guard makes the bad branch dead, so it cannot carry the `error` rule.** `=IF(B3=0,"n/a",C3/0)`
        grades *correct*: the zero branch is taken, the divisor is never reached. An error reject has to
        be wrong on the path the data actually takes (`=IF(B3="x","n/a",C3/B3)` with `B3` at zero).
      - **`require-ref` is decided before the arithmetic.** A reject that hard-codes the typed key
        (`=IF(COUNTIF(A2:A5,"Zed")=0,...)`) files as `require-ref` even when its answer is right,
        because the rule order puts the reference check ahead of the value compare. That is what makes
        the hard-coded-key reject possible at all.
      - **`SUMIF` tolerates a short amount range.** `=SUMIF(A2:A5,"North",B2:B4)` still returns 250,
        because the alignment drops nothing the criteria keep. Shortening the *criteria* range too
        (`A2:A3` against `B2:B3`) is what produces the value reject.
      - **A shifted range can still be right.** On the two-table dashboard `C3:C5` against `A3:A5`
        returns 600 — the row that names the key moved with the amounts. The require-ref reject that
        works keeps both ranges intact and hard-codes the name instead.
      - **`docs.teaches` has an 80-character ceiling**, and the grid has to be a rectangle: every row
        of a screen pads to the screen's widest row, and `answerCell` has to be inside it and blank.
        The audit key cell sits in the column *before* the answer cell, so `E2` holding the typed name
        and `F2` holding the answer is the shape that satisfies both checks.

      Verbatim gate output for the batch: `tests 1374`, `suites 153`, `pass 1374`, `fail 0`;
      `content: 85 of 88 catalogued lessons, 16 groups, 149 screens, 1903 fixtures replayed`;
      `✓ content passes — 885 accepted and 1018 rejected formulas agree with the grader`;
      `built 105 pages (10535.2 kB of HTML+CSS)`; `next routes: 105 prerendered pages match the shared
      templates`; `verified 85 lesson pages, the index, the dashboard, the pricing page and 15 group
      pages — 4237 checks passed`; `82 passed (22.7s)` from `npx playwright test`; `vendor: 25 files
      match manifest.json`. `tests/golden/snapshot.json` went to 85 lessons and 1903 verdicts.

### The `arrays` group is out of scope for this phase

      Three slots stay `planned` (81-83): `UNIQUE`, `FILTER`, and `SORT and spilled ranges`. They
      cannot be authored against the current grader. `evaluate.js` returns `null` for all three,
      because `expect.value` is a single scalar and the result shape the lessons teach — a spilled
      block of rows — has no representation in the fixture schema. Writing them as scalar exercises
      (a `COUNTA(UNIQUE(...))` count, a `SUM(FILTER(...))` total) would ship three lessons whose
      titles promise a spilled range and whose screens never show one, so nothing was written.

      Unblocking them needs a design decision, not more authoring:

      - the engine has to return an array from `UNIQUE`/`FILTER`/`SORT`, and
      - `expect.value` needs an array form, and `compareToExpected` a block comparison, and
      - `content-lint` needs a rule for a spilled answer that occupies more than the one `answerCell`.

      That is grader work with its own review cycle. The batch stops here at **85 of 88**, with the
      remaining three catalogued, numbered, and visibly `planned`.

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
