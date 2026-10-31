# `@excelsupreme/content-lint`

The authoring gate. `content` answers "can this lesson be rendered?"; this answers "can it be shipped?".

It exists because a drill can be perfectly well-formed and still be broken: a formula the lesson calls
accepted but the grader rejects, a failure path documented in `hints` that no fixture ever triggers, a
prompt copy-pasted from the lesson above it, a link to a page the site does not emit. None of those are
schema errors — they are content errors, and they are invisible until a learner hits them.

```bash
npm run content:check                                  # the gate CI runs
npm run content:copy                                   # the wording rules, lessons and groups
npm run content:articles                               # the function notes
npm run content:fixtures -- --lesson 6                 # one lesson, row per fixture
npm run content:new -- --lesson 11 --group lookup      # fill the next planned slot
npm run content:preview -- --lesson 11                 # the drill as its page reads
node packages/content-lint/cli.js check --content <dir> --fixtures <dir>
```

Exit codes: `0` clean, `1` findings, `2` bad usage. Warnings never fail the run.

## `new`: a planned slot becomes a lesson

`content:new` reads `track.json`, takes the first planned slot — in `--group` when one is named, the
first planned slot anywhere otherwise — and writes `exercises/<NN>-<slug>.json` for it, then rewrites
that entry to `{ id, group }`. The lesson's title, level and group come from the slot, so a scaffold
cannot land somewhere the site does not look for it, and the slug comes from the title, so the URL is
not a second decision.

`--lesson` is the number the *file* carries, and it has to be the next free one: ids are dense and
follow the order lessons were written in, which is what keeps the folder sorted by creation. The
number a lesson is *published* as is a different thing — position among authored lessons in catalog
order — so a lesson written into an earlier group takes a lower published number than its file says,
and every lesson after it moves up one. Both numbers are printed when the file is written.

The skeleton is the smallest drill that passes every rule: a SUM total over two cells, six accepted
and six rejected formulas, a hint per failure path it advertises, and docs that validate. What it
cannot write is the lesson — the prompt and `docs.explain` say "replace this scaffold" in place, so a
scaffold that is never edited reads as unfinished rather than as content.

## `preview`: the page without the build

`content:preview` prints what a reader gets: the title and URL, level, group and trial status, the
prompt, the grid with the answer cell marked, the docs block, every hint by rule id, and the fixture
table `fixtures` prints. It works on a half-written lesson — the loader only refuses what would not
render — so it is the fastest way to read prose you just wrote without running `next:build`.

## API

```js
import { lintContent, replayFixtures, MIN_FIXTURES } from "@excelsupreme/content-lint";

const report = lintContent("legacy/content");
// Pass { fixturesDir: "tests/fixtures" } only for a v1 lesson that keeps its fixtures in a sidecar.
// { ok, errors: [{ where, message }], warnings: [...],
//   stats: { lessons, screens, accepted, rejected, groups, planned }, lessons }
```

`lintContent` never throws for bad content: a schema error is reported as a single error (with
`where: null`, because the loader's own message already names the file) and the run stops, because
there is nothing to lint. Everything else is collected, so an author gets the whole list at once.

`replayFixtures(lesson, { fixturesDir })` returns the rows the `fixtures` command prints —
`{ screen, rows: [{ formula, expected, declared, result }] }` — for tools that want the data, not the
table.

## Where fixtures live

| Lesson shape | Fixtures | Why |
|---|---|---|
| `schemaVersion: 2` | `screens[].fixtures: { accept, reject }` | the screen owns its drill, so it owns the proof |
| v1 flat | `tests/fixtures/<id>.json` | the shape predates screens; one file per lesson |

Every shipped lesson is v2, so the sidecar path is a deprecation window rather than the normal home: it
still reads, and `check` needs no fixture directory at all once nothing uses it.

Declaring both is an error: there would be two answers to "which fixtures are real". A v2 lesson whose
fixtures are still in the sidecar is also an error — the migration has to move them, not copy them.

A rejection may be a bare formula or `{ formula, rule, why }`; the shipped corpus uses the object form
so the gate can check the claim, not just the verdict. When `rule` is declared, the grader's reported
rule must match it: that is what keeps `hints` honest.

## What it checks

- **Fixtures exist** — every screen has six accepted and six rejected formulas (`MIN_FIXTURES`). The
  plan asks for twelve; six is the number CI refuses to go under.
- **Every declared verdict is true** — each accepted formula grades `ok`, each rejected formula grades
  `!ok`. Both directions are checked; a lesson that only proves rejects passes tests that only read
  rejects.
- **Every advertised failure path is exercised** — the rules the screen can report (`require` ids,
  `forbid` ids, `rules` ids, `require-ref` when `requireRef` is set, plus the universal `syntax`,
  `value` and `error`) must all appear in the replayed rejections. A hint nobody can reach is copy
  nobody reads.
- **Prompts are unique and one sentence** — duplicates are errors (that is a copy-paste, not a
  lesson); more than one sentence is a warning, because a capstone may legitimately name three
  techniques in one long sentence while two short ones mean the drill does two things.
- **Links resolve** — markdown links to site-absolute paths must point at a page the site emits: the
  index, or a lesson under one of the published bases in `LESSON_BASES` (`/learn/excel/<slug>`, the
  canonical one, and `/excel/<slug>`, which `next.config.mjs` redirects onto it while the static build
  still runs). There is no `/lessons` namespace and no bare lesson index page, so a link to either
  fails here instead of 404ing in production. External links are not fetched: no network, ever.
- **Fixture files belong to lessons** — a sidecar for a deleted lesson is a lie about coverage.
- **Catalog titles are unique** — across published *and* planned slots, compared trimmed and
  case-insensitively. A planned title that collides with a lesson already live is a collision now, so
  it fails now rather than the day it is authored.
- **Groups with published lessons owe an intro** — an error, because the copy is landing text and a
  blank one is a hole on the page. One line names every reachable group still blank rather than nine
  separate findings. A group whose lessons are all still planned owes nothing yet.

Empty hints on a rejection are a warning, not an error: the drill still grades, it just teaches less.

## What it deliberately does not do

- **Not a renderer.** Anything that would make a page unrenderable is rejected earlier, in
  `packages/content/schema.js`. Duplicating that gate here would let the two drift.
- **Not a style guide by itself.** The lesson gate counts sentences; wording and reading level live in
  the copy gate (`copy.js`, `npm run content:copy`) and the note gate, which read the same rule file.
  Neither can tell whether an explanation is *true* — that is review.
- **No network.** No link crawler, no spell checker, no dependency. The build stays reproducible.

## The notes: `content:articles`

`lintArticles(dir, { paths })` gates `legacy/content/articles/*.md`, the pages under `/excel-functions`.
It is a separate command from `check` because a note is not a lesson: it has no screens, no fixtures and
no grader, so the lesson rules would report every one of them as broken. `--strict` runs both gates,
and `check --strict` is the single command that refuses to ship either surface.

What it refuses:

- **A note that is not a note** — missing frontmatter key, `title` without the function name,
  `description` outside 70 to 155 characters, `updated` not `YYYY-MM-DD`, `function` not unique.
- **A note that does not parse** — reported per file, collected, so one bad note does not hide the rest.
- **A note missing a section** — the five required headings, 2 to 4 `### Example N`, at least one
  table, and 700 to 1400 words.
- **A drill that leads nowhere** — `exercise` has to name a lesson that exists, by slug. A note with a
  wrong slug still renders; it just loses its drill, which is why the rendered-page test in
  `tests/articles.test.js` checks the shipped pages too and not only the parser.
- **A link to a page the site does not emit** — `servedPaths(lessons, notes)` is derived from the
  content, so a link to `/excel/<slug>` that was renamed, or to `/account`, fails here.
- **A note that repeats another** — the same 5-word shingles rule the lessons use, compared across
  notes; plus the wording rules: banned phrases, em dashes, curly quotes, sentences over 30 words.

```js
import { lintArticles, servedPaths } from "@excelsupreme/content-lint";

const report = lintArticles("legacy/content", { paths: servedPaths(lessons, articles) });
// { articles, findings, stats: { articles, words, meanWords, findings, errors, byRule } }
```

Findings carry `severity`: `error` fails the run, `warn` is printed and exits `0`. A long sentence is a
warning because a person can deliberately write one; a banned phrase or a decorative dash is an error
because there is never a reason to ship one.
