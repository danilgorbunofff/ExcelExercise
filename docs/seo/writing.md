# Writing for Excel exercises

How the copy on this site is written, and why. The rules here are enforced by
`npm run content:copy` and by `node packages/content-lint/cli.js check --strict`, so this document and
`packages/content-lint/data/copy-rules.json` have to agree. If a rule is wrong, change both.

## Who is reading

Someone with a spreadsheet open in the next tab and a task due. They are not reading for pleasure and
they did not search for a story. They typed a question like "sum only some cells in excel" and want to
know whether this page answers it, in the first two lines.

That reader skips:

- anything that describes the page instead of answering the question ("In this lesson, we will explore…")
- anything that praises the topic ("Excel is an incredibly powerful tool")
- anything that promises a transformation ("take your skills to the next level")

## The shape of a lesson page

Each lesson has five short blocks. Keep them in this order and do not let one absorb another.

| Field | What it holds | Guide |
|---|---|---|
| `seo.title` | what a search result shows | 18–60 characters, names the function and the job |
| `seo.description` | what a search result shows under the title | 70–155 characters, answers "is this the page I want" |
| `docs.explain` | the mechanism, with the numbers from the drill | 80–130 words, no more |
| `docs.errors` | the errors this drill actually produces | one sentence each, naming the cause |
| `docs.atWork` | where this shows up in a real file | one or two sentences, concrete job |
| `docs.outcome` | what the reader can do afterwards | one sentence, starts with a verb |

`docs.explain` earns its length by using the drill's own numbers. "SUM(B2:B4) returns 3580 because
1200 + 1450 + 930 = 3580" is teaching. "SUM is a versatile function that lets you add numbers" is not.

## Sentences

- One idea per sentence. If a sentence has two commas and a dash in it, it is two sentences.
- 30 words maximum, average under 22. The gate counts words, not clauses.
- Start with the thing, not with a frame. "SUM skips text" beats "When it comes to SUM, one thing to
  note is that it will skip text."
- Prefer the concrete number over the adjective. "It cuts four steps to one" beats "it is much faster".
- Write in the second person only when instructing. Explaining does not need "you".

## Words to avoid

The full list lives in `data/copy-rules.json` — 150 phrases, each with the reason it is there. The
short version:

- **Marketing verbs**: unlock, unleash, supercharge, empower, elevate, transform, boost, streamline,
  revolutionize, level up.
- **Unfalsifiable praise**: seamless, robust, powerful, intuitive, effortless, cutting edge,
  world-class, best-in-class, unparalleled, revolutionary.
- **Filler frames**: it is important to note, when it comes to, in order to, at the end of the day,
  in today's fast-paced world, let's dive in, in this lesson we will.
- **Hedges that add no information**: basically, actually, truly, simply put, quite simply.

If a sentence only works with one of those words in it, the sentence is doing no work.

## Punctuation

- No em dashes, en dashes, curly quotes or ellipsis characters. They are a reliable tell that text came
  out of a generator, and a comma or a colon does the job better.
- Use `to` for a range: "rows 2 to 40", not "rows 2–40".
- Apostrophes are straight: `'`.
- No emoji anywhere in lesson copy. The pages have no decorative graphics and do not need any.

## What a good description looks like

Bad, because it describes the site:

> Master the SUM function and unlock powerful Excel skills with our comprehensive guide.

Good, because it answers the search:

> SUM adds a column in one cell. Here it totals 3580 from three rows, and the page shows why a number
> stored as text goes missing from the total.

Both are the same length. Only the second one tells the reader whether to click.

## Duplicate pages

Two lessons that share a third of their five-word runs read as one page duplicated, and Google picks
one and drops the other. The gate compares every pair of lessons and reports overlap above 30%. When a
new lesson genuinely repeats an older one, link to it and say what is different here, rather than
re-explaining the same mechanism in the same words.

## The static checklist

Before a batch of lessons is called finished:

1. `npm run content:copy` reports zero blocking findings.
2. Every lesson has `seo.title`, `seo.description` and `updated`.
3. No two lessons share a `seo.title` or a `seo.description`.
4. Read the `explain` block out loud. If a sentence needs a second run, cut it.

## Function notes

A note (`legacy/content/articles/<function>.md`) is the page that answers "what does VLOOKUP do". It
is not a lesson: a lesson asks you to write a formula for a task, and a note explains a function you
may already suspect is the one you need. The two link in one direction — the note borrows one screen
from the lesson as its drill, and the drill links back to the whole exercise.

Five sections, in this order, because the gate counts them:

| Section | What it holds |
|---|---|
| `## What it does` | the mechanism in two or three sentences, using the drill's own numbers |
| `## Syntax` | the argument order, and which argument people get wrong |
| `## Example N` (2 to 4) | a small pipe table and one line saying what the result is |
| `## What goes wrong` | the errors this function actually produces, one row each with a cause and a fix |
| `## Where it shows up` | the job in a real file, and what to use instead when this is the wrong tool |

- 700 to 1400 words. Under 700 the note duplicates the lesson; over 1400 it stops being a reference.
- `title` names the function, `description` is 70 to 155 characters, `updated` is `YYYY-MM-DD`.
- `function:` is the Excel name and has to be unique across notes. `exercise:` is the **slug** of the
  lesson the drill comes from, not the file name — `83-clean-up-an-imported-list.json` publishes at
  `clean-up-an-imported-list`, and the numbered form silently loses the drill.
- One example table per note at minimum. A table is the cheapest way to show a range and its answer
  without a screenshot nobody can read on a phone.

Run `npm run content:articles` after writing. It checks the sections, the lengths, the drill link and
every site path the note points at, then runs the same sentence and wording rules as the lessons. A
note whose prose reads like a landing page fails here before it fails in review.

## Human-only checks

Nothing in this document can be automated past the gate. Before a batch ships, read one page with a
real question in mind and one with a phone in hand, and open the page with JavaScript disabled: the
drill is the only part that needs it, and the prose has to stand without it.
