# Phase 5 — Markup and measurement

**Status:** shipped (2026-11-01).
**Depends on:** phase 3 (the silo `ItemList` lists) and phase 4 (the pages that carry new markup).
**Unblocks:** phase 7 entry — its five thresholds cannot be judged without this phase's numbers.
**Size:** one JSON-LD builder, one endpoint, one report script, one new event vocabulary. No new dependency.

---

## Purpose

Two things, in this order, because the second cannot be done honestly without the first:

1. **Markup.** The blueprint gets structured data mostly right. `BreadcrumbList`, `Course`, `Article`,
   `Organization` and `WebSite` already ship; `ItemList` of courses, `Quiz`/`Question` flashcards and
   `SoftwareApplication` do not. All three are additive, and all three must describe content that is
   visibly on the page.
2. **Measurement.** [`docs/phases/07-post-validation-expansion.md`](../../phases/07-post-validation-expansion.md)
   gates the product on five numbers and explicitly says that below them "the fix is content or
   lesson design — not more software". Nothing currently produces those numbers, so the gate cannot
   be judged. This phase instruments them from data we already have, with no analytics provider,
   because `/privacy` states we do not use one.

## Deliverables

| # | Change | File |
|---|---|---|
| 1 | `ItemList` of courses on index surfaces | `legacy/src/site/seo.mjs` |
| 2 | `Quiz` + `Question` (`eduQuestionType: "Flashcard"`) on `/flashcards` | `legacy/src/site/seo.mjs`, `app/flashcards/page.js` |
| 3 | `SoftwareApplication` on the sandbox/practice surface | `legacy/src/site/seo.mjs` |
| 4 | Assertions that deprecated or unsupported types never appear | `tests/fragments.test.js` |
| 5 | Drill funnel events in the existing logger | `lib/log-event.js` |
| 6 | `scripts/content-report.mjs` printing the five phase-7 numbers | new |
| 7 | A note in phase 7 pointing at the report command | `docs/phases/07-post-validation-expansion.md` |

Rows 1 and 2 were settled against rather than built: there is one real course and `/flashcards` serves no
card text. The reasoning is in the deviations log, and both are held off by an assertion rather than by
memory.

## Part A — Markup

1. **`ItemList` of ≥ 3 `Course` nodes.** One `Course` exists (the track). Search's carousel needs a
   list of at least three. Either the three graded tracks (`excel-core`, plus whatever the index's
   groups resolve to as courses) each become a `Course` with its own `@id`, and the home page emits
   an `ItemList` naming them, or the carousel is not eligible and should not be attempted. Decide
   from content, not from the schema: if there are not three genuine courses, ship no `ItemList` and
   say so in the deviations log. Do not split one track into three to satisfy a markup type.

2. **`Quiz` on `/flashcards`.** The deck is real and rendered, so the node is honest:

   ```json
   { "@type": "Question", "eduQuestionType": "Flashcard", "name": "<prompt>", "acceptedAnswer": { "@type": "Answer", "text": "<answer>" } }
   ```

   Two non-negotiables: the answer text is visible in the HTML (the deck already reveals it, so this
   is a link, not a leak), and the `Quiz` node is emitted only for cards actually present in the
   document. Markup for a card the page does not show is the failure mode that gets a site
   penalised, and it is easy to introduce by mapping over the whole deck.

3. **`SoftwareApplication`** on the practice surface, with `applicationCategory: "EducationalApplication"`,
   `operatingSystem: "Web"` and `offers` matching the real price — read from `lib/pricing`-adjacent
   config, not typed into the file, so a price change cannot leave a `$0` in the markup.

4. **Guards.** `tests/fragments.test.js` already asserts JSON-LD presence; add negative assertions:
   no `HowTo` (Google removed it), no `FAQPage` for content that is not a real FAQ, no `Course` with
   `aggregateRating` synthesized from our own progress data, no `hasPart` re-listing 88 lessons (the
   existing comment in `courseJsonLd` explains why). Each assertion names the type and the reason, so
   the next person does not re-add it.

5. **Validate, do not assume.** Add a test that parses every emitted `ld+json` on every built page,
   checks it is valid JSON, has `@context` and `@type`, and that every `@id` it references exists
   somewhere in the graph on that page. Schema.org validity by hand-inspection is how broken graphs
   ship for a year.

## Part B — Measurement

1. **Events, not analytics.** Extend `EVENTS` in `lib/log-event.js`:

   | Event | Fires when | Fields (all non-identifying) |
   |---|---|---|
   | `drill_started` | first keystroke in a drill answer field on a page | `surface` (`lesson`/`article`/`formula`), `lesson`, `screen` |
   | `drill_completed` | the grader returns `ok` | `surface`, `lesson`, `screen`, `attempts` |
   | `paywall_shown` | the locked-lesson or offer surface renders | `surface`, `lesson` |
   | `email_submitted` | the offer form is accepted **by the server** | `surface`, `lesson` |
   | `content_rendered` | a lesson or problem page renders, once per request | `surface`, `slug` |

   `IDENTITY` already drops `email`, `user`, `id`, `ip` and address-shaped values, so the privacy
   page's claim survives by construction — that is the property to preserve, and a test asserting
   `logEvent("x", { email: "a@b.c" })` emits no address is the guard.

   Page renders are counted on the server (`content_rendered`), not in the browser, because the
   denominator must not depend on client JavaScript running.

2. **`scripts/content-report.mjs`.** Prints the five numbers and, beside each, the sample it was
   computed from:

   ```
   drills started / lesson-page renders          27.4%   412 / 1503   (≥25% required)
   completions / starters                        51.2%   211 /  412   (≥50%)
   emails / paywall views                         2.1%    18 /  846   (≥3%  MISS)
   indexable pages with a graded exercise       100.0%   131 /  131   (≥50)
   organic clicks into a drill                       7    (≥1)
   ```

   Sources: the logger's sink for the first four, `indexablePaths` + the content corpus for the
   fourth, and the search-console export for the last (a file the operator drops in, not an
   integration) — flagged clearly as manual, because inventing an integration to avoid a manual step
   is how a project grows a dependency it did not need.

   The script takes `--since`, defaults to 7 days, and refuses to print percentages over fewer than
   100 events per denominator, printing `insufficient data` instead. A dashboard that shows `50%`
   over 2 attempts is worse than one that shows nothing.

3. **Reproducibility.** `scripts/content-report.mjs --fixture` runs against a seeded local event log
   (`supabase db reset` + seed) so the report can be tested in CI without a live deployment, and the
   expected output is committed. Without this the script is untested code that only runs on a
   machine that has production logs.

4. **Tell phase 7.** Add one line to phase 7: "Run `node scripts/content-report.mjs` before judging
   these thresholds." A gate whose command nobody knows is a gate nobody passes.

## Acceptance gate

```sh
npm test
npm run build && node legacy/src/verify.mjs
npm run next:build
node scripts/content-report.mjs --fixture          # matches the committed expected output
node scripts/check-next-pages.mjs
```

Done when:

- Every built page's JSON-LD parses, and every `@id` reference resolves within its own page's graph.
- `/flashcards` emits `Quiz` only for cards in the document (asserted by counting questions against
  rendered cards).
- `ItemList` is emitted only if three real courses exist; the decision is recorded either way.
- Each of the five phase-7 metrics is printed with its denominator, and the script refuses small
  samples.
- The fixture run is byte-stable across two invocations.
- No analytics script, cookie, or third-party origin was added — `npm run origin:check` passes.

## Risks

| Risk | Mitigation |
|---|---|
| Markup describing content the page does not show | Every builder takes its data from what the renderer already emitted; the count-matching test is the guard |
| Chasing rich results by inflating `Course` nodes | Only real courses; a deviation entry explains a missing `ItemList` |
| Instrumentation becomes a tracking system | Server-side only, identity-dropping, no third party; the privacy page stays true |
| Report numbers become the target instead of the signal | Sample-size refusal and denominators printed next to every rate; phase 7 already says the fix is content, not software |
| Search-console data stays manual and therefore stale | Flagged as manual in the output with the file's age, so an old export cannot be mistaken for current |

## Non-goals

- An analytics provider, pixels, cookies, or consent banners.
- Dashboards in the product UI; this is an operator script.
- Rich-result markup for pages without content to describe.
- `HowTo` and `FAQPage` (deprecated or tightly constrained, and easy to abuse).
- A/B testing infrastructure. The blueprint's conversion advice is about copy, not test harnesses;
  once the five numbers exist, copy changes can be compared before-and-after.

## Gate evidence

Every number below is from a run on the day this phase was closed, on `phase-0-port-shell`.

| Command | Result |
|---|---|
| `npm test` | 2,015 pass, 0 fail (298 suites), including `tests/markup.test.js` (7), `tests/content-report.test.js` (6) and the four new event names in `tests/log-event.test.js` |
| `npm run build` + `node legacy/src/verify.mjs` | `built 143 pages` with 9 client modules (`funnel.js` is the ninth) and 148 workbooks; `verified 89 lesson pages … 6305 checks passed` |
| `npm run next:build` / `npm run next:check` | `next routes: 142 prerendered pages match the shared templates`; the `/api/events` route is listed alongside them |
| `npm run budget` | B 69,522 B ≤ 70,000 B (478 B headroom), D 138,714 B ≤ 150,000 B: `funnel.js` and its seven call sites cost 1.3 kB gzip |
| `node scripts/content-report.mjs --fixture` | byte-identical across two runs and equal to `scripts/fixtures/content-report/expected.txt`: `339 lines, 339 in window, 2 skipped`, rates 65.0% (104/160) and 55.8% (58/104), `1/12  insufficient data`, `115 (89+8+12+6)`, `10 over 4 pages` |
| `npx playwright test --project=chromium` | green, including the new `e2e/funnel.spec.js`: a keystroke posts `drill_started`, a correct answer posts `drill_completed` with `attempts: 1`, both answer `204`, no `cookie` header, and the typed formula appears in neither line |
| `npx playwright test --project=static` | 17 pass: the static edition still loads its module graph with no console error, because `funnel.js` does not call the endpoint it has no route for |
| `npm run origin:check` | 1,206 absolute URLs in 580 files; no third-party origin was added |
| `npm run secret:check` | no service-role key, Stripe secret or webhook signing secret in 1,916 build-output files |

## Deviations log

1. **No `ItemList` of `Course`.** There is exactly one course (`formula-drills`), and an `ItemList`
   needs three real ones. Splitting the track into three to qualify for a carousel would have meant
   inventing courses that do not exist, which is the failure mode the plan names. `/learn` already
   lists its tracks as an `ItemList` of `LearningResource`, so the shape is covered by honest content
   and the home page stays without a course list.
2. **No `Quiz` on `/flashcards`.** The page is `robots: { index: false }` and its deck is rendered by
   the client, so no card text is in the served HTML. Markup for a card the document does not show is
   exactly what part A.2 forbids, and rendering the deck into the shell to satisfy the markup would
   turn a noindex utility page into a duplicate of the deck. The node is not attempted; the negative
   assertion in `tests/markup.test.js` keeps it from coming back by accident.
3. **`email_submitted` is computed as `checkout_started / paywall_shown`.** The only email form on the
   site is Stripe's checkout, and `checkout_started` already fires server-side with no address in the
   line. A separate client event for "email typed" would have been a second number measuring the same
   funnel step, with a worse sample.
4. **The event fields are `surface`/`slug`/`attempts`/`seconds`, not the plan's `lesson`/`screen`.**
   `IDENTITY` in `lib/log-event.js` drops `id`, `email` and address-shaped values, so `lesson` and
   `screen` travelling as an identifier shape is the one thing that would make a funnel line fail its
   own redaction test. The render side only knows a path, so the slug is the one key both halves can
   produce, and it is the key the report groups on.
5. **`content_rendered` is counted inside `proxy.js`, not in a new file.** Next 16 replaced
   `middleware.js` with the proxy convention, and the proxy is already the only place a request for a
   content page is knowable. The call sits after the 404 check and after the paywall redirect, so a
   paid drill served as a redirect to the offer never joins a denominator; bots, prefetches and
   `next-router-prefetch` requests are filtered so a crawler cannot inflate it.
6. **The funnel does not fire on the static edition.** The endpoint is a Next route, and the static
   build is served from a host with no server: the first `fetch` there answered 404 and drew a console
   error, which the static e2e specs read as a broken page. `funnel.js` now returns early unless the
   document was served by the app (`script[src^="/_next/"]`), so the static edition stays silent
   instead of wasting a request per visit.
7. **Site-wide validation lives in `tests/markup.test.js`, not `tests/fragments.test.js`.** The plan
   put the guards there because that is where JSON-LD presence is asserted, but `page.jsonLd` on a
   lesson references `#organization` and `#formula-drills` that only `/` defines: a fragment cannot
   see the graph its own page borrows. The new file builds a temporary `dist` and checks every
   `ld+json` on every page, including the negative guards for `HowTo`, `FAQPage`, `Quiz`,
   `aggregateRating` and `hasPart`.
8. **`--fixture` reads a committed event log, not a seeded database.** The plan assumed the events
   live in a table. They are stdout lines by design (`/privacy` promises no analytics, so there is no
   store and no retention row), so the fixture is a 341-line JSONL file plus a search-console CSV, and
   the expected stdout is committed beside them. Two runs print the same bytes.
9. **`SoftwareApplication` is emitted on `/`, the app's front door.** The plan's "sandbox/practice
   surface" would have meant a second surface emitting the same `@id`; the home page is where the
   app itself is described, and its `offers` node reads the same `PRICE_AMOUNT`/`PRICE_CURRENCY`
   constants the pricing page prints, so the markup cannot promise a price the store does not charge.
10. **`PRICE` is now derived.** `offer.mjs` splits the price into `PRICE_AMOUNT` and `PRICE_CURRENCY`
    and keeps `PRICE` as the printed string, so the four existing call sites are unchanged and the
    markup has a number to emit rather than a string to parse.
