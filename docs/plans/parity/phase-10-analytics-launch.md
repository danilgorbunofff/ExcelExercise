# Phase 10 — Analytics, performance, launch


> Part of the [reference-parity plan](00-overview.md). This file is self-contained:
> scope, work breakdown, acceptance criteria, tests and risks for this phase only.

**Duration:** 1–1.5 weeks · **Depends on:** phases 0–8 and 9A · **Final launch phase**

---

## Objective

Make the product measurable, fast, and safe to operate, then switch traffic from the legacy build to
the new one without losing search rankings or a single learner's progress.

## Scope

- Typed event schema + first-party collector (no GTM container, no Facebook pixel).
- Funnel dashboard: visit → drill start → screen → lesson complete → paywall → checkout → paid.
- Performance budgets enforced in CI.
- Error monitoring, uptime checks, backup/restore drill.
- URL migration: 301s from every legacy route, canonical flip, sitemap swap, Search Console
  submission.
- Launch checklist and rollback plan.

## Out of scope

- A/B testing framework (post-launch; events are in place to support it).
- Paid acquisition, email lifecycle campaigns (hooks only).
- Data warehouse / BI tooling.

## Work breakdown

1. **Event schema.** `packages/analytics/events.js` — a single source of truth with a discriminated
   union and runtime validation:
   `page_view, drill_start, screen_view, check_correct, check_wrong, hint_open, solution_reveal,
   screen_complete, lesson_complete, lesson_abandon, paywall_view, checkout_start, checkout_complete,
   signup, login, challenge_start, challenge_finish, certificate_issue, article_view,
   article_drill_start, search, filter_use, error_boundary`.
   Every event carries `session_id`, `user_id?`, `anon_id`, `route`, `track`, `lesson_id?`,
   `screen_id?`, `ts`.
   **What exists today:** `packages/session/events.js` implements this list minus the events that need
   accounts, checkout, articles, search or challenges — 14 names covering the drill funnel, with a
   runtime allowlist, a flat-primitive prop filter, `type`/`ts` written last and a 500-event buffer cap.
   The envelope it produces is `{ ...context, ...props, type, ts }`, and its context carries only `route`
   so far. Four of those fourteen names are not in the list above — `lesson_exhausted`, `paywall_email`,
   `trial_start`, `track_view` — because they describe the fake-door paywall and the catalog page this
   site has; the rest of the list (`checkout_*`, `signup`, `login`, `challenge_*`, `certificate_issue`,
   `article_*`, `search`, `filter_use`, `error_boundary`, `page_view`) has no emitter yet. Reconcile the
   vocabulary, `session_id`/`anon_id` and `screen_id` with this list in this phase, not at the collector.
2. **Collector.** `POST /api/events` batches (≤20 per request, `sendBeacon` on unload), validates
   against the schema, writes to Postgres (`events` table, partitioned by month) with a 90-day
   retention job. No third-party JS. Consent: anonymous mode sends no `user_id` and truncates IP.
3. **Funnel dashboard.** `/admin/metrics` (internal): daily unique visitors, drill starts, completion
   rate per lesson, paywall→checkout→paid conversion, article→drill conversion, drop-off screen.
4. **Performance budgets.** LCP < 2.0 s on a simulated 4G mid-tier device, INP < 200 ms, CLS < 0.1,
   JS < 150 KB gzip on the player route (excluding the SQL engine, budgeted separately), first-party
   only. Enforced with Lighthouse CI on 5 routes; failing budget blocks merge.
5. **Monitoring.** Sentry (or equivalent) for errors with source maps, `/api/health` uptime check,
   alerting to email on >1% error rate or a failed cron.
6. **Backups.** Nightly Postgres dump + Storage sync; **restore drill performed and documented** —
   a backup that has never been restored is not a backup.
7. **Route migration.** Build the legacy→new map from the 201 HTML routes in `links.txt` (the
   sitemap cannot be the source: it lists only 180 URLs and omits 21 real routes, so it would leave
   gaps); implement 301s in `next.config.js`; the 163 asset paths are copied or 404'd, never
   redirected; keep the legacy build deployable for 30 days behind a flag.
8. **Sitemap + robots.** New sitemap from the route list; `robots.txt` allows articles and category
   pages, disallows `/admin`, `/verify`, `/api`; submit to Search Console; watch coverage for 2 weeks.
9. **Launch checklist.** Legal pages live, Stripe live keys with `PAYMENTS_LIVE` flag, tax configured,
   emails authenticated (SPF/DKIM/DMARC), CORS locked, rate limits on auth/verify, seed content
   reviewed, support inbox monitored.
10. **Rollback plan.** Feature flags per surface; DNS/alias switch back to `legacy/` documented with a
    tested command; database rollback is forward-only (migrations are additive).

## As built — §8, indexability (2026-12-02)

The sitemap and the 301 map are older than the site's current shape, so §8 is split: the parts that
depend on the route list are in place, the parts that depend on a live origin are not.

**Landed.** Both hosts publish a sitemap and a robots file from one source. `app/sitemap.js` and
`legacy/src/site/assets.mjs` list home, `/privacy`, `/terms` and one entry per lesson — 91 URLs — and
`legacy/src/verify.mjs`, `scripts/check-next-pages.mjs`, `tests/build.test.js` and `e2e/routes.spec.js`
all assert that count and that each URL is a served page rather than a redirect. The 16 group pages are
deliberately **out**: both hosts render them `noindex` (shown in the head and asserted by the crawl), so
listing them would be the same lie as listing `/pricing`.

`robots.txt` gained rules this session, so a search result cannot land on a surface that is nobody's
business: `Disallow: /api/` (route handlers, JSON, no page) and `Disallow: /certificate` (a personal URL
that embeds a credential id). Both hosts emit them — `app/robots.js` for Next and `renderRobots()` for
the static build — and `e2e/routes.spec.js` additionally proves the two files cannot contradict each
other: no URL in the sitemap may start with a disallowed prefix.

The dashboard is deliberately **not** in that list, and it took a wrong turn to get here. The first cut
of this change disallowed `/dashboard`, which is not a route in either host — the dashboard is served at
`/learn` — so the rule named a 404 while the real dashboard stayed crawlable under its actual address.
`/learn` is `noindex, follow`, and the two directives must not both be set for one URL: a `Disallow`
stops the crawler before it can read the `noindex`, which is how a deleted page stays in the index.
Fetchable plus `noindex` is the correct pairing. `tests/metadata-routes.test.js` now checks the rule
against the app itself — every disallowed path must resolve to a `page.js` or a route handler — so a
`Disallow` can no longer name a URL that does not exist.

The same failure mode sits one level down, in the links themselves. `legacy/src/verify.mjs` asserts
that the hrefs it cares about are *present*; nothing asserted that a present href *resolves*, so a
footer or body link could point at a page the build never emitted and every gate would stay green.
`tests/build.test.js` now walks all 109 emitted HTML files, resolves each internal `href` to a file
(`target`, `target.html`, or `target/index.html`), and fails on any target that is not there. Two
targets legitimately leave the static build for the app — `/account` and `/signup` — so they are
listed, and the list is itself checked against `app/`: a route named there that the app does not
serve fails the test. On the app side, `e2e/routes.spec.js` walks twelve surfaces (the index, the
dashboard, a lesson, pricing, projects, flashcards, the daily challenge, the board, both auth screens
and the legal pages), collects every internal href they render and requests each one. Both were proved
red before they were trusted: a `/privacy-nope` footer href fails the build test, and a `/proof-nope`
anchor in the auth shell fails the browser test with `"/proof-nope → 404"`. That is the `/dashboard`
lesson applied where it does the most work, since a linked-but-missing page is the thing a crawler
actually reports.

One deviation from the list above, on purpose: `/verify` is **allowed**. The list was written before the
certificate verifier existed as a public page; it is now the page an employer lands on to check a
credential, so it is a page we want found. It is not personal — it takes an ID and returns a result.

| Gate | Output |
|---|---|
| `npm run check` | `tests 1616`, `suites 211`, `fail 0`; `88 of 88 catalogued lessons, 16 groups, 152 screens, 1946 fixtures replayed`; `903 accepted and 1043 rejected`; `built 109 pages (11254.5 kB)`; `next routes: 109 prerendered pages match the shared templates`; `4378 checks passed` |
| `npx playwright test` | `135 passed` |
| `npm run vendor:check` | `25 files match manifest.json` |

**Not landed, and why.** The 301 map from the 201 legacy HTML routes cannot be built here: `links.txt`
does not exist in this checkout, and the redirect layer only means anything against a live origin with
two deployments behind it. The launch checklist, Search Console submission, monitoring, backups and the
restore drill are all operator tasks against infrastructure this checkout does not have.

## Acceptance criteria — evidence table (2026-10-31)

Rewritten as an evidence table on **2026-10-31** from the checklist it replaces. Verdicts, witnesses and the build items (B1–B14) are defined in [`reviews/completeness-2026-10-31.md`](reviews/completeness-2026-10-31.md). A row marked **Proven** names a witness this review re-ran: a `path:line` inside a test that executed (the strongest), a `gate:<script>` the review ran green, or an `artifact:<path>` whose existence is the whole claim (a document, a config file). No row is left grey.

| ID | Criterion | Verdict | Witness | State exercised | Decision |
| --- | --- | --- | --- | --- | --- |
| p10-134 | Every event fires once; duplicates dropped by `(session_id, event, ts)` | Absent | event vocabulary exists (`tests/session.test.js:402`) but no sink, no dedupe key, no vendor | n/a | Defer: no analytics vendor at launch (§5.1); trigger vendor choice |
| p10-135 | Funnel reconciles with Stripe within 2% | Absent | no funnel, no reconciliation | n/a | Defer: no funnel to reconcile; trigger vendor choice |
| p10-136 | Lighthouse CI green on five budgeted routes | Absent | no Lighthouse | n/a | Build B2 |
| p10-137 | Every legacy URL resolves to exactly one live page (served or 301), no 404, no duplicate | Proven | `e2e/routes.spec.js:26,31`; static crawl | n/a | — |
| p10-139 | Sitemap count === route count; Search Console accepts it | Built, unproven | `tests/metadata-routes.test.js:31` proves the equality; Search Console submission is unrecorded | n/a | Defer: needs the live domain; trigger first production deploy |
| p10-140 | Restore drill: backup restored into staging, row counts verified | Built, unproven | `artifact:docs/ops/backup.md` — the dump/reload rehearsal with per-table counts | rehearse | B12: procedure and numbers are recorded and were run locally (schema dump, `--no-seed` reset, data restore, counts identical, 50 ms); restoring into a *staging project* needs the owner's project |
| p10-142 | Error monitoring receives a synthetic error | Absent | no monitoring client in any dependency, and no vendor is added at launch (§5.1) | n/a | Defer: no vendor by ruling; stderr plus `app/error.js` is the sink until one is chosen. Trigger: a vendor decision |
| p10-143 | Rollback to legacy executed in staging and timed | Built, unproven | `tests/smoke.test.js:388` serves a real `legacy/dist` and the smoke passes; `artifact:docs/ops/rollback.md` | deploy | B12: executed and timed locally (serve the previous snapshot, smoke 12 passed in 0.3 s); staging is the same bytes on another host, which is the owner's move |
| p10-144 | Launch checklist signed line by line | Built, unproven | `artifact:docs/ops/launch-checklist.md` | n/a | B12: the checklist exists with the human cells named rather than ticked; signing it is the owner's act before the first deploy |

## Test plan

| Area | Tests |
|---|---|
| Event schema | unit: every event validates; unknown event rejected |
| Collector | integration: batching, dedupe, retention job, consent mode |
| Funnel | reconciliation test against seeded Stripe webhook fixtures |
| Redirects | crawl every legacy address, assert exactly one live destination (served or 301) and no 404; assets assert 200/404, never 301 |
| Performance | Lighthouse CI budgets |
| Backup | restore drill, recorded in `docs/runbooks/restore.md` |

## Risks

| Risk | Mitigation |
|---|---|
| Ranking loss from migration | 301 map from the real sitemap, not guesses; keep legacy 30 days; monitor coverage |
| Analytics gaps discovered post-launch | schema is versioned and additive; backfill from Postgres attempts where possible |
| Performance regression from third-party additions | budgets in CI; no third-party JS allowed |
| Live payments misconfiguration | `PAYMENTS_LIVE` flag, test transaction on launch day, refund path rehearsed |

## Definition of launch

**Amended 2026-10-31 by the owner.** This section is the launch rule; the phase list above, the
overview's "Launch vs parity" line and its §10 defer to it.

Launch is met when every criterion in phases **0–7, 9A and 10** is Proven or Deferred with a recorded
reason in [`reviews/completeness-2026-10-31.md`](reviews/completeness-2026-10-31.md), and the launch
checklist below is signed. Concretely:

- **Phase 8, the SQL track, is out of this launch.** Not deferred with a date — removed from the
  launch set. Its doc stays as the post-launch plan; nothing in 0–7, 9A or 10 depends on it.
- **9B is deleted from the product.** Referrals and the organizational portal — groups, invitations,
  seats, `/admin`, institutional domains and university access — are not wanted in this release or as
  the next one. The `group_invites` schema and its RLS that landed in phase 4 are dead weight to
  remove, not a launch row.
- **Accounts and payments are live and configured at launch:** `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `STRIPE_SECRET_KEY`,
  `STRIPE_WEBHOOK_SECRET`, `PAYWALL=on`. A launch with the paywall off is not this launch.
- **Both builds ship.** The Next app and the static build are both the product; a capability that
  exists on only one of them is a defect.
- **Analytics: none at launch.** No vendor was chosen, so no third-party script ships and the two
  analytics rows are deferred with that reason.
- **Anything else missing that launch needs is built**, not deferred. Deferral is reserved for work
  blocked outside the repo, and each deferral carries its four fields.

At review time the ledger stands at **78 Proven, 32 Build, 6 Deferred, 9 claims removed, 8 out of
launch**. Launch is not signed: the 32 Build rows are open work, and the checklist below is not yet
signed line by line.
