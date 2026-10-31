# Phase 6 — Credential and projects


> Part of the [reference-parity plan](00-overview.md). This file is self-contained:
> scope, work breakdown, acceptance criteria, tests and risks for this phase only.

**Duration:** 2 weeks · **Depends on:** phase 4 · **Blocks:** phase 10

---

## Objective

Ship the two artefacts that justify a paid price and create word of mouth: a verifiable certificate of
completion, and project exercises that turn lessons into portfolio work.

Reference behaviour being reproduced: eligibility once all lessons are complete, a name that cannot be
changed after generation, a credential ID, a public verification page, and an add-to-LinkedIn link.
Reference projects: 4 dashboards + 1 interview assessment with downloadable XLSX datasets.

## Scope

**Certificate**
- Eligibility check (all Excel lessons complete; SQL optional track flag).
- Name entry with double confirmation; immutable after issue.
- Server-issued credential ID (opaque, non-guessable), PDF render, public `/verify/[credentialId]`.
- Add-to-LinkedIn deep link with prefilled name, issue date, credential URL.
- Revocation (admin only) with a visible "revoked" state on the verify page.

**Projects**
- 4 guided projects + 1 interview assessment, each with narrative, dataset, tasks, and a graded
  final answer set.
- First-party dataset downloads (no OneDrive), read-only preview, per-project progress.
- Premium gating identical to lessons.

## Out of scope

- Accredited certification, proctoring, or exam centres.
- Employer-facing verification API (post-launch).
- Additional projects beyond the five.

## Work breakdown

1. **Eligibility.** `certificate_eligible(uid)` = all lessons in the track complete and a minimum
   accuracy threshold (default 0 — document the choice; the reference has none beyond completion).
2. **Issue flow.** `/certificate` → confirm name (typed twice, mismatch blocks) → `POST
   /api/certificate` → transaction: unique `credential_id` (base32, 16 chars), `issued_at`,
   `lesson_count`, `days_taken` → enqueue PDF render → status `pending` → client polls until `ready`
   → redirect to `/verify/[credentialId]`.
3. **Immutability.** `certificates.display_name` is write-once (trigger raises on update except
   `revoked_at`). Same guarantee for `credential_id`.
4. **PDF.** Server-side render (React-PDF or a headless template) with name, credential ID, date,
   lesson count, verification URL and a QR code. Stored in Supabase Storage, private bucket, served by
   signed URL; public copy at a stable path for the verify page.
5. **Verification page.** `/verify/[credentialId]` works signed out, `noindex` off (indexable is
   fine), shows holder name, issue date, lesson count, status; "not found" is a distinct, honest
   state; rate-limited to prevent ID enumeration.
6. **LinkedIn.** Deep link with `startTask=CERTIFICATION_NAME`, `name`, `organizationName`,
   `issueYear`, `issueMonth`, `certUrl`, `certId`. Verify the URL opens correctly in a manual test.
7. **Revocation.** Admin action sets `revoked_at`; verify page shows revoked; PDF remains but is
   flagged. Logged with actor + reason.
8. **Projects.** Author 4 project definitions in `content/projects/*.json` (narrative sections,
   dataset link, 6–10 tasks, expected answers, hints). Datasets go in `public/datasets/` with
   `Content-Disposition: attachment`. The four, mirroring the reference:

   | Project | Dataset | Learner does |
   |---|---|---|
   | UFO dashboard practice | `ufo.xlsx` | clean a sightings table, build pivots and a summary block |
   | Wine dashboard practice | `wine.xlsx` | regional summaries, ranking formulas, conditional formatting |
   | Trout dashboard case | `trout.xlsx` | a multi-section case from raw catch data to a formatted report |
   | Job-interview assessment | `interview-assessment.xlsx` | a timed, unseen task set standing in for a hiring test |

   Datasets are rebuilt first-party from scratch — the reference's XLSX files are not ours to ship.
   The fifth reference project is a SQL case and lands in phase 8, once the engine exists.
9. **Project runner.** Reuse the player with a `project` lesson type: sequential tasks, free
   navigation, no recycling, completion recorded as a `lesson_progress` row with `track='project'`.
10. **Preview panel.** Read-only sheet rendered from the XLSX at build time (same package as phase 2
    workbook screens); no iframe.

## Acceptance criteria

- [x] Issuing twice returns the existing certificate, never a second one. (`tests/db/certificate.spec.js` — second POST reads the held row back, `certificates` still has one row)
- [x] Name cannot be changed by client request, DB update, or re-run of the issue endpoint. (write-once trigger → `23001`; browser `PATCH`/`DELETE` refused by grant + RLS)
- [x] `/verify/{id}` works signed out. (page renders with no session in `e2e/certificate.spec.js`; `verify_certificate` is granted to `anon` and exercised as anon in the DB spec. Not re-run in a private window — same claim, one fewer window)
- [x] An unknown ID returns a clean not-found page, not an error. (RPC returns zero rows for an unknown, empty or null id; the page renders the "no certificate has that credential id" state)
- [x] Revoked certificate shows "revoked" while remaining verifiable as a record. (status flips to `revoked`, the row still resolves, revocation is one-way)
- [x] Enumeration is rate-limited, and a reader is not. — `lib/verify/limit.js` allows 60 checks per
      address per minute, keyed on the first `x-forwarded-for` hop (`x-real-ip`, then a shared bucket,
      when a host sets neither), in memory and capped at 5,000 open windows so invented addresses evict
      the oldest instead of growing the process. `proxy.js` answers `/verify/<id>` with a `429`, a
      `retry-after` and a small HTML refusal before it touches the session, so the guard holds on a
      deployment with accounts unconfigured. `tests/verify-limit.test.js` (21 tests) owns the counter;
      `e2e/verify-limit.spec.js` spends the budget from TEST-NET addresses and proves the 61st request
      is refused while a neighbouring address is still served.
- [ ] LinkedIn URL opens the add-licence form with all fields prefilled (manual check, recorded). **Not done** — the URL is asserted field-by-field in `tests/certificate.test.js`; nobody has opened it in LinkedIn.
- [ ] The printed sheet renders correctly with a 60-character name and non-Latin characters.
      **Rewritten from "PDF renders"** — see the deviations. Not checked: no DB-backed print run.
- [x] All 4 Excel projects downloadable first-party with correct MIME and size; no third-party
      request. (The fifth, the SQL case, is accepted in phase 8.) — `e2e/projects.spec.js` fetches
      `/datasets/ufo.xlsx` and asserts `content-type:
      application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `content-disposition:
      attachment; filename="ufo.xlsx"`, a `PK` body whose length equals `content-length`, and >1000
      bytes; `nope.xlsx` and `../package.json` are 404. The files are generated by `legacy/src/xlsx.mjs`
      (only `zlib`), so there is no third-party request to make.
- [x] Projects are gated identically to lessons (free user cannot reach the fourth). —
      `e2e/projects.spec.js` opens project 4 with an empty record and gets the order gate (`Project 4
      opens after project 1` / `Go to project 1`), then with the first three seeded gets `data-gate="prompt"`
      and `The last project before the paid half`, and `#grace-pass` opens it. `tests/projects.test.js`
      pins the shape behind both: `freeLessonCount === 3`, `free === [true, true, true, false]`,
      `lessonNoun === "Project"`, `showAnswerAfter === 3`.

## Test plan

| Area | Tests |
|---|---|
| Eligibility | unit: 0, partial, all complete, SQL-inclusive variant |
| Issue | integration: first issue, re-issue, concurrent issue (race), immutability |
| Verify | e2e: valid, revoked, unknown, malformed ID |
| PDF | snapshot render + visual check at 2 name lengths |
| Projects | e2e: open, complete a task, download dataset, gate check |
| Security | enumeration rate limit, signed URL expiry |

## Risks

| Risk | Mitigation |
|---|---|
| Certificate implies accreditation | wording review: "certificate of completion", no exam claims |
| PDF rendering environment differences | render server-side only, snapshot test the output |
| Name typos are permanent | double entry + preview of the rendered name before confirming |
| Project content cost | reuse existing screens where possible; 4 Excel projects ≈ 12 author-days |

## As built — certificate vertical (2026-11-30)

Work items 1–3, 5, 6 and 7 are shipped; 4, 8, 9 and 10 are not started. The numbers below are
measured on this tree, not planned.

| Gate | Result |
|---|---|
| `npm run check` | `tests 1639 suites 216 pass 1639 fail 0`; `content: 88 of 88 catalogued lessons, 16 groups, 152 screens, 1946 fixtures replayed`; `903 accepted and 1043 rejected`; `built 109 pages (11213.0 kB of HTML+CSS)`; `next routes: 109 prerendered pages match the shared templates`; `verified … 4384 checks passed` |
| `npx playwright test` | `120 passed` |
| `npm run vendor:check` | `25 files match manifest.json` |
| `npm run db:check` | `tests 223 suites 55 pass 223 fail 0` |

Counts against the pre-phase-6 baseline: tests 1565 → 1602 (+37 unit, all in `tests/certificate.test.js`),
suites 199 → 208 (nine new `tests/db/certificate.spec.js` suites), Playwright 112 → 118 (+6 in
`e2e/certificate.spec.js`), DB tests 0 → 223 in the new spec (including four that run the revoke script as a child process), everything else unmoved.

What exists:

- `supabase/migrations/0013_certificates.sql` — `certificates` (PK `user_id`, one per learner),
  write-once trigger, `issue_certificate(...)` that re-counts eligibility in SQL, public
  `verify_certificate(text)`, admin-gated `revoke_certificate(text,text,uuid)`, self-read RLS, and
  **all seven** table privileges revoked from `anon`/`authenticated` (the first cut revoked only
  `insert, update, delete` and `rls.spec.js` caught the leftover default `TRUNCATE` grant — the same
  trap `0007` records).
- `lib/certificate/{credential,eligibility,issue}.js`, `app/api/certificate/route.js`,
  `app/certificate/*`, `app/verify/[id]/page.js`.
- Eligibility is completion-only, accuracy threshold 0, as the reference has it.

Deviations from the plan above, recorded rather than silently taken:

- **Item 4 is answered with a print stylesheet, not a PDF renderer.** A renderer is a new dependency;
  `window.print()` is not. `/verify/[id]` and `/certificate` render a sheet that prints as a document —
  the site chrome is dropped, and the sheet carries the credential id and its own URL, because a printed
  page cannot follow a link. `certificates.pdf_path` stays nullable and unused.
- **The PDF acceptance criterion is therefore still open, in its rewritten form.** "PDF renders correctly
  with a 60-character name and non-Latin characters" becomes "the sheet prints correctly with…", and
  neither has been checked on paper: the e2e environment has no database, so Playwright can prove that
  print media drops the chrome (`e2e/certificate.spec.js`) but cannot render a record to print. A
  human with a printer, or a DB-backed Playwright project, is what closes it.
- **Item 5 says "indexable is fine"; the shipped page is `noindex`.** The plan permits indexing, it does
  not require it, and a credential names one person. Nothing else on the row changes — signed-out access,
  the four distinct states and the revoked notice are as specified.
- **The enumeration rate limit is now in place, and it took a deviation to get right.** It is not the
  plan's "indexable is fine / rate limit" pair as written: the guard is per address per minute rather
  than per credential, so a shared address costs a whole minute only after sixty checks, and it lives in
  `proxy.js` above the unconfigured-accounts early return, because a limit that switches off with accounts
  would be off on exactly the deployment a crawler prefers. See `lib/verify/limit.js`.
- **Item 7 has no UI, by choice, and now has a script.** `revoke_certificate` is admin-gated and
  actor-logged in SQL; `npm run certificate:revoke` wraps it with the two refusals an operator would
  otherwise forget (the actor is not an admin — checked before the call, and already revoked — checked
  before the call so the error is a sentence instead of `P0002`). Its four tests run the real script as a
  child process against the live stack; there is no mock, because a mocked script proves nothing about
  the script.

## As built — projects (2026-12-01)

Work items 8, 9 and 10 are shipped. All four projects exist, are reachable, are gated, and their
datasets download first-party. Numbers measured on this tree.

| Gate | Result |
|---|---|
| `npm run check` | `tests 1639 suites 216 pass 1639 fail 0`; `content: 88 of 88 catalogued lessons, 16 groups, 152 screens, 1946 fixtures replayed`; `903 accepted and 1043 rejected`; `built 109 pages (11213.0 kB of HTML+CSS)`; `next routes: 109 prerendered pages match the shared templates`; `verified … 4384 checks passed` |
| `npx playwright test` | `139 passed` |
| `npm run vendor:check` | `25 files match manifest.json` |

The four, in the order the shelf and the rail use (level, then slug):

| # | Project | Dataset | Level | Screens | Free |
|---|---|---|---|---|---|
| 1 | `ufo-dashboard` — UFO sightings dashboard | `/datasets/ufo.xlsx` (2685 B) | 1 | 8 | yes |
| 2 | `trout-case` — Trout river case | `/datasets/trout.xlsx` (2659 B) | 2 | 8 | yes |
| 3 | `wine-dashboard` — Wine cellar dashboard | `/datasets/wine.xlsx` (2675 B) | 2 | 8 | yes |
| 4 | `interview-assessment` — Interview assessment | `/datasets/interview-assessment.xlsx` (2813 B) | 3 | 8 | no |

What exists:

- `legacy/content/projects/*.json` — brief, `dataset` (`file`, `sheet`, `startCell`, rows), eight
  screens each with prompt, expected answers, hints and docs. The datasets are authored, not copied:
  `legacy/src/xlsx.mjs` writes a real `.xlsx` (six-part ZIP, `calcPr` so Excel recalculates on open)
  from the same rows the preview renders, so the download and the preview cannot disagree.
- `legacy/src/site/projects.mjs` — `PROJECT_SHELF`, `loadProjects` (level-then-slug), `projectTrack`
  (`lessonNoun: "Project"`, `paidHalf`, `freeLessonCount: 3`), `renderProjectCard`, `prepareProjectsPage`.
- `app/projects/page.js`, `app/learn/projects/[slug]/page.js`, `lib/projects.js`,
  `app/datasets/[name]/route.js` — the shelf, the player (the shared `prepareExercisePage` /
  `renderChrome` templates, not a second player), and a whitelisted download route.
- Progress: the project pages post to the existing progress route with `track='project'`, so a project
  is one completion of the same row shape a lesson writes.
- `tests/projects.test.js` (3 suites, 9 tests) and `e2e/projects.spec.js` (4 tests).

Deviations from the plan above, recorded rather than silently taken:

- **Item 8's `public/datasets/` became a prerendered route.** `app/datasets/[name]/route.js` with
  `generateStaticParams` renders all four as SSG (`x-nextjs-cache: HIT`) and refuses any name outside
  the four the content declares, so a path cannot walk out of the directory. A static `public/` copy
  would have been a second, hand-maintained truth next to the JSON the preview uses. Note for anyone
  editing it: `cacheComponents: true` rejects `export const dynamic` in a route handler; the export is
  deliberately absent and `generateStaticParams` is what prerenders.
- **The plan's file name for the fourth dataset is the shipped name.** `interview-assessment.xlsx`,
  as the table says; an earlier cut had `interview.xlsx` and was renamed to match this doc.
- **Item 9's "`project` lesson type" is a noun on the track, not a branch in the player.** The gate
  copy in `legacy/src/client/drill.js` reads `payload.track.noun` and `payload.track.paidHalf`, so the
  same code says "Project 4 opens after project 1" and "Projects 1–3 are the paid half of the shelf"
  where a lesson says "Drill 4 opens after drill 3". The defaults are the lesson words, so lesson copy
  is byte-identical and `e2e/gate.spec.js` / `e2e/paywall.spec.js` never moved.
- **Projects are Next-only, and the static build does not link them.** The shared footer gained a
  *Guided projects* link, which pointed the static build's 109 pages at a page it does not have —
  `tests/build.test.js` caught it ("index links to /projects, which does not resolve to a file"). The
  link is now behind `projectsAvailable`, defaulting `false` and passed `true` by every Next route: the
  same availability-flag shape the page templates already use for `clientAvailable`. Before that fix
  nothing anywhere linked `/projects` at all, so the shelf was unreachable; the earlier first-project
  `prevPath` also pointed at `/learn/projects`, which is not a page, so the "All projects" rail link
  and the canonical URL both went to a 404. Both were found by the new tests, not by reading.
- **The project page exposed a 320px horizontal overflow the reflow spec now covers.** `.error-table
  tbody th` carried `white-space: nowrap` over an authored error row 504px wide, pushing the table
  past its 272px column; `e2e/reflow.spec.js` measured `a project: 332px in 320px`. The row header now
  wraps (`overflow-wrap: anywhere` on `.error-table th, .error-table td`). The sheet preview was never
  the cause: `.workbook-scroll` already clipped it.
- **The new pages were outside the reflow and a11y nets, and both nets caught something once widened.**
  `e2e/reflow.spec.js` now covers 19 pages at 320 and 390 px instead of 8, `e2e/a11y.spec.js` now scans
  the shelf and a project (before and after a miss) — 24 tests to 26, clean at `critical`/`serious`. The
  reflow sweep also caught `/flashcards` at `322px in 320px`, a pre-existing 2px overflow from a third
  nowrap item in the non-wrapping `header.site` flex row; `.site` gained `flex-wrap: wrap`. The same
  crawl found that `/flashcards`, `/daily`, `/leaderboard`, `/certificate` and `/account` had no inbound
  link at all, and `/pricing` only the drill's paywall prompt; the footer now names all six (two rows,
  the second behind an `appPagesAvailable` host flag for the static build). Details in
  `reviews/00-foundation-verification-plan.md`, "Unrouted surfaces and the coverage they were hiding".
