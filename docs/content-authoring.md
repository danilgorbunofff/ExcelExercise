# Writing a lesson

A lesson ships when it renders, grades, teaches and passes the gate. All four are one command
(`npm run content:check`), and the point of this guide is that you should never have to guess which of
them you broke.

Read it once end to end before your first lesson. After that, use [the definition of
done](#definition-of-done) as the checklist and [the worked example](#worked-example-lesson-11) as the
template.

A function note is the other kind of content in this repository, and it has its own template, gate and
checklist: [writing a function note](#writing-a-function-note).

One word on vocabulary: the site calls each unit an **exercise** — the H1, the counters, the search page
and the product copy all say "exercise". The frontmatter keys stayed `drills:` and `drill:` so the
86 lesson files and every note already written keep parsing, and the loader's own error messages name
those keys. When you write prose, write "exercise"; when you write frontmatter, write `drills:`.

## The loop

```bash
npm run content:new -- --lesson 17 --group lookup   # scaffold the next free slot
npm run content:preview -- --lesson 17              # the page as a reader gets it
npm run content:fixtures -- --lesson 17             # every fixture against the grader
npm run content:variants -- --lesson 17             # the hidden re-sends a screen could carry
npm run content:check                               # the gate CI runs
npm test                                            # schema, corpus, build, client
```

`content:new` takes the slot's title, level and group from `legacy/content/track.json` and points the
slot at the file it writes, so a lesson cannot be created somewhere the site does not look. The file it
writes is `schemaVersion: 2` and already passes the gate: the grid, the fixtures and the grading are a
working SUM exercise, and the prompt and `docs.explain` say "replace this scaffold" in place. A green gate
on a placeholder is not a done lesson; it is proof that the plumbing is out of your way.

`--lesson 17` is the **file number**. The number a learner sees is the lesson's position among authored
lessons, and the two agree only when the file's slot comes after every other authored slot. They parted
for lesson 13: its slot is 39, but the capstone and the INDEX/MATCH pair sit at slots 46, 52 and 59, so
its scaffold said "takes catalog slot 39, published as lesson 10 of 13" and shipping it pushed those
three one place later in the reading order without touching their URLs. Inserting a slot never
renumbers a page; publishing one does.

## What a lesson is

One JSON file per lesson in `legacy/content/exercises/`, named `<number>-<slug>.json`. The file is a
lesson: identity, catalog docs, and `screens[]` — the exercises. Most lessons are one screen; a lesson that
needs several writes them as a list, and each screen is graded on its own (lesson 16 has three). Write
`screens[]` even for the single-screen case rather than reaching for the flat shape.

The loader also reads the old flat shape (`schemaVersion` absent, exercise fields at the top level) during
a one-release deprecation window. Do not write it: the migrator is done, and the shape exists only so an
unmerged branch does not break. See [the content README](../packages/content/README.md#two-shapes-one-output)
for what each shape guarantees.

### Identity

| Field | Rule |
|---|---|
| `id` | exactly the file name without `.json`; the URL and the catalog key |
| `slug` | lowercase kebab; the published path, `/learn/excel/<slug>` |
| `level` | `1`, `2` or `3` — Beginner, Intermediate, Advanced |
| `title` | ≤ 60 characters; must be unique across all 86 catalog slots, planned ones included |

The slug is permanent once a lesson is public: it is the URL, the sitemap entry and the structured
data. Rename a title freely; renaming a slug costs a redirect.

### The level ladder

- **1 — Beginner.** One function, one range, a grid a first-week user can read. The learner should be
  able to predict the answer before typing it.
- **2 — Intermediate.** One function whose *arguments* are the lesson: match modes, criteria ranges,
  absolute references, tolerances. The exercise usually has a plausible wrong answer that looks right.
- **3 — Advanced.** Two moving parts, or one that has to be built rather than remembered: nested
  lookups, a formula that must survive being dragged, a capstone that combines techniques from earlier
  groups.

If a lesson needs three sentences to explain the task it is two lessons, or one lesson and a hint.

## The prompt

One imperative sentence, ≤ 220 characters, one action. It lives on the screen and it is the only text
the learner reads before typing.

```
In B6, look up the commission rate for the revenue in A6 across the bands in A2:B5, using approximate match.
```

Say what to produce and where; say which cells the answer has to use when that is part of the exercise.
Do not restate the explanation, do not name the technique twice, and do not write "in this exercise".
Name the function when the lesson is teaching that function — it is the subject, not a spoiler.

Two prompts that read alike are an error, not a warning: the index would link to two pages that sound
the same. Two sentences is a warning (`content:check` prints `prompt is 2 sentences — one imperative
sentence is the house style`), and it is usually telling you the exercise does two things.

## The grid

`grid.startCell` is the top-left cell; `grid.rows` is a list of equal-length row arrays of raw values
(numbers, strings, `null` for empty). `answerCell` and `requireRef` must both be inside it.

Keep it small — four to six rows, two or three columns. The learner has to do the arithmetic in their
head or on screen, so the data must be small enough that a correct answer is verifiable by reading, and
a wrong one is explainable in one sentence. `expect.value` is the number the answer must equal;
`expect.tolerance` is for money and rates (`0.0001` for a rate of `0.05`), never for counts.

`requireRef` is the cell the answer must depend on. It is what stops a plausible-looking hardcoded
number from passing, so point it at the input, not at a cell the learner could copy.

## The workbook

Every screen that shows a grid also ships a `.xlsx`, written by `legacy/src/xlsx.mjs` from the grid you
already authored. Nothing extra is written for it: `workbook-sheets.mjs` turns a grid into tabs, and
`workbookFile` in `legacy/src/site/sheet.mjs` renders the one link, so a lesson, a note and a problem
page cannot label the same download three ways.

| Screen | The file |
|---|---|
| A formula screen | Two tabs. `Exercise` is the grid as the page draws it, blanks included. `Solution` is the same grid with the reference formula written into the answer cell, as a live formula rather than a pasted number, so a reader can open it and watch it compute |
| A workbook screen | Its own authored sheet as one tab, because the sheet is the exercise |
| A picture or shortcut screen | No file. There is no grid to download |

The reference the `Solution` tab carries is the same one the grader reveals: `screen.reference` first,
then the lesson's `docs.reference`, then the first accepted fixture. That order is the rule, so a
`reference` you write as prose ("Orders, D4") is skipped rather than written into a cell.

The file name comes from `workbookName(slug, screenId)` and the address from `workbookUrl`, both in
`xlsx.mjs`. Do not link a workbook by hand: `legacy/src/verify.mjs` asserts that every page and every
file in `legacy/dist/workbooks/` agree, so a hand-written link is a build failure or, worse, a working
link to a file that no longer exists.

## Rules and hints

Rules make the exercise teach one thing instead of accepting any formula with the right number in it.

| Field | Says | Fails the run as |
|---|---|---|
| `require` | the answer must call this function, with at least `minArgs` arguments | that rule's `id` |
| `forbid` | the answer must not call this function | that rule's `id` |
| `requireRef` | the answer must depend on this cell | `require-ref` |
| `rules` | a specific argument must be one of `values` (`type: "matchType"`, `arg`, `func`) | that rule's `id` |

`require` is not optional: every screen needs at least one. `forbid` and `rules` default to empty.

**The `id` you write is the id the grader reports**, so name it after what it teaches — `func-sum`,
`func-vlookup`, `match-type`, `no-helper-column` — and file fixtures and hints under that exact string.
Every rule a screen advertises has to be reached by at least one rejected fixture, which is what keeps
the rule from being documentation.

`hints` is keyed by rule id, one sentence per key, saying what to do rather than what went wrong:

```json
"hints": {
  "syntax": "Start with = and close every bracket: =VLOOKUP(A6,A2:B5,2,TRUE).",
  "func-vlookup": "Use VLOOKUP itself — this exercise is about how its match mode behaves.",
  "match-type": "Write TRUE as the fourth argument: that is the approximate match this band table needs.",
  "require-ref": "Point the first argument at A6 so the rate follows the revenue, instead of typing 4200.",
  "value": "The rate for 4200 is the 5% band, so column 2 of A2:B5 and approximate match are both needed.",
  "error": "Check the range and the column index: A2:B5 has two columns, so the third argument can only be 1 or 2."
}
```

Every formula lesson can fail with `syntax`, `value` and `error`, so those three keys are always worth
writing. The grader's built-in `require-ref` failure also reads a `requireRef` hint if you prefer that
spelling, and a rule you name `matchType` will read a `match` hint — but the habit worth having is one
key per id you actually declared. Anything the grader cannot find falls back to `hints.value`, and a
rejection that lands on a rule with no hint is a warning in the gate: the learner got told no and
nothing else.

**Only a failure the screen can actually report may be keyed.** The gate rejects a formula screen whose
`hints` carries a key outside `value`, `syntax`, `error`, the ids in its own `require`/`forbid`/`rules`,
and `require-ref` when it pins a cell with `requireRef` — a hint filed under a rule you renamed or never
wrote is unreachable prose that reads correct in review. `hints.value` is required and must be text: it
is the layer under every other hint, and the player shows it when the grader has nothing more specific to
say. Each hint is one sentence under 300 characters.

Hints are prose the learner reads at the moment they are stuck, so write them in the same voice as the
prompt: what to change, in one sentence, without leaking the answer to the whole exercise.

## Fixtures

`fixtures.accept` are formulas that must grade `ok`; `fixtures.reject` are formulas that must fail. The
floor is **six of each** (`MIN_FIXTURES`); the plan asks for twelve, and the two shipped lessons that
need more — a capstone, a rule with several spellings — have them.

Accepted fixtures prove the exercise is passable by more than the one formula you had in mind: a lowercase
call, absolute references, a redundant `+0`, a function written with a different but equivalent
argument. Rejected fixtures prove it rejects each way of being wrong. Cover these, in this order:

1. **syntax** — unclosed bracket, stray operator.
2. **wrong function** — the plausible neighbouring function (`AVERAGE` where the exercise wants `SUM`).
3. **wrong argument** — too few arguments, or a range where a single value belongs.
4. **wrong reference** — the right formula aimed at the wrong cells, or the number typed in instead.
5. **wrong value** — the right technique with an off-by-one range.
6. **error path** — a formula that evaluates to `#VALUE!`, `#N/A` or `#REF!`.
7. **right answer, wrong technique** — the shortcut the lesson exists to discourage. This is the one
   that matters most, and the one `require`/`forbid`/`requireRef`/`rules` exist to catch.

Write rejections as objects so the reasoning travels with the case:

```json
{ "formula": "=VLOOKUP(A6,A2:B5,2,FALSE)", "rule": "match-type", "why": "exact match returns #N/A for 4200" }
```

`rule` is checked, not trusted: the gate compares it to what the grader reports and fails the fixture if
they disagree. That is how a rule name cannot quietly drift. `why` is for the next author, and the gate
refuses one shorter than fifteen characters — a reason that says "wrong" is not a reason.

Rules run before evaluation, so a formula can be rejected for the *shape* even when it would also error:
`=VLOOKUP(A6,A2:B5,2,FALSE)` reports `match-type`, not `#N/A`. Declare what the gate reports; if you
think the grader is wrong, that is a bug in the grader, not a fixture to loosen.

The two lists are proof, not decoration. If an accepted variant fails, the exercise is wrong and the
fixture is right.

## Variants

A `requireRef` stops the learner from typing a number that has nothing to do with the data. It does not
stop a formula that reads *too little* of it: `=AVERAGE(B2)+3.5` points at a real cell, passes a
`requireRef` on `B2`, and lands on the right average for the five scores on screen. It is wrong the
moment one score changes, and the learner is never told.

`variants` is how the screen says so. Each entry is a hidden edit to the grid plus the value the
reference answer produces after it:

```json
"variants": [
  { "id": "b2-up", "cells": { "B2": 86 }, "expect": { "value": 88.7 }, "why": "Ana goes from 85 to 86, so the average has to move with her" }
]
```

The learner sees nothing. When their formula produces the visible answer, the grader re-evaluates it on
each edited grid; if any copy misses its `expect.value`, the answer is rejected with the `hardcoded`
rule. The message is "right for this table, not for the same table with different numbers", so nobody
is called a cheater for an honest mistake.

Rules that matter when you write one:

- **At most three** (`MAX_VARIANTS`). One edit per input is the useful shape; three inputs is the most
  an exercise on this site has.
- **Edit an input, never the answer cell.** `cells` may not write to `answerCell`, and must stay inside
  the grid.
- **Do not edit a header.** On a grid taller than one row, the first row is labels; changing one
  rewrites the question instead of the data.
- **The edit must move the answer.** A variant whose `expect.value` equals `expect.value` is inert and
  the gate refuses it — it would prove nothing about anybody.
- **The edit must leave every accepted formula passing.** If `=ROUND(DAYS(C2,B2)/7,0)` is accepted
  today, a variant that only the un-rounded reference produces would reject a correct answer. The gate
  refuses an unpassable variant for exactly this reason.
- **`why` is read by the next author**, and it should say what changed and what that proves, not
  "different data".

A screen that declares `variants` now advertises the `hardcoded` rule, so two things become required:
a `hardcoded` rejection in `fixtures.reject` — which is the only way the path is known to work — and
`hints.hardcoded`, one sentence naming what the learner typed in. `=IF(VLOOKUP(D2,A2:C6,3,FALSE)=54000,54000,0)`
is the shape that works: it passes `require`, every `requireRef`, and the visible value, and fails only
the variant.

`npm run content:variants -- --lesson 07` derives candidates from `docs.reference` — or the screen's own
`reference` — by changing one input at a time, printing the values it computed. It is a starting point,
not an answer: read every `why`, keep the ones that teach something, and write the rejection yourself.
`--write` saves the proposal, `--screen n` narrows a multi-screen lesson, and a sweep with no
`--lesson` skips screens that already carry hand-written variants so it can never bury them.

**When not to declare variants.** If a screen genuinely wants a constant — "enter the 20% deposit rate"
— the exercise has no reference formula to re-evaluate and the `hardcoded` path would have nothing to
catch. Leave `variants` off. A screen whose answer cannot move when an input rises cannot have one
either: `=COUNT(B2:B9)` and `=COUNTA(B2:B9)` count the cells that exist, so no edit to a value changes
the answer. `content:variants` prints `nothing to propose` there and that is the honest answer, not a
missing step.

## The docs block

`docs` is what a learner reads after failing, and what search engines index. Everything here is
single-line prose in the JSON file except `explain`, which is paragraphs separated by a blank line
(`\n\n`) — a JSON string can hold them, and the page prints one `<p>` per block.

| Field | Limit | What it is |
|---|---|---|
| `syntax` | 120 | the function's signature, brackets and optional arguments included |
| `reference` | 120 | a formula, starting with `=`, that passes this exercise — identical to an accepted fixture |
| `explain` | 1,400 | two to four paragraphs on what the formula does *to this data* |
| `errors` | — | one or more `{ code, text }`, the failures this function actually returns |
| `atWork` | — | one sentence on where this shows up in a real workbook |
| `outcome` | 120 | what the learner can now do, phrased as a capability |
| `teaches` | 80 | the function or technique, as a learner would search for it |
| `dataset` | 60 | the data's name, so the page can describe itself |

`explain` carries the arithmetic. "The range stops at B5 because B6 is the answer cell" is worth more
than a description of `SUM`, and a learner who spots a wrong number in the explanation stops trusting
the page. `docs.errors` is the only place error codes are explained; the hints are for the *next
attempt*, these are for the post-mortem.

Every field in that table prints on a lesson page, so `npm run copy:check` reads them all — `explain`,
`atWork`, `outcome` and each `errors[].text` as prose, and `syntax`, `teaches`, `dataset`, each screen's
`prompt`, `alt` and `syntax` line as one-liners that still have to keep the house typography. A field
the reader can see is a field the gate reads.

### Paragraphs, and why the explanation is not one block

A 150-word block is where a reader gives up, and it is the shape every generator produces. The
explanation is written as two to four paragraphs, at most 70 words and four sentences each, and each
paragraph carries one idea:

1. **What the thing does**, in the first sentence on the page. Name the function or the move, then the
   mechanical detail that changes an answer.
2. **What this sheet asks**, including the trap. Instruction, not a summary of the prompt.
3. **The failure and the habit that prevents it.** Optional: leave it out when 1 and 2 already say it.

```json
"explain": "SUM adds every number in the range you point it at, and it reads a range, not a column. Text, blanks and logical values inside that range are ignored rather than counted as zero, so a total can come out smaller than the column looks.\n\nHere the Q1 column holds a text note in B6. Summing B2:B9 returns 3580, while the nine cells you can see add up to 3580 plus nothing.\n\nPoint it at the cells you can see and the trap is already in the range. Click B2 and drag to B5 instead, which is what a reviewer checks first."
```

A single newline inside a paragraph is treated as a hand-wrapped line and collapses to a space, so
only a blank line starts a new paragraph. Two paragraphs is the floor: `content:copy` reports an
`explain-shape` finding for a lesson still written as one block, and the schema refuses it outright.

The same shape applies to the project track. A project's `docs.explain` is two to four paragraphs, and
`content:copy` measures its brief, its notes and each task's prompt and hints beside the lessons, so a
project cannot ship text a lesson would be failed for.

### One screen's notes

A lesson with several screens can also give a screen its own `docs`, with the same three prose fields and
tighter limits — `syntax` 120, `explain` 700 (paragraphs, same shape as the lesson block),
`reference` 200:

```json
"docs": {
  "syntax": "=XLOOKUP(lookup_value, lookup_array, return_array, [if_not_found], [match_mode], [search_mode])",
  "explain": "This is the same shape as the screen above, one row lower...",
  "reference": "=XLOOKUP(A8,A2:A6,B2:B6,,0,-1)"
}
```

It renders inside that screen's panel, above the cheat sheet, and it is for *this* screen only — the
lesson's own `docs` is still the page's drawer and the thing search engines index. Reach for it when a
later screen changes the tool, the range or the direction of the search, and leave it out when the
lesson's `docs` already says it. A single-screen lesson cannot have one: it is the lesson.

Links in `docs` and `hints` must point at pages that exist: `/learn/excel/<slug>`, `/excel/<slug>`, or
`/`. Anything else fails the gate, including `/lessons` and `/learn/excel`, which the site never serves.

## The site's own copy

The lessons are not the only words on the site. The header, the footer, the pricing page, the legal
pages, the empty states and every message the drill speaks are measured by `npm run copy:site`, which
applies the same rulebook in `packages/content-lint/data/copy-rules.json` to two kinds of surface:

- **Rendered pages.** Every page the legacy renderer can prepare is built in memory and split into
  blocks, so a finding quotes the sentence a reader sees rather than the string in the source.
- **Source modules.** The client modules, the grader and the Next-only pages that the renderer never
  sees are read string by string, with comments stripped and code fragments filtered out.

```bash
npm run copy:site                          # the report; exits non-zero on any finding
npm run copy:site -- --where page:/pricing # one page or one module
node packages/content-lint/cli.js site     # the same report that never fails, for reading
npm run copy:site:write                    # store the inventory the next review diffs
```

`npm run copy:site` runs with `--strict`, so `npm run check` is the gate: a finding fails it. Without
that flag the command prints the same findings and exits 0, which is what you want mid-rewrite.

A page name is `page:/pricing`; a source file is `module:legacy/src/client/drill.js`. `--where`
matches a substring of either, so `--where drill.js` is enough.

Two things are deliberate. A short page title is measured after the site name is appended, because
that is the title a search result shows. And a template hole is counted as `N`, so a sentence that
interpolates a value is still read as a sentence rather than skipped as code.

## Picture screens

A `picture` screen shows an image and asks what it says. Reach for one when the answer is about a sheet
you would have to describe rather than a formula the learner can run — a range that points at the wrong
column, a reference that should be absolute, a chart whose series is mislabelled. Type `formula` covers
everything a formula bar can settle; a picture covers what an eyeball has to.

```json
{
  "id": "picture-1",
  "type": "picture",
  "prompt": "The bar's third argument points at an empty column — which range should it read the price from?",
  "image": "images/xlookup-third-argument.svg",
  "alt": "The lesson's sheet: SKU in column A and price in column B for rows 2 to 6, and row 7 asking for TX-101. The formula bar reads =XLOOKUP(A7,A2:A6,C2:C6,,0,-1) with C2:C6 underlined in red as the third argument, and column C is empty.",
  "answers": ["B2:B6"],
  "hints": {
    "value": "The third argument is the range XLOOKUP reads the answer from, so it covers the price column's data rows."
  }
}
```

- **`image`** lives under `legacy/content/images/`, is a flat lowercase kebab name, and ends in `.svg`
  or `.png`. The build copies the directory to `assets/img/`, so a path with a directory or a URL
  renders broken and the gate rejects it.
- **`alt`** is not a caption: it is the question. A learner who cannot see the image has to be able to
  answer from this text alone, so it names the columns, the rows, the values that matter, and what is
  wrong in the picture. 240 characters is the limit, not the target.
- **`answers`** are the accepted spellings of one fact, best first — the first one is what the reveal
  prints. Grading folds case, whitespace, `$` and a leading `=`, so `B2:B6`, `$b$2:$b$6` and
  `=B2:B6` are the same answer and the gate rejects a second spelling that folds to the first. Each is
  at most 80 characters.
- **`hints`** takes `value` only. There is no formula to debrief, so `syntax`, `error` and the rule keys
  do not apply. Write it even though the schema allows omitting it: a screen without one answers a miss
  with nothing, and the gate warns to that effect.
- **No formula fields, and not by omission.** `grid`, `answerCell`, `expect`, `require`, `forbid`,
  `requireRef`, `rules`, `fixtures` and `reference` are all rejected on a picture screen: a leftover
  `grid` would render a sheet over the image, and a leftover `reference` would print a formula where the
  answer is a range.

Pictures are worth an SVG you draw yourself: the first-party asset has no licence question, scales on a
high-density display, and weighs less than a screenshot of the same sheet. Draw the sheet as the lesson
actually shows it — same values, same highlight — because the prompt and the image disagreeing is the
one bug a reader cannot catch from the JSON.

## Shortcut screens

Two screen types ask for the keyboard instead of the formula bar: `chord` for one shortcut, `sequence`
for Excel's ribbon access keys, which are several presses in order. Reach for one when the lesson is
about reaching a feature rather than computing an answer.

```json
{
  "id": "chord-1",
  "type": "chord",
  "prompt": "Turn filters on for the table without touching the mouse.",
  "keys": ["Ctrl+Shift+L"],
  "hints": {
    "value": "Filters sit at the end of the Data tab's Sort & Filter group — and they are a toggle, so the same keys turn them off."
  }
}
```

```json
{
  "id": "sequence-1",
  "type": "sequence",
  "prompt": "Reach the number-format menu from the ribbon's access keys.",
  "steps": ["Alt", "H", "N", "O"],
  "hints": {
    "value": "Alt opens the ribbon's access keys, then one letter per tab and per item."
  }
}
```

- **`keys`** are the accepted presses of one shortcut, best first — the first is what the reveal prints,
  and the rest are other spellings of the same press. Order of modifiers is not a spelling: `Ctrl+Shift+L`
  and `Shift+Ctrl+L` are one press, so listing both is a gate failure, not a second answer. Write `Mod`
  when Excel documents Ctrl and the shortcut should follow the platform (Command on a Mac); write `Ctrl`
  when the platform really is Ctrl.
- **`steps`** are presses in order, each parsed as a press rather than a chord, so a modifier on its own
  (`Alt`) is a step. Anything the learner presses out of order starts the sequence over.
- **`expect.value` is written from the list**, not by you: the schema stores `"Ctrl + Shift + L"` or
  `"Alt then H then N then O"` for the reveal and for the solved line. The page prints the keys in the
  learner's own words (`⌘⇧L` on a Mac) whatever the content says.
- **No formula fields.** `grid`, `answerCell`, `expect`, `require`, `forbid`, `requireRef`, `rules`,
  `fixtures` and `reference` are rejected, the same way they are on a picture screen. `docs.reference`
  names the shortcut itself — `"Ctrl+Shift+L"` — because a lesson whose screens are all shortcuts has no
  formula to work, and the worked example is hidden on the page.
- **A reserved chord needs the typed fallback to be honest about it.** `Ctrl+T` and friends are eaten by
  the browser before the page sees them; `content-lint` warns so the lesson does not become unpassable,
  and the learner can always type the shortcut into the bar instead.
- **`hints` takes `value` only**, and a missing one warns — a miss that explains nothing teaches nothing.

The page puts the caps in a focusable panel and focuses it, so the first press lands on the page rather
than in the bar. A bare letter typed while the panel has the focus is not graded, because it is on its
way to the bar; only the first press of a sequence, a press with a modifier, or a named key (`Enter`,
`Tab`, `Escape`, `ArrowDown`…) counts. `Escape` starts a mistake-strewn sequence over without spending
an attempt.

## The catalog slot

`legacy/content/track.json` is the site map: 16 groups, 86 slots. A planned slot is
`{ title, level, group }`; authoring it replaces that with `{ id, group }`, because the title, slug and
level now live in the lesson file and must not be written twice. `content:new` does this for you.

The catalog is full — all 86 slots are authored — so `content:new` refuses rather than inventing a
slot: `group "lookup" has no planned slots left — add one to track.json before scaffolding a lesson in
it`, or `every slot in the catalog is authored — add a planned slot to track.json before scaffolding
one` when no group is named. A new lesson therefore starts by appending a slot to the group it belongs
to; slots are permanent and are never renumbered or reused. `--lesson <n>` is the file number and must
be the next one in order, one past the highest in the catalog (`lesson 17 cannot be created — 90 is the
next free number, because ids follow the order lessons were written in`); it does not pick the catalog
slot.

A group a learner can reach owes an `intro` (150–250 words, authored). If you publish the first lesson
in a group, write its intro in the same change; the gate fails the run otherwise. `freeLessons` in
`track.json` names which published lessons are free, by id; the count the pages print is derived from
that list, so there is no second place to keep in step.

`showAnswerAfter` (default 3, integer 1–10) is how many misses a screen takes before it offers the
reference answer. It is one number for the whole track rather than per screen: it encodes how much
struggle the site thinks is useful, and a learner should not be able to tell which lesson they are on
from the number of tries they get.

## Definition of done

- [ ] `id` matches the file name, `slug` is kebab, `title` is under 60 and not used by another slot.
- [ ] The prompt is one imperative sentence that names the cell, the task and any input the answer must use.
- [ ] The grid is small enough to check by hand, with the answer cell inside it and `expect.value` computed, not guessed.
- [ ] At least one `require` rule, and every rule has a hint keyed by its own id — no key a screen cannot report.
- [ ] Six accepted fixtures, six rejected, all seven kinds of rejection covered, every advertised rule reached.
- [ ] If the screen declares `variants`: at most three, one per input, each one moving the answer, each leaving every accepted fixture passing — plus a `hardcoded` rejection and `hints.hardcoded`.
- [ ] `docs` complete: `reference` is an accepted formula, `explain` carries the arithmetic, `errors` are real codes.
- [ ] The catalog slot points at the file, and the group has an intro.
- [ ] `npm run content:check`, `npm test` and `npm run verify` are green.
- [ ] A second person has read the lesson and passed it without asking you anything.

The last one is not ceremony. Every rule above is checkable by a machine; whether the prompt says what
the exercise wants is not.

## Worked example: lesson 11

Catalog slot 37, group `lookup`, level 2. Published as lesson 8 of 11 because eight published lessons
come before it. This is the file `content:new --lesson 11 --group lookup` scaffolds the shape of, with
an author's exercise in it. It is not copied from the reference site: the bands, the numbers and the
explanation are ours.

```json
{
  "id": "11-vlookup-approximate-match-needs-a-sorted-column",
  "slug": "vlookup-approximate-match-needs-a-sorted-column",
  "level": 2,
  "title": "VLOOKUP: approximate match needs a sorted column",
  "schemaVersion": 2,
  "screens": [
    {
      "id": "formula-1",
      "type": "formula",
      "prompt": "In B6, look up the commission rate for the revenue in A6 across the bands in A2:B5, using approximate match.",
      "grid": {
        "startCell": "A1",
        "rows": [
          ["Revenue", "Rate"],
          [0, 0.02],
          [1000, 0.05],
          [5000, 0.08],
          [10000, 0.1],
          [4200, null]
        ]
      },
      "answerCell": "B6",
      "expect": { "value": 0.05, "tolerance": 0.0001 },
      "require": [{ "id": "func-vlookup", "func": "VLOOKUP", "minArgs": 3 }],
      "requireRef": "A6",
      "rules": [{ "id": "match-type", "type": "matchType", "func": "VLOOKUP", "arg": 4, "values": [true] }],
      "hints": {
        "syntax": "Start with = and close every bracket: =VLOOKUP(A6,A2:B5,2,TRUE).",
        "func-vlookup": "Use VLOOKUP itself — this exercise is about how its match mode behaves.",
        "match-type": "Write TRUE as the fourth argument: that is the approximate match this band table needs.",
        "require-ref": "Point the first argument at A6 so the rate follows the revenue, instead of typing 4200.",
        "value": "The rate for 4200 is the 5% band, so column 2 of A2:B5 and approximate match are both needed.",
        "error": "Check the range and the column index: A2:B5 has two columns, so the third argument can only be 1 or 2."
      },
      "fixtures": {
        "accept": [
          "=VLOOKUP(A6,A2:B5,2,TRUE)",
          "=vlookup(a6,a2:b5,2,true)",
          "=VLOOKUP($A$6,$A$2:$B$5,2,TRUE)",
          "=VLOOKUP(A6,A2:B5,2,1)",
          "=VLOOKUP(A6,A2:B5,2,TRUE)+0",
          "=VLOOKUP(A6,$A2:$B5,2,TRUE)"
        ],
        "reject": [
          "=VLOOKUP(A6,A2:B5,2,TRUE",
          "=INDEX(B2:B5,MATCH(A6,A2:A5,1))",
          "=VLOOKUP(A6,A2:B5,2)",
          "=VLOOKUP(4200,A2:B5,2,TRUE)",
          "=VLOOKUP(A6,A2:B5,1,TRUE)",
          "=VLOOKUP(A6,A2:B5,\"two\",TRUE)",
          "=VLOOKUP(A6,A2:B5,2,FALSE)"
        ]
      }
    }
  ],
  "docs": {
    "syntax": "=VLOOKUP(lookup_value, table_array, col_index_num, [range_lookup])",
    "explain": "VLOOKUP walks down the first column of the table and stops at the last value that does not overshoot the lookup value, which is why the bands have to be sorted ascending: 4200 belongs to the 1000 band, and an unsorted table would return whatever row happened to sit before it. The fourth argument decides that behaviour. TRUE, or leaving it out, asks for the approximate match a band table needs; FALSE demands an exact match and returns #N/A for 4200 because no band starts there. This is the case VLOOKUP is genuinely better at than an exact lookup, so the exercise asks for the match mode rather than a bigger table.",
    "errors": [
      { "code": "#N/A", "text": "The lookup value falls below the first band, so VLOOKUP walked off the top of the table without finding a row." },
      { "code": "#VALUE!", "text": "The column index is text or the range is not a block of cells, so VLOOKUP has no column to read from." },
      { "code": "#REF!", "text": "The column index points past the right edge of the table, so the answer sits outside the range you selected." }
    ],
    "atWork": "Commission tiers, postage bands and tax brackets are all sorted tables that are meant to be read approximately.",
    "outcome": "Read a band table with VLOOKUP and know when approximate match is the right mode.",
    "teaches": "VLOOKUP approximate match",
    "dataset": "Commission bands by revenue",
    "reference": "=VLOOKUP(A6,A2:B5,2,TRUE)"
  }
}
```

What `content:fixtures --lesson 11` prints:

```
11-vlookup-approximate-match-needs-a-sorted-column — VLOOKUP: approximate match needs a sorted column
  ✓ =VLOOKUP(A6,A2:B5,2,TRUE)        accepted
  ✓ =vlookup(a6,a2:b5,2,true)        accepted
  ✓ =VLOOKUP($A$6,$A$2:$B$5,2,TRUE)  accepted
  ✓ =VLOOKUP(A6,A2:B5,2,1)           accepted
  ✓ =VLOOKUP(A6,A2:B5,2,TRUE)+0      accepted
  ✓ =VLOOKUP(A6,$A2:$B5,2,TRUE)      accepted
  · =VLOOKUP(A6,A2:B5,2,TRUE         rejected (syntax)
  · =VLOOKUP(A6,A2:B5,2)             rejected (match-type)
  · =VLOOKUP(A6,A2:B5,2,FALSE)       rejected (match-type)
  · =INDEX(B2:B5,MATCH(A6,A2:A5,1))  rejected (func-vlookup)
  · =VLOOKUP(4200,A2:B5,2,TRUE)      rejected (require-ref)
  · =VLOOKUP(A6,A2:B5,1,TRUE)        rejected (value)
  · =VLOOKUP(A6,A2:B5,"two",TRUE)    rejected (error)
  13 fixtures — the floor is 6 accepted + 6 rejected
```

Read the two `match-type` rows as the lesson: omitting the fourth argument and writing `FALSE` are the
same mistake in two spellings, and both are what the exercise exists to catch. `=VLOOKUP(A6,A2:B5,2,1)`
is accepted because Excel's `TRUE` *is* `1` — writing the fixture is what proves that, rather than
assuming it.

And `content:preview --lesson 11`:

```
34. VLOOKUP: approximate match needs a sorted column — /learn/excel/vlookup-approximate-match-needs-a-sorted-column
   Intermediate · Looking values up · paid

   In B6, look up the commission rate for the revenue in A6 across the bands in A2:B5, using
   approximate match.

     A        B
   1 Revenue  Rate
   2 0        0.02
   3 1000     0.05
   4 5000     0.08
   5 10000    0.1
   6 4200     [answer]

   answer B6 · grid A1:B6
```

The preview wraps at the page width, so it is also how you find out that a prompt nobody would read on
one line in the JSON file is three lines of dense text on the page.

## When the gate disagrees with you

`content:check` collects instead of stopping, so read the whole list before editing. The messages are
written to be actionable:

- `accepts "=..." but the grader rejects it (rule: message)` — either the formula is wrong (usual) or
  the exercise is (the requirement is stricter than the lesson meant).
- `rejects "=..." but the grader accepts it` — the technique you thought you forbade, you did not.
- `"..." is filed under "x" but the grader reports "y"` — fix the `rule` on the fixture, then read the
  hint for `y` and check it teaches that failure.
- `never exercises the "x" failure, so that path ships untested` — add a fixture, do not delete the rule.
- `has N accepted fixtures, the floor is 6` — the floor exists because six is roughly the point where a
  exercise stops passing for the wrong reasons.
- `"..." needs { formula, rule, why }` — a rejection written as a bare string; it has no rule to check and
  no reason to read, so retype it as an object.
- `prompt is a duplicate of the one in <file>` / `links to "/...", which is not a page that
  exists` — copy-paste, usually.

A schema error is a hard stop with one message, because there is nothing to lint: the loader reports
`content/exercises/<file>.json: <problem>` and the rest of the run is skipped. Fix that first.

If the gate and your lesson disagree and you cannot tell who is wrong, that is the moment to ask,
not to loosen a fixture.

# Writing a function note

A note (`legacy/content/articles/*.md`) is a page about one function or question that a search result
can land on. It is written content, so most of it is prose, and the gate below exists only to keep the
prose from quietly losing its skeleton six months after it was written.

`npm run content:articles` is the gate; `npm run content:check` runs it as part of the full sweep. The
rules live in `packages/content/articles.js`, in one `parseArticle` a person can read in a minute.

## The seven sections

Frontmatter, then a section for each of the seven parts. All seven are required, in this order:

| Section | What the gate checks |
|---|---|
| The answer, as a paragraph | The first block is a paragraph, not a heading. A page that makes the reader scroll before it says anything has lost the click |
| `## Syntax` | `syntax:` starts with `=`; the section carries the signature |
| `## Examples` | 2–4 `### Example 1` … headings. One is an advert, ten is a manual |
| `## What goes wrong` | A table, and every backticked `#CODE` in it is a code `packages/grader/errors.js` can actually return |
| `## Alternatives` | A code span shaped like a call (`=XLOOKUP(`), plus a version marker: `2019`, `365`, `Excel 2021` or `Sheets` |
| `## Other apps` | At least two of `Sheets`, `VBA`, `Google`, and at least one code span |
| `## Practice` | The exercise islands render here, after the practice prose |
| `## Questions` | The questions a reader arrives with, answered in prose |

The version marker in `## Alternatives` is the part people skip. "Use INDEX/MATCH instead" without
saying which versions have XLOOKUP is advice that breaks on the reader's install.

## Frontmatter

```
---
title: SUM in Excel, the whole column in one number
summary: One sentence, the answer, no teaser.
description: The 70–155 character snippet a search result shows.
function: SUM
drills: sum-basics, sum-across-several-blocks, running-total-down-a-column
syntax: =SUM(number1, [number2], ...)
updated: 2026-02-14
---
```

`drills:` is one to six lesson slugs, easiest screen first, and it is the note's whole arc: the page
renders one exercise island per slug, in order, with the guidance fading as they go. Island 1 shows its
answer open, island 2 closed, islands 3 and up hide the answer until the reader has missed twice.

- **The slugs must already exist.** A note adds no lessons; the exercises it borrows are screens that ship
  on their own.
- **At least one exercise practises `function:`.** The rest may be neighbours — a SUMIF note that ends on
  `SUMIFS` teaches more than one that repeats `SUMIF` four times. A note whose exercises are all contrast
  lessons fails in `articleProblems`.
- **The first exercise is the note's own lesson.** It is the one the page opens with and the one that
  carries the door back to the note from the lesson page, so put the screen that matches the title
  first.
- **`exercise:` still parses**, with a warning, so an old draft keeps loading; setting both keys is an
  error, because the page would render one exercise twice.

## Length

700 to 1,800 words, counted over the body. Under 700 is thin, and thin is the real risk on a page that
competes with a forum thread. Over 1,800 competes with itself for the same query. The eight notes that
ship land between 983 and 1,101 words; the ceiling is headroom, not a target.

## Definition of done for a note

- [ ] The seven sections are present, and the first block is the answer.
- [ ] `drills:` lists 1–6 existing lesson slugs, easiest first, the first one requiring `function:`.
- [ ] `## Alternatives` names the modern replacement **and** the version it arrived in, and says where
      the old function is still the right answer.
- [ ] `## Other apps` says what the equivalent is in Sheets and in VBA, or says honestly that there is
      none.
- [ ] Every `#CODE` in the errors table is a code the grader returns.
- [ ] 700–1,800 words; no em dash, curly quote, ellipsis or emoji; no sentence over 30 words.
- [ ] `npm run content:articles` reports zero findings, and `npm test` is green.
- [ ] A second person has read it and done every exercise without asking you anything.

## When the note gate disagrees with you

- `missing the "## alternatives" section` — a heading was renamed or the section was dropped; the id
  comes from the heading text, so `## Other ways` is not `## Alternatives`.
- `"## Alternatives" names no other function in a code span` — a code span that looks like a call is
  required; `` `SUBTOTAL` `` is a name, `` `=SUBTOTAL(9, B2:B4)` `` is checkable.
- `"## Other apps" names 1 of Sheets/VBA/Google, expected 2` — one app is a mention, not a comparison.
- `"#SPILL!" is not an error the grader returns` — the table promised a diagnosis the exercise behind it
  cannot produce.
- `has 0 drills, expected 1 to 6` / `the drill "x" is listed twice` — frontmatter, not prose.
- `below the 700-word floor` — usually a dropped section, not a short note.
- `none of its drills exercises SUM, so the note practises something else` — the note is about a
  function none of its drills require; swap a slug for one whose screen uses it.

# Writing a problem page

A problem page (`legacy/content/formulas/*.md`, served at `/formulas/<slug>`) is about a job, not a
function. The note answers "what is XLOOKUP"; the problem page answers "how do I look a value up when it
is to the left of the key", which is what a person actually types into a search box. The job is the
`title`, the `question` field and the search term at once, which is why the gate here is stricter about
shape and looser about vocabulary than the note gate.

`npm run content:formulas` is the gate; `npm run content:check` runs it as part of the full sweep. The
rules live in `packages/content/formulas.js` (`parseFormula`, `formulaProblems`) and
`packages/content-lint/formulas.js`. There is no `--write` for these: copy the frontmatter of the nearest
sibling page and rewrite it, because a problem page's shape is inherited from its family, not generated.

## The four sections

Frontmatter, then an opening paragraph, then four sections. All four are required, in this order:

| Section | What the gate checks |
|---|---|
| The answer, as a paragraph | The first block is a paragraph, and it says the answer. A page that opens with a heading made the reader scroll to find out whether it is the right page |
| `## Answer` | The section opens with the formula in a code span that starts with `=`. The reader who is late for a meeting copies one line and leaves; that line is the page |
| `## Why it works` | Non-empty. This is the part that makes the formula checkable rather than memorised |
| `## What goes wrong` | Exactly one table, and every backticked `#CODE` in it is a code `packages/grader/errors.js` can return. Two tables is a page arguing with itself; none is a page that never says how it fails |
| `## Practice` | Non-empty, and the exercise islands render under it |

Only `##` and `###` headings, paragraphs, `- ` lists and pipe tables are allowed — the same Markdown
subset the notes use, because both go through `packages/content/markdown.js`. Anything else throws.

## Frontmatter

```
---
title: Say "not stocked" instead of #N/A
question: How do I show a message when the lookup finds nothing?
summary: One sentence, the answer, no teaser.
description: The 70–155 character snippet a search result shows.
function: XLOOKUP
family: lookup
drills: xlookup-with-a-fallback-when-nothing-matches
updated: 2026-02-20
---
```

- **`title` is the answer's name, `question` is the search term.** They cannot be the same string, and
  `question` must end in `?`. The `h1` is the title; the question is the lede and the `<title>`.
- **`function` is upper-case**, because it is printed as a defined term and matched against the notes.
- **`family` is one of four**, because the hub groups by it and a reader arrives wanting "a lookup
  problem", not "alphabetical by slug":

| Family | Shelf on the hub |
|---|---|
| `lookup` | Finding a value: VLOOKUP, HLOOKUP, XLOOKUP, INDEX/MATCH |
| `aggregate` | Adding the rows that match: SUMIF and its neighbours |
| `count` | Counting what qualifies: COUNT, COUNTA, COUNTIF |
| `round` | Rounding and packing: ROUNDUP, ROUNDDOWN |

`drills:` is one to four lesson slugs, easiest screen first. The slugs must already exist — a problem
page adds no lessons; the exercises it borrows are screens that ship on their own. At least one of them
must actually exercise `function:`. The first slug is the page's own lesson: it is rendered first and it
is the screen that carries the door back to the page.

## The way out

Every page ends in a `### Where to go next` table, and the two link rules are checked across the page:

- **At least two sibling problem pages**, so a reader whose question was almost this one can walk the
  silo instead of bouncing. The renderer also puts the nearest three in the `Keep going` list under the
  article; the table is the author's own ordering and the one the gate reads.
- **At least one `/excel-functions/<slug>` note.** The page shows one formula; the note explains the
  function. A page with no note link leaves the reader without the rest of the story.
- **Every internal link resolves.** `formulaProblems` checks each `href` against the paths the site
  actually serves, so a renamed slug is a build failure rather than a 404 a month later.

The table is a `table` block, not prose, for a mechanical reason: `readingEase` counts raw Markdown
including URLs, and a paragraph of six links drags the page under the Flesch floor. Tables are scored as
a table, not as a sentence.

## Length

500 to 1,200 words, counted over the body. Under 500 is a stub on a page competing with a forum thread;
over 1,200 competes with itself for the same query. The twelve pages that ship land between 646 and 779
words, mean 711. The ceiling is headroom, not a target.

## Definition of done for a problem page

- [ ] `question` is the search term, ends in `?`, and differs from `title`.
- [ ] The opening paragraph answers it, `## Answer` leads with the formula, all four sections exist.
- [ ] `## What goes wrong` is exactly one table and every `#CODE` is one the grader returns.
- [ ] `drills:` lists 1–4 existing lesson slugs, the first one exercising `function:`.
- [ ] `### Where to go next` links ≥2 sibling pages and ≥1 function note, and every link resolves.
- [ ] 500–1,200 words; no em dash, curly quote, ellipsis or emoji; no sentence over 30 words.
- [ ] `npm run content:formulas` reports zero findings (a `note-coverage` warning is allowed only while
      the function genuinely has no note yet, and it is recorded in the phase doc as debt).
- [ ] `npm test` is green and `node legacy/src/verify.mjs` passes — the page is crawled, not just parsed.

## When the gate disagrees with you

- `the first block must be the answer, as a paragraph` — the page opens with a heading, a list or a
  table. Lead with the sentence that answers the question.
- `"## Answer" leads with "SUMIF", not a formula` — the code span has to start with `=`; a bare function
  name is not a formula a reader can paste.
- `"What goes wrong" has 0 tables, expected exactly 1` — the section is prose. The table is the part
  people come back for: symptom on the left, fix on the right.
- `"#REF" is not an error the grader returns` — the table promised a diagnosis the exercise behind it cannot
  produce.
- `"question" must be the question, ending in "?"` / `title repeats the question; give the answer a name`
  — frontmatter, not prose.
- `family "lookups" is not one of lookup, aggregate, count, round` — the shelf name is singular.
- `the drill "x" does not exist` / `none of its drills uses SUMIF, so the page drills something else` —
  a typo in `drills:`, or a page borrowing screens that practise a different job.
- `links to 1 sibling problem pages, expected 2` / `links to no function note` — the way out is missing.
- `1462 words, above the 1200-word ceiling` — usually two questions in one page; split the second into
  its own file, which is also its own search result.

# Writing a shortcut page

A shortcut page (`legacy/content/shortcuts/*.md`, served at `/shortcuts/<slug>`) is a table of chords
for one family of work: moving around, selecting, formatting, writing formulas, cleaning data, arranging
windows. The table is the page. Prose about shortcuts is a paragraph a reader skims and forgets, so the
gate is written around the table and the prose that has to justify it.

`npm run content:shortcuts` is the gate (`content-lint shortcuts`; add `--strict` to fail on the
warnings too, which is what a page being finished wants). The rules live in `packages/content/shortcuts.js` (`parseShortcut`, `shortcutProblems`) and in
`packages/content-lint/shortcuts.js`. There is no `--write`: copy the nearest sibling page and rewrite
the rows, because the six families are a fixed set and a seventh is a design change, not a new file.

## The six families, and why the slugs are fixed

| Slug | The shelf |
|---|---|
| `navigation` | Moving around the workbook |
| `selection` | Selecting cells and ranges |
| `formatting` | Formatting what you selected |
| `formulas` | Writing and checking formulas |
| `data` | Sorting, filtering and cleaning data |
| `window` | Windows, panes and sheets |

The slug is also the family id, in the order the hub lists them. A file whose slug is not one of these
six is an error, and a family with no file is an error too: `FAMILIES` is the list the hub shelves by, so
`copy` becoming a seventh directory is a decision that starts in that array.

## The four sections

Frontmatter, then a one-line framing paragraph if it helps, then four sections. All four are required,
in any order after `## Shortcuts`, and none may be repeated:

| Section | What the gate checks |
|---|---|
| `## Shortcuts` | Exactly one table. A page with a table and three paragraphs has not decided what it is |
| `## When to use it` | Non-empty. This is why the family exists, in one paragraph |
| `## Checked against` | Non-empty. Shortcuts drift between releases, so the page says which version and date each row was checked against. It is the honest answer to "is this current?" |
| `## Practice` | Links exactly one `/excel/<slug>`, and that lesson has a chord or sequence screen. The page ends somewhere the reader can press a key |

## The table

The header is exactly `Action | Windows | macOS | Sheets`, and the body is 8 to 24 rows:

```
| Action | Windows | macOS | Sheets |
|---|---|---|---|
| Jump to the last cell with data | `Ctrl + End` — or `Ctrl + ArrowRight` twice | `Ctrl + Fn + Right` | `Ctrl + End` |
| Select to the edge of a block | `Ctrl + Shift + End` | `Ctrl + Shift + Fn + Right` | `Ctrl + Shift + End` |
| Move one sheet along | `Ctrl + PageDown` | `Ctrl + PageDown` | No default — use the sheet tabs |
```

- **Every platform cell starts with a code span of keys.** Optionally followed by `— ` and a sentence.
  The renderer turns the code span into a keycap and the sentence into the small print under it. A cell
  of plain prose has no keycap, and a table that cannot be read at a glance is a paragraph in disguise.
- **`No default` names the menu instead of inventing a chord.** A guessed chord is exactly the kind of
  error this silo would be believed for. When Windows and macOS both have no default, the row belongs on
  neither tab and is refused: a row with no answer on the two tabs every page offers is not a row.
- **An action is at least eight characters,** so it reads as a job rather than a label ("Freeze" is a
  heading; "Freeze the top row" is an action).
- **No chord appears twice in the silo.** `shortcutProblems` compares keys per platform across all six
  pages, because the copy-paste that turns six pages into one page six times always shows up there
  first.

## Frontmatter

```
---
title: Excel shortcuts for moving around a workbook
summary: Jump to the last row, walk to an edge, and hop sheets without touching the mouse.
description: The 70-155 character snippet a search result shows.
platforms: windows, macos, sheets
updated: 2026-02-20
---
```

- **`title` is 18 to 60 characters** and names the family the way a reader searches for it. `summary`
  is the sentence under the `h1`.
- **`platforms` starts with `windows, macos`,** because those are the two tabs every page offers. Add
  `sheets` only when the family has real Google Sheets answers: when it is listed, every Sheets cell must
  have keys, and when it is absent, every Sheets cell must say `No default`. One field, one meaning.
- **A tab is a promise.** `platforms` lists `sheets` and no row answers on it is an error, not a warning
  (`the page offers the sheets tab and no row answers on it`).
- **`updated` is the date you last checked the rows,** not the date you last edited the file.

## The way the page renders

You write the table once; the renderer does three things with it that you should not do by hand:

- **All offered columns are in the HTML.** The tabs are real links to `?platform=macos`, and the script
  hides the columns that are not selected. That means the page works with no JavaScript (all four
  columns, one sheet), prints as one table, and reads to a crawler as the complete answer.
- **Windows is the default tab,** and the untabbed URL is its canonical. The other two tabs carry their
  own canonical, so the three states do not compete for one search result.
- **A coarse pointer gets one banner,** above the table and never over it, offering the exercise path
  instead. It is dismissible and the dismissal is remembered. Nothing you author changes this.

## Length

There is no word floor: the table is the content, and eight rows is a page. The prose that is scored is
the `summary`, the `description`, the paragraphs, the headings, the list items and the notes in the key
cells. Keys are never scored as sentences, because `Ctrl + Shift + End` is not one. Keep to the house
copy rules: sentences under 30 words, mean under 22, no em dash, no curly quote, no ellipsis, no emoji.

## Definition of done for a shortcut page

- [ ] The file is named for one of the six families, and the rows are actions rather than labels.
- [ ] `## Shortcuts` holds exactly one table, 8 to 24 rows, header exactly `Action | Windows | macOS | Sheets`.
- [ ] Every platform cell leads with a code span, and every cell without an answer says `No default` and
      names the menu it lives on.
- [ ] `platforms` matches the table: `windows, macos` first, `sheets` only where the answers are real.
- [ ] `## When to use it`, `## Checked against` (with a version and a date) and `## Practice` all exist
      and say something.
- [ ] `## Practice` links one `/excel/<slug>` that exists and presses keys.
- [ ] No chord already listed on another family's page for the same platform.
- [ ] `npm run content:shortcuts` reports zero findings, `npm test` is green, and the page is crawled by
      `node legacy/src/verify.mjs`.

## When the gate disagrees with you

- `"Ctrl + End" does not lead with the keys in a code span` — the cell is plain text. Wrap the keys in
  backticks and put the note after `— `.
- `"## Shortcuts" has 3 tables, expected exactly 1` — usually a second table under `## Checked against`.
  A version line belongs in a paragraph, not a grid.
- `11 rows, expected 8 to 24` — a family of four shortcuts is a paragraph on another page's worth of
  content; either find the rest of the family or fold it into a neighbour.
- `the Sheets cell has an answer but "platforms" does not list sheets` — the table and the frontmatter
  disagree. Add `sheets` to `platforms` or set the cell to `No default`.
- `"sort ascending" repeats Windows keys already on data` — copy-paste across families. Each row belongs
  to exactly one family, and a chord is listed once.
- `the practice drill "x" is not a page` / `asks for formulas, not keys, so practising this page is a
  different drill` — the `## Practice` link is a typo, or the lesson has no chord screen.
- `copy: not one of the six families` / `copy: a family with no page — the hub would link nowhere` — the
  slug and the `FAMILIES` list disagree.
