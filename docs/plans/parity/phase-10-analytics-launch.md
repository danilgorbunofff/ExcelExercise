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

## Acceptance criteria

- [ ] Every event fires exactly once per action; duplicates dropped by `(session_id, event, ts)` key.
- [ ] Funnel numbers reconcile with Stripe payment counts within 2%.
- [ ] Lighthouse CI green on all 5 budgeted routes.
- [ ] All 201 legacy HTML routes return a single 301 to the correct new path; assets return 200 or
      404, never 301.
- [ ] Sitemap count === route count; Search Console accepts it.
- [ ] Restore drill: production-like backup restored into staging and verified (row counts + one
      login + one drill).
- [ ] Error monitoring receives a synthetic error with a readable stack.
- [ ] Rollback to legacy executed once in staging and timed (< 15 min).
- [ ] Launch checklist signed off line by line.

## Test plan

| Area | Tests |
|---|---|
| Event schema | unit: every event validates; unknown event rejected |
| Collector | integration: batching, dedupe, retention job, consent mode |
| Funnel | reconciliation test against seeded Stripe webhook fixtures |
| Redirects | crawl all 201 legacy HTML routes, assert 301 + destination; 163 asset paths assert 200/404, never 301 |
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

All ten phases' acceptance criteria met except 9B, plus the overview's §10 definition of done (item 7
belongs to 9B and is confirmed when it ships), and the launch checklist signed. In practice: phases
0–8, 9A and 10.
