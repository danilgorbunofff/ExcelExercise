# Writing a lesson

A lesson ships when it renders, grades, teaches and passes the gate. All four are one command
(`npm run content:check`), and the point of this guide is that you should never have to guess which of
them you broke.

Read it once end to end before your first lesson. After that, use [the definition of
done](#definition-of-done) as the checklist and [the worked example](#worked-example-lesson-11) as the
template.

## The loop

```bash
npm run content:new -- --lesson 14 --group lookup   # scaffold the next free slot
npm run content:preview -- --lesson 14              # the page as a reader gets it
npm run content:fixtures -- --lesson 14             # every fixture against the grader
npm run content:check                               # the gate CI runs
npm test                                            # schema, corpus, build, client
```

`content:new` takes the slot's title, level and group from `legacy/content/track.json` and points the
slot at the file it writes, so a lesson cannot be created somewhere the site does not look. The file it
writes is `schemaVersion: 2` and already passes the gate: the grid, the fixtures and the grading are a
working SUM drill, and the prompt and `docs.explain` say "replace this scaffold" in place. A green gate
on a placeholder is not a done lesson; it is proof that the plumbing is out of your way.

`--lesson 14` is the **file number**. The number a learner sees is the lesson's position among authored
lessons, and the two agree only when the file's slot comes after every other authored slot. They parted
for lesson 13: its slot is 39, but the capstone and the INDEX/MATCH pair sit at slots 46, 52 and 59, so
its scaffold said "takes catalog slot 39, published as lesson 10 of 13" and shipping it pushed those
three one place later in the reading order without touching their URLs. Inserting a slot never
renumbers a page; publishing one does.

## What a lesson is

One JSON file per lesson in `legacy/content/exercises/`, named `<number>-<slug>.json`. The file is a
lesson: identity, catalog docs, and `screens[]` — the drills. This phase ships single-screen lessons,
so `screens` is a one-element list; write it that way anyway rather than reaching for the flat shape.

The loader also reads the old flat shape (`schemaVersion` absent, drill fields at the top level) during
a one-release deprecation window. Do not write it: the migrator is done, and the shape exists only so an
unmerged branch does not break. See [the content README](../packages/content/README.md#two-shapes-one-output)
for what each shape guarantees.

### Identity

| Field | Rule |
|---|---|
| `id` | exactly the file name without `.json`; the URL and the catalog key |
| `slug` | lowercase kebab; the published path, `/learn/excel/<slug>` |
| `level` | `1`, `2` or `3` — Beginner, Intermediate, Advanced |
| `title` | ≤ 60 characters; must be unique across all 88 catalog slots, planned ones included |

The slug is permanent once a lesson is public: it is the URL, the sitemap entry and the structured
data. Rename a title freely; renaming a slug costs a redirect.

### The level ladder

- **1 — Beginner.** One function, one range, a grid a first-week user can read. The learner should be
  able to predict the answer before typing it.
- **2 — Intermediate.** One function whose *arguments* are the lesson: match modes, criteria ranges,
  absolute references, tolerances. The drill usually has a plausible wrong answer that looks right.
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

Say what to produce and where; say which cells the answer has to use when that is part of the drill.
Do not restate the explanation, do not name the technique twice, and do not write "in this exercise".
Name the function when the lesson is teaching that function — it is the subject, not a spoiler.

Two prompts that read alike are an error, not a warning: the index would link to two pages that sound
the same. Two sentences is a warning (`content:check` prints `prompt is 2 sentences — one imperative
sentence is the house style`), and it is usually telling you the drill does two things.

## The grid

`grid.startCell` is the top-left cell; `grid.rows` is a list of equal-length row arrays of raw values
(numbers, strings, `null` for empty). `answerCell` and `requireRef` must both be inside it.

Keep it small — four to six rows, two or three columns. The learner has to do the arithmetic in their
head or on screen, so the data must be small enough that a correct answer is verifiable by reading, and
a wrong one is explainable in one sentence. `expect.value` is the number the answer must equal;
`expect.tolerance` is for money and rates (`0.0001` for a rate of `0.05`), never for counts.

`requireRef` is the cell the answer must depend on. It is what stops a plausible-looking hardcoded
number from passing, so point it at the input, not at a cell the learner could copy.

## Rules and hints

Rules make the drill teach one thing instead of accepting any formula with the right number in it.

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
  "func-vlookup": "Use VLOOKUP itself — this drill is about how its match mode behaves.",
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

Hints are prose the learner reads at the moment they are stuck, so write them in the same voice as the
prompt: what to change, in one sentence, without leaking the answer to the whole drill.

## Fixtures

`fixtures.accept` are formulas that must grade `ok`; `fixtures.reject` are formulas that must fail. The
floor is **six of each** (`MIN_FIXTURES`); the plan asks for twelve, and the two shipped lessons that
need more — a capstone, a rule with several spellings — have them.

Accepted fixtures prove the drill is passable by more than the one formula you had in mind: a lowercase
call, absolute references, a redundant `+0`, a function written with a different but equivalent
argument. Rejected fixtures prove it rejects each way of being wrong. Cover these, in this order:

1. **syntax** — unclosed bracket, stray operator.
2. **wrong function** — the plausible neighbouring function (`AVERAGE` where the drill wants `SUM`).
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
they disagree. That is how a rule name cannot quietly drift. `why` is for the next author.

Rules run before evaluation, so a formula can be rejected for the *shape* even when it would also error:
`=VLOOKUP(A6,A2:B5,2,FALSE)` reports `match-type`, not `#N/A`. Declare what the gate reports; if you
think the grader is wrong, that is a bug in the grader, not a fixture to loosen.

The two lists are proof, not decoration. If an accepted variant fails, the drill is wrong and the
fixture is right.

## The docs block

`docs` is what a learner reads after failing, and what search engines index. Everything here is
single-line prose in the JSON file — no newlines inside a string.

| Field | Limit | What it is |
|---|---|---|
| `syntax` | 120 | the function's signature, brackets and optional arguments included |
| `reference` | 120 | a formula, starting with `=`, that passes this drill — identical to an accepted fixture |
| `explain` | — | three to five sentences on what the formula does *to this data* |
| `errors` | — | one or more `{ code, text }`, the failures this function actually returns |
| `atWork` | — | one sentence on where this shows up in a real workbook |
| `outcome` | 120 | what the learner can now do, phrased as a capability |
| `teaches` | 80 | the function or technique, as a learner would search for it |
| `dataset` | 60 | the data's name, so the page can describe itself |

`explain` carries the arithmetic. "The range stops at B5 because B6 is the answer cell" is worth more
than a description of `SUM`, and a learner who spots a wrong number in the explanation stops trusting
the page. `docs.errors` is the only place error codes are explained; the hints are for the *next
attempt*, these are for the post-mortem.

Links in `docs` and `hints` must point at pages that exist: `/learn/excel/<slug>`, `/excel/<slug>`, or
`/`. Anything else fails the gate, including `/lessons` and `/learn/excel`, which the site never serves.

## The catalog slot

`legacy/content/track.json` is the site map: 16 groups, 88 slots. A planned slot is
`{ title, level, group }`; authoring it replaces that with `{ id, group }`, because the title, slug and
level now live in the lesson file and must not be written twice. `content:new` does this for you.

A group a learner can reach owes an `intro` (150–250 words, authored). If you publish the first lesson
in a group, write its intro in the same change; the gate fails the run otherwise. `freeLessonCount`
decides how many published lessons the trial covers.

## Definition of done

- [ ] `id` matches the file name, `slug` is kebab, `title` is under 60 and not used by another slot.
- [ ] The prompt is one imperative sentence that names the cell, the task and any input the answer must use.
- [ ] The grid is small enough to check by hand, with the answer cell inside it and `expect.value` computed, not guessed.
- [ ] At least one `require` rule, and every rule has a hint keyed by its own id.
- [ ] Six accepted fixtures, six rejected, all seven kinds of rejection covered, every advertised rule reached.
- [ ] `docs` complete: `reference` is an accepted formula, `explain` carries the arithmetic, `errors` are real codes.
- [ ] The catalog slot points at the file, and the group has an intro.
- [ ] `npm run content:check`, `npm test` and `npm run verify` are green.
- [ ] A second person has read the lesson and passed it without asking you anything.

The last one is not ceremony. Every rule above is checkable by a machine; whether the prompt says what
the drill wants is not.

## Worked example: lesson 11

Catalog slot 37, group `lookup`, level 2. Published as lesson 8 of 11 because eight published lessons
come before it. This is the file `content:new --lesson 11 --group lookup` scaffolds the shape of, with
an author's drill in it. It is not copied from the reference site: the bands, the numbers and the
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
        "func-vlookup": "Use VLOOKUP itself — this drill is about how its match mode behaves.",
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
    "explain": "VLOOKUP walks down the first column of the table and stops at the last value that does not overshoot the lookup value, which is why the bands have to be sorted ascending: 4200 belongs to the 1000 band, and an unsorted table would return whatever row happened to sit before it. The fourth argument decides that behaviour. TRUE, or leaving it out, asks for the approximate match a band table needs; FALSE demands an exact match and returns #N/A for 4200 because no band starts there. This is the case VLOOKUP is genuinely better at than an exact lookup, so the drill asks for the match mode rather than a bigger table.",
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
same mistake in two spellings, and both are what the drill exists to catch. `=VLOOKUP(A6,A2:B5,2,1)`
is accepted because Excel's `TRUE` *is* `1` — writing the fixture is what proves that, rather than
assuming it.

And `content:preview --lesson 11`:

```
8. VLOOKUP: approximate match needs a sorted column — /learn/excel/vlookup-approximate-match-needs-a-sorted-column
   Intermediate · Looking values up · trial

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
  the drill is (the requirement is stricter than the lesson meant).
- `rejects "=..." but the grader accepts it` — the technique you thought you forbade, you did not.
- `"..." is filed under "x" but the grader reports "y"` — fix the `rule` on the fixture, then read the
  hint for `y` and check it teaches that failure.
- `never exercises the "x" failure, so that path ships untested` — add a fixture, do not delete the rule.
- `has N accepted fixtures, the floor is 6` — the floor exists because six is roughly the point where a
  drill stops passing for the wrong reasons.
- `prompt is a duplicate of the one in <file>` / `links to "/...", which is not a page that
  exists` — copy-paste, usually.

A schema error is a hard stop with one message, because there is nothing to lint: the loader reports
`content/exercises/<file>.json: <problem>` and the rest of the run is skipped. Fix that first.

If the gate and your lesson disagree and you cannot tell who is wrong, that is the moment to ask,
not to loosen a fixture.
