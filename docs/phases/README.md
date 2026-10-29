# Excel Supreme — Phase Index

The prototype is split into six build phases, a design-system phase that runs before the UI is
built, and one post-validation phase. Each phase has its own document, a definition of done, and a
gate that must pass before the next phase starts.

Source of truth for the shipped build: this folder, `legacy/src/`, `legacy/content/`, `packages/grader/`, `packages/content/`, and the tests that gate them.
The static site moved into `legacy/` in phase 0 of the parity plan (history below still names the old
paths — read `src/...` as `legacy/src/...`); the Next.js shell that replaces it lives in `app/`.
Source of truth for the reference-parity program: [`docs/plans/parity/00-overview.md`](../plans/parity/00-overview.md).

## Sequence

| Phase | Document | Output | Gate |
|---|---|---|---|
| 1 | [01-grader-core.md](01-grader-core.md) | `src/grader/*` — tokenizer, parser, evaluator, rules | A formula parses and evaluates correctly from a test, with no UI involved |
| 2 | [02-exercise-content.md](02-exercise-content.md) | `content/track.json` + 10 exercise JSON files | Every exercise has a dataset, expected value, rules, hints, and docs |
| 3 | [03-grading-verification.md](03-grading-verification.md) | `tests/fixtures/*.json` + `tests/fixtures.test.js` + `tests/corpus.js` | 100% of fixtures pass; no accepted variant is rejected |
| 4 | [04-static-hybrid-pages.md](04-static-hybrid-pages.md) | `src/build.mjs`, page templates, `dist/*.html` | 11 pages + sitemap build with drill mount and SSR docs |
| 5A | [05a-design-system.md](05a-design-system.md) | `vendor/*`, `src/styles/{tokens,base,components}.css` | Tokens, components and vendored assets fixed; the visual gate in §11 passes |
| 5 | [05-drill-ui-and-funnel.md](05-drill-ui-and-funnel.md) | `src/client/drill.js`, `src/styles/{tokens,base,components}.css` | A learner can solve, get hinted, hit the paywall, and unlock a trial |
| 6 | [06-end-to-end-verification.md](06-end-to-end-verification.md) | passing build + browser walkthrough + `README.md` | All checks green, funnel events visible, documented run path |
| 7 | [07-post-validation-expansion.md](07-post-validation-expansion.md) | roadmap for Next.js, payments, assessment | Only started after the fake-door metrics clear the threshold |

### Reference-parity plans

The expansion roadmap above is specified in detail, phase by phase, in
[`docs/plans/parity/`](../plans/parity/00-overview.md): an overview plus eleven phase plans covering
the shell port, curriculum and content factory, exercise engine, dashboard, accounts and payments,
retention, credentials and projects, SEO, the SQL track, B2B/referrals, and launch. It supersedes the
shortcut-drill and lifetime-pricing non-goals in phase 7.

## Progress

- [x] **1 — grader core.** `src/grader/` (address, errors, tokenize, parse, values, functions,
      evaluate, grade, index) + `tests/grader.test.js`. Audited twice: seven defects found and fixed,
      see [the audit findings](01-grader-core.md#audit-findings).
- [x] **2 — exercise content.** `content/track.json` + 10 lesson JSON files, with every expected
      value hand-computed and the arithmetic recorded in
      [the audit trail](02-exercise-content.md#arithmetic-audit-trail).
- [x] **3 — grading fixtures.** `tests/fixtures/*.json` (154 formulas across the ten lessons; since
      moved inline onto `screens[].fixtures` by [phase 1](../plans/parity/phase-01-curriculum-content-factory.md)),
      `tests/fixtures.test.js`, and the hostile corpus shared through `tests/corpus.js`. The suite
      caught six rule-order misunderstandings in [the phase doc](03-grading-verification.md#where-the-fixtures-corrected-the-plan).
- [x] **4 — static pages.** `src/build.mjs`, `src/serve.mjs`, `src/site/*` templates, 11 SSR pages with
      the drill mount and `<script id="exercise-data">` payload, one concatenated stylesheet, sitemap
      and robots. Assets are vendored and hash-recorded in `vendor/manifest.json` (25 files, all
      verified byte-identical to their pinned CDN URLs).
- [x] **5A — design system.** `src/styles/{tokens,base,components}.css` and the 25 vendored assets
      (fonts, Radix and Open Props layers), with `tests/styles.test.js` enforcing the token rules and
      the visual gate walked through in a browser.
- [x] **5 — drill UI.** `src/client/state.js`, `src/client/drill.js`, `src/vendor-check.mjs`, the
      paywall fake door, and eleven funnel events. Four defects were found and fixed during the first
      real browser run, and five more in a stricter second review — see
      [what was built](05-drill-ui-and-funnel.md#defects-found-by-the-browser-verification-pass).
- [x] **`npm test` → 268 passing** (90 grader + 19 content + 48 fixtures + 42 build/serve + 32 client
      + 16 styles + 13 verify + 8 vendor).
- [x] **6 — end-to-end verification.** `src/verify.mjs` (333 crawl assertions over `dist/`) plus thirteen
      tests that mutate a copy of the build and prove it fails, the four journeys re-walked in a fresh
      browser, `docs/screenshots/`, Lighthouse numbers, and `README.md`. One copy defect was found in
      the walkthrough (a two-function lesson naming only one function) and fixed in the content. The
      mobile Lighthouse preset lands at 94 against the plan's 95; see
      [the verification record](06-end-to-end-verification.md#what-was-built).
- [ ] **7 — post-validation expansion.** Not before the metrics clear.

## Rules that apply to every phase

- **The static site installs nothing; vendored static assets instead.** `legacy/` carries no build
  step and no dependencies: native ES modules, `node --test`, Node's built-in HTTP server.
  Third-party *presentation* assets are allowed only as committed files under `legacy/vendor/`, pinned
  by version, recorded with a `sha256` in `legacy/vendor/manifest.json`, and shipped with their
  licence. No runtime CDN, no bundler, no framework. Anything with runtime JavaScript needs a written
  argument in the phase document — see the rejected list in [05a-design-system.md](05a-design-system.md#3-library-budget).
  The rules were written before the shell existed: in phase 0 of the parity plan the Next.js app and
  its npm workspaces were admitted deliberately, so `app/`, `packages/`, the root `package.json` and
  the Playwright suite are outside this rule. They are held to the same asset discipline — the drill
  still loads `/assets` and `/grader` as static files, never as a React island — and the reasoning is
  recorded in [the shell plan](../plans/parity/phase-00-port-shell.md).
- **Grader messages are plain text.** `grade()` echoes learner input inside its messages, so the drill
  must insert them with `textContent`/`createTextNode`, never `innerHTML`. Same rule for the exercise
  dataset, which comes from a JSON file that may end up in a CMS later.
- **Grader is UI-free.** `packages/grader/` must never import DOM, `window`, `document`, or Node
  built-ins. It is the portability guarantee for the Next.js version.
- **Content is data, not code.** A new exercise is a JSON file. If adding a lesson requires touching
  `packages/grader/`, the schema is wrong.
- **Errors teach.** Every rejection must map to a named rule and a human sentence naming the
  mistake. "Incorrect" is a bug.
- **Accept equivalents.** Case, whitespace, absolute refs, argument order, and equivalent syntax pass.
  Only the lesson's specific point is enforced.
- **Design is specified, not improvised.** Every colour, type size, radius, shadow, and duration comes
  from [05a-design-system.md](05a-design-system.md). A new value means editing that document first.

## Running the project at any point

```
npm test        # grader + fixture + golden + verify + vendor suite (344 tests)
npm run build   # regenerate legacy/dist
npm run verify  # build, then assert legacy/dist is complete (333 checks)
npm run check   # test + next:build + next:check + verify — the green-before-shipping command
npm run dev     # build, then serve http://localhost:4173 from legacy/dist
npm run next:dev  # the ported Next.js shell on http://localhost:3000
npm run e2e     # next:build, then Playwright against next start (13 browser tests)
```
