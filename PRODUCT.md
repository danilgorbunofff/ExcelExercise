# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary: office workers who are shaky on Excel basics. They use a spreadsheet as part of a job they
did not train for, learn in short sittings between tasks, and want one usable formula skill per
session rather than a course to finish. They arrive from search or a recommendation, on a laptop, and
will leave if asked to sign up before they have seen the product work.

Secondary: learners polishing specific functions before a report or a review, and evaluators comparing
paid Excel courses, who need to see scope and price without starting anything.

Success for the landing page: the visitor is typing a formula into a real exercise in under a minute.

## Product Purpose

Excel Supreme teaches Excel formulas and shortcuts through small, real spreadsheet tasks. Each exercise
shows a grid, one answer cell and a prompt; the learner types a formula or a key sequence, and a
deterministic grader in the page explains exactly which rule was missed — wrong value, wrong function,
malformed syntax, with the offending token pointed at.

Exists because Excel teaching is split between video courses that never check your work and quizzes
that grade a letter, not a formula. Success means a learner corrects a real formula on the first or
second try and knows why it was wrong.

## Positioning

The grader is the product: a deterministic spreadsheet engine that runs entirely in the browser, knows
the accepted approaches and the rules behind them, and answers a near miss with the rule it broke. No
account, no backend, no upload, nothing sent anywhere. A competitor could copy the curriculum but not
make grading free, instant, offline-capable and private at the same time.

## Operating Context

A browser tab. One exercise at a time: prompt above a grid, answer cell highlighted, formula bar below.
The learner types a formula as they would in Excel (or presses a shortcut on the keys exercises), presses
check, and reads a verdict. Progress is kept in the browser (local progress; an account is optional and
only adds cross-device sync, certificates and the paid track). Sittings are short and interrupted.

## Capabilities and Constraints

- 86 exercises across beginner, intermediate and advanced levels. Ten of them are free without an account,
  listed by id in `legacy/content/track.json` rather than counted from the front; the rest are the paid
  track. There is no trial: the ten free exercises are the trial and they do not expire.
- Paid track: $9.99 a month, $39.99 every six months or $59.99 a year, 100% refund guarantee inside 30
  days, cancel anytime. Prices, cadence
  and guarantee are single-sourced in `legacy/src/site/offer.mjs`; no page may restate them differently.
- Two deployables from one content corpus: a static build in `legacy/` and a Next.js app in `app/` that
  renders the same templates plus the optional account surfaces.
- No analytics endpoint, no third-party request, no learner data leaves the browser unless they sign in.
- Everything is server-rendered HTML first; enhancement arrives as a client island. The homepage must
  keep its full exercise roster in the document for crawlers and no-JS readers.
- Counts, prices and gating come from the content index and config at build time; never hard-code them.

## Brand Commitments

- Name: Excel Supreme. Plain, concrete, unhyped voice — say what the exercise does and what the grader
  said. No gamification language, no streaks-as-achievement claims, no emoji, no exclamation marks.
- The established visual world is binding and must be preserved: warm sand neutrals (Radix sand),
  deep jade as the only accent, Newsreader for display, IBM Plex Sans for UI, IBM Plex Mono for
  numerals and formulas, hairline rules, 3–5px radii, ink-black primary buttons.
- Accessibility is a commitment: keyboard-first operation, visible focus, 4.5:1 text contrast,
  `prefers-reduced-motion` respected, native disclosure controls where a disclosure is needed.

## Evidence on Hand

- Real lesson content and fixtures in `legacy/content/` — every accepted formula and every grader
  sentence shown on the landing page must come from an exercise, never be written by hand.
- A real rendered sheet component (`legacy/src/site/sheet.mjs`) usable as a non-interactive specimen.
- Published offer terms in `legacy/src/site/offer.mjs`.
- Absent, and must not be fabricated: testimonials, customer logos, user counts, completion rates,
  press mentions, benchmark times, instructor biographies.

## Product Principles

1. Show the grader, do not describe it: any claim about feedback is demonstrated with a real exercise's
   own accepted formula and its own rejection sentence.
2. Zero friction before value: the first action is an exercise, never a form.
3. One idea per viewport; the page is a curriculum, not a brochure.
4. Say the honest version of the offer, including the gate, next to the thing it affects.
5. The browser is the product boundary: nothing leaves it, and the page says so where trust is decided.

## Accessibility & Inclusion

WCAG 2.1 AA minimum. Keyboard-operable throughout, visible focus rings on every interactive element,
contrast 4.5:1 for text and 3:1 for UI boundaries, motion suppressed under `prefers-reduced-motion`, no
information carried by colour alone (the paywall lock, verdicts and states always carry a word or icon).
