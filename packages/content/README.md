# @excelsupreme/content

Reads `content/` off disk and refuses anything malformed. Every lesson that ships has passed through
`loadContent()` first, so a bad authoring change fails the build instead of rendering a page with a
hole in it.

## API

```js
import { LEVELS, SCREEN_TYPES, loadContent, screenAt } from "@excelsupreme/content";

const { track, exercises } = loadContent("content");
// exercises is ordered by track.lessons, not by filename; every one carries screens[]
const screen = screenAt(exercises[0]); // screen 0 — the only screen phase 1 renders
```

- `loadContent(contentDir)` → `{ track, exercises }`. `exercises` holds the authored lessons, in
  catalog order, and only those — planned slots are not lessons yet.
- `normalizeTrack(raw, file)` → the catalog: `{ id, title, promise, freeLessonCount, groups[], lessons[] }`.
  Exported for the linter and for authoring tools that need to read a catalog without a content tree.
- `validateLesson(exercise, file)` = `normalizeLesson(exercise, file)` → the lesson in the v2 shape, or
  throws. Exported for authoring tools; `loadContent()` already calls it per file.
- `screenAt(lesson, index = 0)` → the screen, or `null` past the end.
- `LEVELS` → `{ 1: "Beginner", 2: "Intermediate", 3: "Advanced" }`, the only accepted `level` values.
- `SCHEMA_VERSION` → `2`; `SCREEN_TYPES` → `formula`, `chord`, `sequence`, `picture`, `workbook`.

## The catalog

`track.json` is the site map: 16 groups and 88 lesson slots today. A slot is one of two things, and
which one it is comes from what the entry carries — not from a `status` field that could disagree with
reality:

```json
{ "id": "01-sum-basics", "group": "sum" }                          // authored: the file is the record
{ "title": "SUMIFS: two conditions at once", "level": 2, "group": "sum" }  // planned: a reserved slot
```

An authored entry names only its lesson and its group. Its title, slug and level live in
`exercises/<id>.json`; carrying a `title` or a `level` here as well would be a second answer to the
same question, so both are rejected. A planned entry carries the title it will ship with and a level,
because nothing else knows them yet.

`group` is a tag, not a block: the list order is the order learners meet lessons, so a group's lessons
need not be adjacent, and planned slots sit wherever the curriculum reads best. Published numbering is
position among *authored* lessons, so inserting a planned slot never renumbers a page — publishing one
does.

Groups are `{ id, title, intro? }`. `intro` is the group's landing copy (multiline, ≤1800 characters).
All 16 carry one. It stays optional in the schema because a group whose lessons are all still planned
has nothing to introduce yet, but the linter fails a group a learner can already reach without one.

## Two shapes, one output

A lesson is either `schemaVersion: 2` with `screens[]`, or the older flat shape (`schemaVersion`
absent), where the lesson *was* one screen. Both leave `normalizeLesson()` as
`{ id, slug, level, title, docs, schemaVersion, screens[] }`, and nothing per-screen survives at the
top level — a consumer that reads `lesson.prompt` gets `undefined`, loudly, instead of a copy that
went stale. The *source* cannot be half-way either: a file that mixes the two shapes is rejected
outright (see below) rather than resolved by precedence, so the shape a lesson has is the shape its
file says it has. The flat shape is a one-release deprecation window: all 10 shipped lessons moved to
`screens[]` with their fixtures inline, the `tests/fixtures/` sidecars are gone, and the loader still
reads a flat lesson with a sidecar so an in-flight branch does not break. When that window closes the
sidecar path in `@excelsupreme/content-lint` can be deleted and the flat shape rejected outright.

Errors are `content/<file>: <problem>` so the build log points at the file to open. The strings are
asserted by `tests/content.test.js` and `tests/build.test.js` — change them deliberately or not at all.
That prefix is added in exactly one place (`failAt` in `schema.js`): every helper takes a path relative
to the content root (`track.json`, `exercises/01-sum-basics.json`), so no caller has to know whether it
already carries `content/`.

## What it rejects

Beyond shape, types, and length limits:

- a `schemaVersion` other than 1 or 2, a v2 lesson with no `screens[]`, duplicate screen ids, a screen
  type outside `SCREEN_TYPES`, or a type that is declared but does not render yet (`chord`,
  `sequence`, `picture`, `workbook`) — the page would show a drill nothing can grade;
- a lesson whose shape is ambiguous: `screens[]` on a lesson that is not `schemaVersion: 2` (the flat
  drill would render and the screens would vanish), or a `schemaVersion: 2` lesson that still carries
  `prompt`/`grid`/`answerCell`/`expect`/`require`/`forbid`/`requireRef`/`rules`/`hints`/`fixtures` at the
  top level (that copy would never render, so editing it would look broken). Ambiguity is rejected
  rather than resolved silently;

- a duplicate `id` or `slug`, an `id` that differs from its file name, or a `slug` that is not
  lowercase-kebab;
- a catalog entry that is not an object, an authored entry with a `title` or a `level`, a planned
  entry without a level in `LEVELS`, an entry filed under a group the catalog does not declare, a
  duplicate group id, a group with no lessons (a category page with nothing on it), a catalog with no
  authored entry at all, or a `freeLessonCount` above the authored count;
- an id in `track.lessons` with no exercise file, an id listed twice, or an exercise file absent from
  `track.lessons` (it would never be linked);
- a `level` outside `LEVELS`, or a cell address `parseRef` rejects or that is not in canonical case
  (`b5` would validate and then match no cell);
- an `answerCell`, `requireRef`, or `startCell` outside the grid, or a row whose length differs from
  the first row's;
- a `rules[].type` the grader does not apply (it would skip the rule silently, leaving a lesson
  unfailable), or a `require`/`forbid`/`rules[].func` the grader does not know.

## What it does not do

Page shape stays out: URLs, prev/next links, "free vs paid" position, and level labels as rendered
copy belong to the app that renders the track. This package returns data only, so the Next.js player
and the legacy static shell can each derive their own navigation from the same order.

## Consumers

- `legacy/src/site/content.mjs` — adds the URL/prev/next shaping the static pages need.
- The Next.js app (phase 9 of the parity plan) — will read lessons per route.

## Dependencies

`packages/grader` (via `../grader/index.js`, a sibling path, so no install step is needed). It needs
`parseRef` to validate answer references and a list of applied rule ids to reject typos.
