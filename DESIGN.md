---
name: Excel Supreme
description: Zero-signup, in-browser Excel exercises with deterministic grading
colors:
  bg: "#f9f9f8"
  surface: "#fdfdfc"
  surface-sunk: "#f1f0ee"
  line: "#dad9d6"
  line-strong: "#bcbbb5"
  text: "#21201c"
  text-muted: "#63635e"
  ok: "#20715a"
  warn: "#925805"
  err: "#cd2b31"
  action-ink: "#21201c"
  action-text: "#fdfdfc"
  focus: "#26997b"
typography:
  display:
    fontFamily: "Newsreader, Iowan Old Style, Georgia, serif"
    fontSize: "clamp(2.75rem, 1.1rem + 4.6vw, 4.5rem)"
    fontWeight: 400
    lineHeight: 0.98
    letterSpacing: "-0.032em"
  h1:
    fontFamily: "Newsreader, Iowan Old Style, Georgia, serif"
    fontSize: "clamp(2.125rem, 3vw + 1.35rem, 3.25rem)"
    fontWeight: 400
    lineHeight: 1.1
  h2:
    fontFamily: "Newsreader, Iowan Old Style, Georgia, serif"
    fontSize: "clamp(1.5rem, 1vw + 1.25rem, 1.875rem)"
    fontWeight: 400
    lineHeight: 1.2
  lede:
    fontFamily: "IBM Plex Sans, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "1.1875rem"
    fontWeight: 400
    lineHeight: 1.55
  body:
    fontFamily: "IBM Plex Sans, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: 1.6
  ui:
    fontFamily: "IBM Plex Sans, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
  meta:
    fontFamily: "IBM Plex Sans, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 500
  mono:
    fontFamily: "IBM Plex Mono, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "1.0625rem"
    fontWeight: 400
rounded:
  r1: "4px"
  r2: "8px"
  r3: "12px"
spacing:
  s1: "4px"
  s2: "8px"
  s3: "12px"
  s4: "16px"
  s5: "24px"
  s6: "32px"
  s7: "48px"
  s8: "64px"
  s9: "96px"
components:
  button-primary:
    backgroundColor: "{colors.action-ink}"
    textColor: "{colors.action-text}"
    rounded: "{rounded.r1}"
    padding: "0 20px"
    height: "44px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.text}"
    rounded: "{rounded.r1}"
    padding: "0 20px"
    height: "44px"
  sheet-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.r2}"
    padding: "0"
  spine:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    height: "56px"
  ref-chip:
    backgroundColor: "{colors.surface-sunk}"
    textColor: "{colors.text-muted}"
    typography: "{typography.mono}"
    width: "64px"
---

# Excel Supreme — design system

## Overview

A calm, editorial site for a product that is a spreadsheet. The page is set like a printed page: a serif for the voice, a sans for the interface, a mono for anything the grader or Excel would say. Nothing is decorated to look like software except the actual spreadsheet, whose grammar (column letters, row numbers, `fx`, a formula bar) is drawn literally instead of illustrated.

The subject is Excel, so the risk is costume: green gradients, glassy cards, floating 3D charts, a laptop mockup. None of that is here. The page's only ornament is the product's own geometry — gridlines, a range, an accepted formula.

**The front door's direction (homepage only).** Every other page keeps its ordinary page scale; the landing is the one composition allowed to break it.

- **Thesis.** A stranger gets a real formula bar in the first screenful, not a promise about one. The product is the demonstration.
- **Own-world.** Sand paper, ink text, one jade signal for "accepted". Serif display, sans interface, mono data — the same split the exercises themselves use, so the landing cannot drift from what it sells.
- **Story.** What this is → the grid it really grades → how an exercise works in three steps → the 86 exercises themselves → the drawer, which holds every other way in. Proof before claims, inventory before the ask.
- **First viewport.** One poster line, one sentence, two actions; then the specimen sheet with its formula bar. No eyebrow, no badge row, no stat strip, no logo strip.
- **Form.** One column at every width. On desktop the sheet sits at `--artifact` beside the grader's own sentence; below 1024px the sentence stacks under the bar. Section rhythm is `--s-9` on desktop, `--s-8` below 768px.

## Colors

Radix sand is the whole surface world; jade, amber and red appear only as state. The palette is a light theme with a dark counterpart that swaps four scales and nothing else — no component knows a second theme exists.

- `--bg` sand-2 is the page, `--surface` sand-1 is anything that reads as a page on the page (the sheet, the formula bar), `--surface-sunk` sand-3 is a recess (the answer-cell chip).
- `--line` sand-6 is the hairline; `--line-strong` sand-8 is the same line where it has to hold a section.
- `--text` sand-12 is ink; `--text-muted` sand-11 is everything said quietly.
- `--ok` jade 11 darkened to `#20715a` so it clears 4.5:1 on its own tint; `--warn` and `--err` are tuned the same way. A green that fails contrast on a green tint is not a green.
- Action is ink, not brand colour: the primary button is sand-12 on sand-1. There is exactly one filled button per page.

## Typography

Three faces, three jobs, no exceptions:

- **Newsreader** (display, 400) — the heading voice, including the grader's quoted verdict. Never interface text.
- **IBM Plex Sans** — every control, label, and sentence of interface.
- **IBM Plex Mono** — cells, formulas, counters, any value the grader compares.

Sizes run `--fs-meta` 13px → `--fs-ui` 15px → `--fs-body` 17px → `--fs-lede` 19px → `--fs-h3`/`--fs-h2`/`--fs-h1` clamps → `--fs-display` 44–72px on the front door only. The floor is 13px.

Display type is set tight on purpose: `line-height: 0.98`, `letter-spacing: -0.032em`, measure capped at 20ch so the sentence stays one line on desktop and never becomes a paragraph. Body measure is `--prose` (620px, ~73 characters); subheads stop at 44ch.

Only two rules in the whole system set `text-transform: uppercase`; everything else is sentence case, including buttons and table heads.

## Layout

- `--shell` 1080px with `--s-6` gutters is the page; content never centres itself differently on different pages.
- `--artifact` 480px is any block shown rather than read — the landing's specimen sheet, the progress readouts. `--prose` 620px is anything read. `--rail` 260px is the sticky progress rail.
- Spacing is one 4px-rooted scale (`--s-1`…`--s-9`). Section rhythm is `--s-9` (96px) on desktop and `--s-8` (64px) under 768px; components use `--s-3`…`--s-5`.
- One column everywhere. The landing's proof block is the only two-column moment (sheet | note), and it collapses to one column below 1024px.

## Elevation & Depth

There is one shadow in the system, `--shadow-1`, and it belongs to raised overlays only. Cards are separated by hairlines and background steps, not by drop shadows. Stacking is expressed by tint: page → surface → sunk. Dark mode restates the shadow in black because a shadow drawn on a dark surface has to be blacker than the surface to read as lift at all.

## Shapes

Geometry is quiet, not sharp: three radii and no fourth. `--r-1` 4px is an inline bit — a chip, a keycap, a `pre` block. `--r-2` 8px is anything a hand operates or scrolls — buttons, header links, drawer rows, inputs, scroll wrappers, the focus ring. `--r-3` 12px is a container — a card, a panel, a dialog. 12px is the ceiling and a lint error above it. The sheet itself stays square, down to a single cell: the grid is the subject, and rounding it would round the product. No pills, no floating blobs, no rounded-rectangle soup.

## Components

- **Primary button** — one per page, ink fill, 44px tall, `--r-2`, label plus a 16px arrow glyph.
- **Secondary button** — transparent with a `--line` border; hover changes background and border only.
- **Sheet card** — the product itself: a head strip (exercise name, cell reference in mono) over a real grid with `A/B/C` column heads, row numbers and a highlighted answer cell. On the landing it is a picture, not a control: no tab stop, no target cell.
- **Formula bar ("the spine")** — `ref-chip` + `fx` + the accepted formula in mono + a jade `Accepted` status, hairline top and bottom, full width under the sheet. It is the one piece of chrome that is also the product.
- **Lesson row** — a 40px index column, the title, a mono tail; the whole row is the link, hover is a background step.
- **Header** — the mark and the wordmark at the left, three borderless ways in at the right edge, and nothing between them. The row used to carry a fact — `86 exercises`, or the page's own count — and it was the same sentence the page was already making, counted a second time in the corner of every screen; a count is inventory and the front door keeps its inventory in the body. `Search` and `Account` are links at `--text` on no fill, 44px tall, each with a 16px glyph before the word, with the hover step carrying the affordance a border used to carry; `Menu` is the only control and therefore the row's only border. The `=` is a jade mono glyph, not a filled tile: a white 28px square was the loudest object in a row of six equally loud ones and encoded nothing a reader could use. Hidden navigation roughly halves discoverability and desktop readers often do not notice a bare icon (NN/g), so the toggle is spelled out beside its bars and the drawer is a way in, never the only one. Under 30rem `Account` drops out and the row keeps the mark, `Search` and `Menu` on one 69px line; every header text is at least 8:1 on `--surface`.
- **Drawer** — the site's only navigation, opened by a button in the header on every page. A `<dialog>` sheet `min(22rem, 92vw)` wide, flush left at every width, on the page's own surface with one `--shadow-1` and the browser's scrim behind it; scrolling locks while it is open. Inside: the product name as the sheet's heading, a text `Close` button, then eleven rows. Each row is a 16px glyph then the label, one line, 48px tall: the glyph is a picture of the thing — a play triangle for `Start free`, a calendar for `Daily challenge` — never a tile behind it, so it reads at a glance down the column without becoming eleven boxes. No group captions: five captions over eleven links is a header every 2.2 rows. The list runs in the order a learner meets the site, and the three pages about the reader rather than the work — `Certificate`, `Account`, `Pricing` — sit below a rule at the foot. The current page's row takes `aria-current`, a sunken background, a jade hairline at its edge and one weight up, so the mark survives the hover state that uses the same background. There is one such sheet per document, and it is the only navigation: a `ways` list left inside a page is a rail to three related exercises, never a second menu. Without scripting the button is hidden and the closed sheet sits in the flow, so the rows are never gone.
- **Questions fold** — the last screen of a page that has been explaining something, never an FAQ. Every question is a native `<details>`: the answer is in the HTML while the fold is closed, so find-in-page finds it and a crawler reads it, and `<summary>` already brings the button role, the expanded state and the keyboard behaviour, so nothing writes `role`, `aria-expanded` or a click listener. The question stays an `<h3>` inside the summary, so the outline a screen reader jumps through still contains it. Several folds can be open at once — no `name` — because a reader comparing two answers must not lose the first one they opened. The caret is drawn on `summary::after` and rotated on `[open]`: a typed `+`/`−` changes width with the font and reads as an action rather than a state, and a drawn one stays out of the accessible name. The row is 44px at its smallest, the whole band is the target, and `site/questions.mjs` is the only renderer.
- **Price page** — one product, one card. The head is the h1 and one sentence that teaches the switch rather than re-reading the prices. The card is a `<fieldset>` whose legend asks the only question the page asks, `How long to pay for`; three clipped radios and three labels are a segment control, and the checked input reveals its own panel through a general-sibling combinator, so the switch is CSS and needs no script in either deployable. No `:has()`: it is shorter and it drops the oldest browser the site still answers. The panel leads with the amount the card is charged (`$59.99` a year) because there is nothing left to compare once the terms are a control, prints the monthly equivalent and the derived saving under it, and ends in one button that posts to that term's own checkout address. Three inclusions live once on the card, beside the price, because what the money buys does not change with the term; the guarantee sits on the card floor. Below the card, two links — `Free lessons`, `All exercises` — and then the questions in folds. No catalogue anywhere: a page that prints the track is a catalogue, not an offer, and this one has now grown that roster twice.
- **A term is not a product.** The track sells at three commitments, and an earlier version printed them as three cards side by side, which asks a reader to compare before they can decide and then needs a how-note, a fact grid, a second copy of the free list and an eighty-six-row fold to hold the comparison up. One product that varies by commitment gets one card and a switch. Two products get two cards.
- **Focus** — every interactive element takes `2px solid var(--focus)` with an offset; nothing relies on colour alone.
- **Motion** — 120ms / 180ms / 1.4s tokens with `cubic-bezier(0.2, 0.7, 0.3, 1)`, only inside `prefers-reduced-motion: no-preference`. Dialogs, folds, the pricing switch, exercise screens and page changes move for 180ms or less (see the design system, section 8). Hover changes background or border, never scale. No parallax, no typing loops, no long fades.

## Do's and Don'ts

**Do**

- Show the product instead of describing it. Any claim on the page must be something the grader actually does, with the lesson's own strings.
- Use the mono for anything a user would retype.
- Let hairlines and tint steps do the separating.
- Keep the display scale for the front door and the section voice; leave interface text at interface sizes.
- Keep counted numbers (`86 exercises`, `ten free`) derived from the content index, never typed by hand.
- Fold a question rather than printing it: an answer a reader did not ask for is read once and remembered never, and the fold costs no script and no state.
- Name a page the same way everywhere — `Free lessons`, `All exercises`, `Pricing` — a destination noun in sentence case. The menu row, the footer link and the body link that point at one page say one thing.
- Give the header no fact. It used to take a count from the page writer, and a page with none shipped the word `undefined` in its header, then a badge, then the same sentence twice; the row is the way in now, and the count belongs to the page that is counting.

**Don't**

- No gradients, no glass, no coloured side-tab borders, no icon circles, no emoji.
- No eyebrow/kicker above a heading, no badge rows, no fake logo strips, no invented testimonials or metrics.
- No claim about the audience the page cannot show (`the one most readers end up on`), and no sentence that explains the copy instead of the product (`The number beside each one is where it sits in the whole track, so the list jumps...`).
- No border on every item in a row: six equally weighted rectangles read as six controls of equal importance, which is no hierarchy at all.
- No count typed by hand and no count that counts the wrong thing: the line under the level list used to tell a reader who had just been offered ten free exercises that "the other 86" were paid.
- No second accent colour: jade means "accepted", amber means "attention", red means "wrong", nothing else.
- No radii above 12px, no shadow beyond `--shadow-1`, no more than one filled button per page. The sheet keeps its square grid.
- `Start free` is the one label in the drawer that is not a place. Every other row is a noun a reader can find in the site's own furniture; the first row is an invitation to act, and it stays an imperative because the destination — the list of free lessons — is already the reader's answer, not a name they need.
- An icon is a picture of its label, 16px, no tile, no border. A glyph that needs a filled square behind it to survive is decoration.
- No `<h3>` over a paragraph where five questions stack: a block of questions is a fold, and the answer lives in the markup whether the fold is open or not.
- No typed fold glyph and no fold that closes its siblings. The caret is drawn, and opening the refund answer must not close the delivery one.
- No uppercase for emphasis outside the two permitted rules.
