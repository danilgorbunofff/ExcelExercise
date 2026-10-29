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
- [~] **4. CLI.** `content-lint check` and `content-lint fixtures --lesson NN` ship. `content:new` and
      `content:preview` wait for step 5: `--group` and a passing skeleton both need the lesson numbers
      and groups to exist first.
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
      rules: duplicate titles across planned and published slots are errors, and groups with published
      lessons but no `intro` are reported in one warning until step 6 writes the copy — and that
      warning cannot outlive its reason, because a test reads `app/` and fails if a page renders a
      group while a blank intro is still only a warning. `tests/build.test.js` pins the ordering
      contract with a catalog whose order disagrees with the filenames; the shipped corpus cannot
      prove it, because there the two orders are the same list.

The renderer moved with the model rather than after it: `exercise-page.mjs`, `sheet.mjs` and
`verify.mjs` now resolve `screenAt(entry.exercise)` and read the drill off the screen, so there is no
window in which two shapes are both live.

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
9. **Migration.** Convert the 10 existing lessons to schema v2; the old single-screen shape is
   accepted by the loader during a one-release deprecation window.

## Acceptance criteria

- [ ] `content:new --lesson 11` produces a file that renders, grades and passes `content:check` with
      no framework knowledge.
- [x] CI fails when any screen lacks 6 accepted or 6 rejected fixtures.
- [x] Every fixture verdict matches its declared expectation across all authored lessons.
- [ ] `content/tracks/excel.json` contains 88 lessons and 16 groups; counts match the catalog.
- [ ] 10 migrated lessons keep their existing behaviour (golden snapshots from phase 0 unchanged).
- [ ] Category intros authored for all 16 groups.
- [ ] `docs/content-authoring.md` exists and a second person can author a lesson from it unaided.

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
