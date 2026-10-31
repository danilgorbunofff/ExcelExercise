# Program completeness — evidence report

**Review date:** 2026-10-31
**Branch:** `phase-0-port-shell` (in-place checkout)
**Plan of record:** `program-completeness-verification-plan.md`
**Status:** Steps 1–7 complete. Gates green on this checkout: `npm run check` exit 0, `npx playwright test` 158 passed (both builds), `npm run db:check` 223 assertions (green here, unguarded in CI — D6). Launch scope is **not** complete: 32 rows are Build (B1–B14), 6 are Deferred with reasons, 9 claims were removed, and the 8 phase-8 rows are out of launch by the owner's ruling. See Step 5.

**The rule applied:** a feature is complete only when (a) a route renders it, (b) a test fails if
the capability is removed, and (c) the state users reach it in is exercised. Evidence order:
**runtime > tests > code > docs.**

**Method note:** every checkbox in `phase-*.md` is a claim, not a fact. Docs are reconciled last.

---

## Step 1 — Inventory

### 1.1 Route census

**Next app — `find app -name "page.js" | sort`** (26 page routes):

```
app/about/page.js
app/account/deleted/page.js
app/account/page.js
app/account/profile/page.js
app/certificate/page.js
app/daily/page.js
app/daily/run/page.js
app/excel-exercises/page.js
app/excel-functions/[slug]/page.js
app/excel-functions/page.js
app/flashcards/page.js
app/leaderboard/page.js
app/learn/excel/[lesson]/page.js
app/learn/groups/[group]/page.js
app/learn/page.js
app/learn/projects/[slug]/page.js
app/login/page.js
app/page.js
app/pricing/page.js
app/privacy/page.js
app/projects/page.js
app/reset/page.js
app/reset/password/page.js
app/signup/page.js
app/terms/page.js
app/verify/[id]/page.js
```

Route handlers (`route.js`) and middleware add: `app/api/account/delete`, `app/api/account/export`,
`app/api/certificate`, `app/api/daily`, `app/api/flashcards`, `app/api/health`, `app/api/progress`,
`app/api/stripe/checkout`, `app/api/stripe/portal`, `app/api/stripe/webhook`, `app/auth/callback`,
`app/datasets/[name]`, `middleware.js`.

Next build output (from `npm run check`): **161 static pages generated**, **144 prerendered HTML**
under `.next/server/app`, and `next routes: 120 prerendered pages match the shared templates`.
Per-route rendering from the build:

```
○ /, /_not-found, /about, /account, /account/deleted, /api/health, /certificate, /daily,
  /daily/run, /excel-exercises, /excel-functions, /flashcards, /leaderboard, /learn, /pricing,
  /privacy, /projects, /reset, /reset/password, /robots.txt, /sitemap.xml, /terms
◐ /account/profile, /excel-functions/[slug], /learn/excel/[lesson], /learn/groups/[group],
  /learn/projects/[slug], /login, /signup, /verify/[id]
● /datasets/{ufo,trout,wine,interview-assessment}.xlsx
ƒ /api/* (except health), /auth/callback, Proxy (Middleware)
```

**Static build — `find legacy/dist -name "*.html" | sort`** — **120 pages**, exactly:

```
legacy/dist/about/index.html
legacy/dist/excel-exercises/index.html
legacy/dist/excel-functions/{countif,if,index-match,sum,sumif,trim,vlookup,xlookup}/index.html
legacy/dist/excel-functions/index.html
legacy/dist/excel/<88 lesson slugs>.html
legacy/dist/index.html
legacy/dist/learn/groups/<16 groups: aggregate, arrays, capstone, count, date, errors,
  index-match, intro, logical, lookup, modeling, rounding, statistical, sum, text-change,
  text-search>.html
legacy/dist/learn/index.html
legacy/dist/pricing/index.html
legacy/dist/privacy/index.html
legacy/dist/terms/index.html
```

88 + 16 + 9 function pages + 1 function hub + index + about + excel-exercises + learn + pricing +
privacy + terms = **120**. Matches the plan's §1.3 count.

### 1.2 Content census

`node -e '…loadContent("legacy/content")…'` →

```
lessons 88 screens 152
```

### 1.3 Test census

`ls tests e2e e2e-static`:

- `tests/` — 53 files: 50 `*.test.js`, `audit.js`, `corpus.js`, `lessons.js`, `golden/`, `db/`.
- `e2e/` — 22 Playwright specs (Next app).
- `e2e-static/` — 1 Playwright spec (static build).
- `tests/db/` — 12 specs + `harness.mjs`, 3,617 lines.

`grep -c "^test\|^describe" tests/*.test.js` (top-level declarations per file):

```
articles 3, auth 5, build 4, certificate 10, client 10, content-lint 15, content 4,
copy-rules 9, dashboard-page 2, feedback 3, five-types 1, fixtures 6, flags 4, fragments 1,
golden 1, grader 24, keys-page 1, keys 8, legal 9, messages 2, metadata-routes 9, paywall 5,
profile-rules 6, progress-migrate 2, progress-sender 1, progress-sync 2, progress 5,
projects 3, retention-challenge 11, retention-flashcards 8, retention-leaderboard 2,
retention-trend 7, retention-write 6, retention 6, schema-v2 1, screen-docs 1, seo 3,
session 3, sheet 5, site-paths 1, stripe 8, styles 3, track-schema 1, vendor 1,
verify-limit 5, verify 1, workbook-build 1, workbook-page 1, xlsx 2
```

### 1.4 Schema census

`ls supabase/migrations | sort` — 13 migrations:

```
0001_accounts_schema.sql        0008_stripe_webhook.sql
0002_accounts_rls.sql           0009_retention_write.sql
0003_profile_provisioning.sql   0010_leaderboards.sql
0004_progress_write.sql         0011_daily_challenge.sql
0005_anonymous_progress.sql     0012_retention_week.sql
0006_account_deletion.sql       0013_certificates.sql
0007_institution_domains.sql
```

`grep -ho "create table…"` — 18 tables:

```
attempts, certificates, challenge_answers, challenge_attempts, daily_challenges, daily_points,
entitlements, feedback, group_invites, groups, institution_domains, lesson_progress, payments,
profiles, progress_batches, screen_awards, streaks, stripe_events
```

### 1.5 Capability census

```
sql        route=no  lib=0
datasets   route=yes lib=0
referrals  route=no  lib=0
cohorts    route=no  lib=0
admin      route=no  lib=0
export     route=no  lib=0
```

**Trap:** `datasets route=yes` is `app/datasets/[name]/route.js`, which serves **phase-6 project
workbooks** (`lib/projects.js` → `datasetFor`/`loadProjectTrack`). It is not a SQL-track dataset
surface. Structural confirmation of no SQL track: `find -iname "*sql*"` returns only migrations,
`supabase/seed.sql`, the phase-08 doc, and the read-only `reference/excelexercises-mirror/` mirror.
No SQL route, no SQL lib module, no SQL content, no SQL test.

### 1.6 Claim census

```
phase-00-port-shell.md                         open=1   done=19
phase-01-curriculum-content-factory.md         open=1   done=15
phase-02-exercise-engine.md                    open=1   done=19
phase-03-dashboard-progression.md              open=0   done=16
phase-04-accounts-entitlements.md              open=10  done=0
phase-05-retention.md                          open=8   done=0
phase-06-credential-projects.md                open=2   done=8
phase-07-seo-content-engine.md                 open=2   done=5
phase-08-sql-track.md                          open=8   done=0
phase-09-b2b-referrals-polish.md                open=7   done=2
phase-10-analytics-launch.md                   open=9   done=0
```

**133 acceptance checkboxes total** (84 ticked, 49 open) across phases 0–10. Each is re-adjudicated
in Step 2.

### 1.7 Gate baseline

| Gate | Command | Result |
|---|---|---|
| Unit + content + build + crawl | `npm run check` | **exit 0 — 1696 tests, 1696 pass, 0 fail; 4869 template checks passed** |
| Browser | `npx playwright test` | **exit 0 — 153 passed (33.8s)** |
| Database (outside every gate) | `npm run db:check` | **exit 0 — 223 tests, 223 pass, 0 fail** |

`npm run check` and `.github/workflows/ci.yml` (jobs `check`, `e2e`, `static`) do **not** run
`db:check`. Confirmed by reading the full workflow: no `supabase` invocation exists in it.
`db:check` needs the Supabase CLI (`v2.84.2` present) and a local stack (`supabase status` was up).

### 1.8 Step 1 output — surface → routes → tests → states

| Surface | Next routes | Static routes | Tests | States proven | States unproven |
|---|---|---|---|---|---|
| Front door / catalog | `/`, `/about`, `/excel-exercises`, `/excel-functions`, `/excel-functions/[slug]` | `index`, `about`, `excel-exercises`, `excel-functions/*` (10) | `e2e/index`, `e2e/article`, `e2e/routes`, `e2e/reflow`, `e2e/targets`, `e2e/rail`, `e2e-static`, `tests/build`, `tests/fragments`, `tests/keys-page`, `tests/articles` | cold first visit, full catalog, disclosures, rail, no third-party origin, article drill | 1280×720 at 150 % zoom; print |
| Drill player (5 screen types) | `/learn/excel/[lesson]` | `/excel/*.html` (88) | `e2e/drill`, `e2e/keyboard`, `e2e/a11y`, `e2e/wcag22`, `tests/five-types`, `tests/grader`, `tests/golden`, `tests/fixtures`, `tests/client` | correct/wrong/unreadable answer, revisit, award, multi-screen, timer-hidden, same-device reload, storage-refused, arrows, shortcuts, workbook, keyboard-only | mid-drill abandon at screen 3 then resume; configured paywall boundary |
| Dashboard / progression | `/learn`, `/learn/groups/[group]` | `learn/index`, `learn/groups/*` (16) | `e2e/dashboard`, `e2e/gate`, `tests/dashboard-page`, `packages/progress` tests | first open, finished, stale, coldest, reset-with-confirmation, storage-refused, noindex, unknown group 404 | account-backed progress (configured) |
| Accounts | `/login`, `/signup`, `/reset`, `/reset/password`, `/account`, `/account/profile`, `/account/deleted`, `/auth/callback` | — | `e2e/auth`, `e2e/legal`, `tests/auth`, `tests/profile-rules` | **unconfigured only**: disabled forms, no-session renders, open-redirect refusal | every configured state: sign-in, device switch, cache clear, deletion cascade |
| Entitlements / paywall | `/pricing`, lesson gate | `pricing` | `e2e/paywall`, `e2e/gate`, `tests/paywall`, `tests/stripe` | unconfigured soft prompt, hard gate, free-lesson list, one-click unlock | configured Stripe checkout, webhook tick, refund, replay idempotency |
| Progress write | `/api/progress` | — | `e2e/progress`, `tests/progress*` | 503 unconfigured, malformed body, event post at lesson end, roll-up fallback, corrupt roll-up | configured write and cross-device sync |
| Certificate / verify | `/certificate`, `/verify/[id]` | — | `e2e/certificate`, `e2e/verify-limit`, `tests/certificate`, `tests/verify*` | signed-out, unknown id, case-insensitive, bad shape, noindex, print-without-record, rate limit | held credential; A4 vs Letter print |
| Projects | `/projects`, `/learn/projects/[slug]`, `/datasets/[name]` | — | `e2e/projects`, `tests/projects` | shelf, 4th project gated, first-task grading, dataset MIME/name | — |
| Retention | `/daily`, `/daily/run`, `/flashcards`, `/leaderboard` | — | `e2e/retention`, `e2e/flashcards`, `tests/retention*` | **unconfigured only**: explanation state, empty cards, finish→card→grade, API refusal | configured points/midnight, leaderboard ordering, second submission, cheater flag, trend |
| SEO / metadata | `sitemap.xml`, `robots.txt`, metadata | `sitemap.xml`, `robots.txt` | `e2e/routes`, `tests/metadata-routes`, `tests/seo`, `tests/articles` | sitemap ⇔ routes, noindex, legacy redirects, JSON-LD present | Lighthouse SEO ≥ 95; Rich Results validation (human) |
| Legal | `/privacy`, `/terms` | `privacy`, `terms` | `e2e/legal`, `tests/legal` | served, indexable, export/delete refuse signed-out | configured deletion cascade |
| Feedback | footer dialog | footer dialog | `e2e/feedback`, `tests/feedback`, `tests/messages` | open, validate, queue, cap 20, storage-refused | — |
| Database | — | — | `tests/db` (223) | RLS, constraints, migrations, Stripe, retention, leaderboard, challenge, certificate — **when run by hand** | not run by any gate |
| SQL track (phase 8) | **none** | **none** | **none** | — | all |
| B2B referrals / cohorts / admin (9B) | **none** | **none** | **none** | — | all |
| Analytics / launch (10) | **none** | **none** | **none** | — | all |

### 1.9 Seeded findings re-confirmed (plan §1)

| Plan §1 claim | Re-check | Status |
|---|---|---|
| 1.1 phase-04 doc is stale-low | Routes/lib/specs/migrations `0001`–`0008` incl. `0007_institution_domains.sql` all present; doc shows 10 open, 0 done | **Confirmed** |
| 1.1 phase-05 doc is stale-low | `app/daily`, `app/leaderboard`, `app/flashcards`, `lib/retention/*` (9 modules), 5 `retention-*.test.js` + `retention.test.js` present; doc shows 8 open | **Confirmed** |
| 1.1 phase-08 unbuilt | No SQL route/lib/content/test; only the read-only mirror under `reference/` | **Confirmed** |
| 1.1 phase-09 §B unbuilt | No referral/cohort/admin code; `groups`/`group_invites` referenced only by `tests/db/rls.spec.js` and `tests/db/harness.mjs` | **Confirmed** (RLS tests exercise the dead tables; nothing writes them in product code) |
| 1.2 a green suite is not completeness | 1696/153/4869 green; 49 open boxes and whole absent surfaces | **Confirmed** |
| 1.3 two builds differ | static 120 HTML; `.next` 144 HTML; dynamic account/retention/auth/API routes only in `.next` | **Confirmed** |
| 1.4 config-gated surfaces proven off only | `e2e/auth`, `e2e/paywall`, `e2e/retention`, `e2e/progress`, `e2e/certificate` all assert unconfigured state | **Confirmed** |
| 1.5 `tests/db/` outside every gate | 12 specs, 223 tests, green manually; absent from `npm run check` and all three CI jobs | **Confirmed** |
| 1.6 known deferrals | phase-02 keyboard criterion open (1), phase-06 print/LinkedIn open (2), literal strings still in `app/account`, `app/daily`, `app/leaderboard`, `app/flashcards`, `app/verify` | **Confirmed** |

### 1.10 New observations from Step 1

1. **Gate counts match the plan exactly** — 1696 unit, 153 e2e, 120 prerendered, 4869 checks. The
   plan's baseline is current, not stale.
2. **`npm run db:check` is green today** (223/223). The risk is not that it fails; it is that
   nothing runs it on the way in. This is a process gap, not a code gap — and it means RLS is proven
   only when a human remembers to run it.
3. **Prerendered-page count is `144`, but the build emits `161` static pages.** 144 is the HTML file
   count under `.next/server/app`; 161 includes non-HTML static outputs (metadata routes, `.xlsx`
   datasets, etc.). Both builds' HTML counts are correct; the number in §1.3 is the HTML count, not
   the static-output count.
4. **`/excel-functions/[slug]` and `/learn/*` detail routes are `◐` partial-prerender, not `○`
   static.** The static legacy build is fully static. Any claim of parity between the two builds on
   these routes needs the partial-prerender shell checked at runtime (Step 3).
5. **`/account/profile` is partial-prerender too**, which means its "no session" branch is
   server-streamed, not baked. Its proof in `e2e/auth.spec.js:41` is therefore worth re-checking for
   configured behaviour in Step 3.
6. **The 203 total declared tests in `tests/*.test.js` undercount the 1696 assertions** — the census
   counts top-level `test`/`describe` declarations, many of which are table-driven. The gate count is
   authoritative.
7. **`datasets` in the capability census is a false positive for phase 8** (see 1.5). The census
   command's `route=yes` must not be read as "SQL datasets exist".
8. **No analytics vendor anywhere.** The `analytics|posthog|plausible|segment|gtag|…` probe returns
   only comment/prose hits in retention and legal modules — no integration.

### 1.11 Step 1 conclusion

The artifact base is **larger than the phase docs admit** (04, 05 are stale-low) and **smaller than
the definition of launch requires** (08 is wholly absent; 9B absent but declared out; 10 is mostly
unbuilt). The gates are green and current; the database layer is green but ungated. Step 2 now
adjudicates all 133 checkboxes individually.

---

## Step 2 — Verdict ledger

**Method.** Every one of the 133 checkboxes in `phase-00…phase-10.md` is treated as a claim. A row is
**Proven** only when three things hold: a route renders it (or the claim is a build/process artifact
that a gate reads), a test fails without it, *and* the state a user reaches it in is exercised. The
middle condition was established the hard way — by mutating the capability in a detached scratch
worktree (`git worktree add --detach /tmp/excelsupreme-verify HEAD`, `node_modules` hardlinked, no
change to the branch under review) and watching a named test go red. Reading code was not accepted as
proof; a test that stays green under mutation is reported as unproven even when the code looks right.

| Verdict | Meaning |
| --- | --- |
| **Proven** | Route/build artifact exists, a test fails when the capability is removed, and the state is exercised at runtime or by a gate that runs it. |
| **Built, unproven** | The code exists and the suite is green, but removing or breaking the capability leaves the suite green, or the state is never reached by any gate. |
| **Absent** | No route, no code, no test. |
| **Obsolete** | The claim described the state at the time it was written and no longer matches the artifact; the underlying capability is covered by another row. |

### 2.1 Mutation evidence log

Each line is a real run in the scratch worktree. "Survived" means the command exited 0 — the test
suite does not depend on that capability.

| # | Mutation | Result | Failing witness |
| --- | --- | --- | --- |
| M1 | grader `correct` message text changed | red | `tests/golden.test.js:30` |
| M2 | `hintFor` returns `""` | red | `tests/grader.test.js:458,708,717` |
| M3 | `DEFAULT_SCORING.cap` 100 → 80 | red | `tests/session.test.js:45` |
| M4 | `MIN_FIXTURES` 6 → 1 | red | `tests/content-lint.test.js:116` |
| M5 | paywall ignores `entitled` | red | `tests/paywall.test.js:64` |
| M6 | `STALE_AFTER_DAYS` 14 → 1400 | red | `tests/progress.test.js:71,212,239` |
| M7 | `dayKey` pinned to UTC | red | `tests/retention.test.js:108,115,121` |
| M8 | `/api/health` sha hard-coded | red | `tests/metadata-routes.test.js:102,138` |
| M9 | sitemap drops `terms` | red | `tests/metadata-routes.test.js:31` |
| M10 | `app/about/page.js` deleted, `next:check` re-run *without* a rebuild | **survived** | invalid experiment — `check-next-pages.mjs` reads the existing `.next`; route coverage is instead proven by `e2e/routes.spec.js` and the 120-page prerender |
| M11 | `VERIFY_LIMIT.max` 60 → 6 000 | **survived** | the test derives `max` from the constant it is testing (parametric/self-referential) |
| M12 | `CREDENTIAL_LENGTH` 16 → 12 | red | `tests/certificate.test.js:52,78,286` |
| M13 | `accountsEnabled()` forced `false` | red | `tests/auth.test.js:101` |
| M14 | `isReserved()` forced `false` | red | `tests/keys.test.js:239,246,252,279,284` |
| M15 | `moveSelection()` returns its input | red | `tests/sheet.test.js:54,103,110,117,128,133` |
| M16 | `DEFAULT_SESSION_MINUTES` 60 → 45 | **survived** | every clock test injects `sessionMinutes`; the shipped default is unasserted |
| M17 | one accepted fixture rewritten to `=999999` | red | `npm run content:check` → `✖ accepts "=999999" but the grader rejects it` |
| M18 | `PROMPT_LIMIT` 160 → 20 | red | `npm run content:check` exit 1 |
| M19 | `findBanned()` returns no hits | red | `tests/copy-rules.test.js:52,57,68` |
| M21 | `workbookName()` returns a constant | red | `tests/workbook-build.test.js:77,88,92,61` |
| M22 | `dashboardGroups()` returns `[]` | red | `tests/build.test.js:101,309,441` |
| M23 | `datasetFor()` returns `null` | **survived** (unit) | no unit test imports it; only the route does |
| M24 | M23 + `next build` + browser | red | `e2e/projects.spec.js:81` (`expect(response.status()).toBe(200)`) |
| M25 | `accuracyOf` rounding changed | red | `tests/retention-trend.test.js:45` |
| M26 | card key uses screen type instead of id | red | `tests/retention-flashcards.test.js:101,127,132,137,142` |
| M27 | `LEADERBOARD_TTL` 60 s → 600 s | **survived** | test advances the clock by `LEADERBOARD_TTL`, so it asserts the mechanism, never the minute |
| M28 | PRNG seed offset by one | survived | equivalent mutant — determinism is the claim, not a specific sequence |
| M28b | `seededRandom` → `Math.random()` | red | `tests/retention-challenge.test.js:96,125,178,208` |
| M29 | one `dist` lesson page's prompt removed | red | `legacy/src/verify.mjs` → `1 of 4869 checks failed` |
| M30 | `PROGRESS_KEY` renamed + `next build` | red | `e2e/progress.spec.js` + `e2e/drill.spec.js`, 5 failures (`is-revisit` class, progress POST payload, paywall email) |
| M31 | RLS `profiles_self_read` `using (true)` + `supabase db reset` | red | `tests/db/rls.spec.js:161` (+2) |

M30 matters most: it proves the Playwright layer is not a smoke test. Renaming one storage key — a
change no unit test notices — broke progress persistence, the revisit badge and the progress POST in
a real browser. Runtime evidence in this repo is genuine.

### 2.2 Phase 0 — port shell (20 rows)

| ID | Claim | Verdict | Witness | State |
| --- | --- | --- | --- | --- |
| p0-34 | Next 16.4.3 + React 19.3.0 pinned, App Router, ESM | Proven | `package.json` deps; build runs in gate | n/a (artifact) |
| p0-37 | Legacy moved to `legacy/`, not rewritten | Proven | `tests/fragments.test.js:42` | static build |
| p0-41 | Golden recorded before code moved | Proven | `tests/golden.test.js:30` (M1) | n/a |
| p0-43 | Grader extracted with zero logic edits | Proven | `tests/grader.test.js:458` (M2) | n/a |
| p0-50 | Content package extracted | Proven | `npm run content:check` (M17, M18) | n/a |
| p0-59 | Routes wired to the same templates | Proven | `e2e/routes.spec.js:67`; `next:check` 120 pages | browser |
| p0-77 | Redirect map for legacy URLs | Proven | `e2e/routes.spec.js:25,31` | browser (301) |
| p0-82 | 404 reuses chrome + config | Proven | `e2e/dashboard.spec.js:225` | browser |
| p0-91 | CI runs three jobs | Proven | `.github/workflows/ci.yml` (jobs `check`, `e2e`, `static`) | n/a — note: no db job |
| p0-99 | Playwright suite against Next + static | Proven | 153 passed; `e2e-static/static-drill.spec.js:33` | browser |
| p0-110 | Sitemap + robots metadata routes | Proven | `tests/metadata-routes.test.js:31` (M9) | route |
| p0-132 | `.gitignore` covers build + env | Proven | `.gitignore` | n/a |
| p0-179 | `npm test` ≥280 passing | Proven | 1 696 passing | n/a — number obsolete |
| p0-180 | Build produces "all 27 pages" | Obsolete | 120 prerendered / 144 HTML; `tests/build.test.js:56` | the capability is covered by p0-184 |
| p0-181 | Golden diff empty | Proven | `tests/golden.test.js:30` (M1) | n/a |
| p0-182 | Playwright green locally and in CI | Proven | 153 passed locally; CI runs cited in the claim | browser |
| p0-183 | Preview deploy serves lessons; `/api/health` returns SHA | **Absent** | health half proven by `tests/metadata-routes.test.js:102` (M8); no deploy provider exists | no hosted state |
| p0-184 | `legacy/` builds and deploys independently | Proven | `tests/build.test.js:56`; `legacy/dist` = 120 HTML | static build |
| p0-185 | Sitemap/robots list every route, no redirect-only address | Proven | `tests/metadata-routes.test.js:31,48` (M9) | route |
| p0-187 | Bundle size documented by route | **Built, unproven** | no document in `docs/` carries a per-route budget table; only prose in plans | n/a |

### 2.3 Phase 1 — curriculum content factory (16 rows)

| ID | Claim | Verdict | Witness | State |
| --- | --- | --- | --- | --- |
| p1-41 | Schema v2 owned by `packages/content/schema.js` | Proven | `content:check` (M18) | gate |
| p1-54 | Six accepted + six rejected fixtures per screen | Proven | `tests/content-lint.test.js:116` (M4) | gate |
| p1-62 | `content:check` fails on a bad fixture | Proven | M17 → exit 1 with the rule named | gate |
| p1-73 | Four CLI commands wired as npm scripts | Proven | `packages/content-lint/cli.js`; `content:check`/`copy`/`articles`/`fixtures` | gate |
| p1-92 | 16 groups, 88 lesson slots | Proven | `content:check` → `88 of 88 catalogued lessons, 16 groups, 152 screens` | gate |
| p1-122 | Every group carries a 150–250-word intro | Proven | `tests/content.test.js:94` ("ships an intro for every one of the sixteen groups") | gate |
| p1-166 | Authoring guide exists | Proven | `docs/content-authoring.md` | n/a |
| p1-183 | All lessons `schemaVersion: 2` | Proven | `content:check` accepts 88/88 | gate |
| p1-206 | Cohorts of ten through a human review pass | **Built, unproven** | no review record anywhere in the repo; content is green but "human pass" is unrecorded | n/a |
| p1-1006 | `content:new --lesson 11` renders and grades | Proven | `tests/content-lint.test.js:687` (new-lesson fixture path) | gate |
| p1-1008 | CI fails when a screen lacks 6+6 fixtures | Proven | M4 | gate |
| p1-1009 | Every fixture verdict matches expectation | Proven | M17; 1 946 fixtures replayed | gate |
| p1-1010 | `track.json` = 88 lessons, 16 groups, 0 planned | Proven | `content:check` header line | gate |
| p1-1012 | Migrated lessons keep their behaviour | Proven | golden unchanged (M1) | gate |
| p1-1013 | Intros 150–250 words, enforced by a test | Proven | `tests/content.test.js:94`; `tests/content.test.js:505` (fails when an intro is missing) | gate |
| p1-1014 | A second person can author a lesson unaided | **Built, unproven** | guide exists; no second author, no dry-run record | n/a |

### 2.4 Phase 2 — exercise engine (20 rows)

| ID | Claim | Verdict | Witness | State |
| --- | --- | --- | --- | --- |
| p2-24 | Event vocabulary, 17 names | Proven | `tests/session.test.js:402` | unit |
| p2-30 | Score loop `createSession`/`recordVerdict`/`emitAll` | Proven | `tests/session.test.js:45` (M3) | browser + unit |
| p2-35 | Wall-clock session budget, **default 60 min** | **Built, unproven** | `packages/session/clock.js:12`; M16 survived — every test injects the budget | browser exercises the mechanism, not the default |
| p2-43 | Formula screen, multi-screen lesson | Proven | `e2e/drill.spec.js`; `tests/fragments.test.js:42` | browser |
| p2-55 | `type` picks the panel at build time | Proven | `tests/five-types.test.js:132` | build + browser |
| p2-62 | Picture screen | Proven | `e2e/a11y.spec.js:143` | browser |
| p2-74 | Chord + sequence screens, capability fallback | Proven | `tests/keys.test.js:239` (M14); `e2e/a11y.spec.js:160` | browser |
| p2-91 | Workbook screen ships rows, not a file | Proven | `tests/workbook-build.test.js:77` (M21); `e2e/a11y.spec.js:179` | browser |
| p2-114 | Hints and help, three surfaces, one owner each | Proven | `tests/grader.test.js:458` (M2) | browser |
| p2-208 | Focus management, `aria-live`, keyboard | Proven | `e2e/wcag22.spec.js:106` | browser |
| p2-225 | 7-screen lesson reaches 100 and completes | Proven | `tests/five-types.test.js:149` | unit |
| p2-236 | Recycling terminates at 100 | Proven | `tests/session.test.js:68,87,96` (M3 breaks the cap) | unit |
| p2-237 | Chord matrix on Chrome/Safari/Firefox × macOS/Windows | **Built, unproven** | no recorded matrix; only Chromium in CI | n/a — claim says so itself |
| p2-245 | A browser-reserved chord degrades to the fallback | Proven | `tests/keys.test.js:252` (M14) | browser |
| p2-252 | Wrong answer shows the hint for the actual failure mode | Proven | `tests/grader.test.js:458,708,717` (M2) | browser |
| p2-256 | `showAnswerAfter` configurable and respected | Proven | `tests/client.test.js:603,612,618` | browser |
| p2-260 | Workbook preview renders offline, no third-party request | Proven | `tests/build.test.js:363`; `e2e/a11y.spec.js:179` | browser |
| p2-262 | axe: zero critical/serious on the player | Proven | `e2e/a11y.spec.js:83` | browser |
| p2-263 | Keyboard-only learner completes a full lesson | Proven | `e2e/keyboard.spec.js:67` | browser |
| p2-265 | Timer pauses when the tab is hidden | Proven | `e2e/drill.spec.js` `setHidden` harness (line 265) | browser |

### 2.5 Phase 3 — dashboard and progression (16 rows)

| ID | Claim | Verdict | Witness | State |
| --- | --- | --- | --- | --- |
| p3-19 | Progress read model `summarise` | Proven | `tests/progress.test.js:128` | browser + unit |
| p3-27 | Dashboard layout: count, bar, up-next | Proven | `e2e/dashboard.spec.js` | browser |
| p3-34 | Badge precedence stale > needs_practice > complete | Proven | `tests/progress.test.js:71` (M6) | browser |
| p3-40 | Reset progress, two clicks, 6 s, Escape cancels | Proven | `tests/client.test.js:702`; `e2e/dashboard.spec.js:109` | browser |
| p3-43 | `noindex` on `/learn`; sitemap and `next:check` assert it | Proven | `tests/metadata-routes.test.js:93` | route |
| p3-45 | Category pages `/learn/groups/<id>` | Proven | `e2e/dashboard.spec.js:225` | browser |
| p3-53 | `canStart` gating | Proven | `e2e/gate.spec.js:15,38,60` | browser |
| p3-69 | Four recommendation reasons | Proven | `tests/progress.test.js:113,120,138` | browser |
| p3-76 | Feedback modal on every page | Proven | `tests/build.test.js:101`; `e2e/a11y.spec.js:249` | browser |
| p3-165 | Signed-out learner sees 1–3 open, rest as sign-in prompt | Proven | `e2e/gate.spec.js:15,60` | browser, accounts off |
| p3-172 | Signed-in next lesson updates immediately | **Built, unproven** | no gate ever signs in; `e2e/auth.spec.js` only tests the unconfigured state | no signed-in state |
| p3-176 | Badge precedence over eight combinations | Proven | `tests/progress.test.js:71,212,239` (M6) | unit |
| p3-179 | Category counts sum to the track total | Proven | `tests/progress.test.js:164` | unit |
| p3-180 | Dashboard renders < 1 s throttled | **Built, unproven** | no throttled measurement anywhere | n/a |
| p3-185 | Empty state and error state both implemented | **Built, unproven** | empty state reached; no test drives a failing progress fetch | half the claim unexercised |
| p3-191 | Reset asks twice, cannot fire from a stray keypress | Proven | `tests/client.test.js:702`; `e2e/dashboard.spec.js:109` | browser |

### 2.6 Phase 4 — accounts and entitlements (10 rows)

None of these rows is Proven, and the reason is structural: the gate has no accounts. `e2e/auth.spec.js`
tests only the "accounts are off" deployment; the real flows live in `tests/db/*.spec.js`, which no gate
runs.

| ID | Claim | Verdict | Witness | State |
| --- | --- | --- | --- | --- |
| p4-289 | Progress survives device switch and cache clear | Built, unproven | `tests/db/progress.spec.js` (server-side rows); no UI path | DB only |
| p4-290 | Test-mode subscription unlocks within one webhook tick | Built, unproven | `tests/db/stripe.spec.js:100` | DB only |
| p4-294 | Refund revokes access on the next request | Built, unproven | `tests/db/stripe.spec.js:176` | DB only |
| p4-298 | Revocation holds with a pre-existing access token | Built, unproven | `tests/db/stripe.spec.js:176` | DB only |
| p4-304 | Second device signed in before purchase unlocks without re-login | Built, unproven | `tests/db/stripe.spec.js:129` | DB only |
| p4-307 | Soft prompt at 4, hard gate at 5, direct URL blocked | Built, unproven | `lib/paywall.js` + `tests/paywall.test.js:49`; hard gate needs `PAYWALL=on` **and** accounts, which no run has | no enforced state |
| p4-312 | Account deletion removes profile/progress/attempts/points/streaks | Built, unproven | `tests/db/institution.spec.js:148` (seat) and `tests/db/legal.spec.js` | DB only |
| p4-320 | RLS proves A cannot read/write B, cannot insert a completion | Built, unproven | `tests/db/rls.spec.js:161` (M31 goes red) | DB only, ungated |
| p4-322 | Webhook replay produces no duplicate entitlement | Built, unproven | `tests/db/stripe.spec.js:151` | DB only |
| p4-325 | No secret in the client bundle (`grep` gate in CI) | **Absent** | `.github/workflows/ci.yml` has no such step; no script does it | n/a |

### 2.7 Phase 5 — retention (8 rows)

| ID | Claim | Verdict | Witness | State |
| --- | --- | --- | --- | --- |
| p5-68 | Points reset at local midnight, survive a TZ change | Proven | `tests/retention.test.js:108,115,121` (M7) | unit + DB |
| p5-69 | Two users see the same leaderboard, own rank at 1/3/50 | Built, unproven | `tests/db/leaderboard.spec.js:113,142`; no runtime board (accounts off) | DB only, ungated |
| p5-70 | Second challenge submission rejected with a clear message | Built, unproven | `tests/db/challenge.spec.js:146`; `tests/retention-challenge.test.js:96` (M28b) | DB + unit, no UI |
| p5-71 | Challenge ranking: accuracy then time, 20 seeded rows | Built, unproven | `tests/db/challenge.spec.js:183`; `tests/db/leaderboard.spec.js:237` | DB only |
| p5-72 | Flashcards never surface an incomplete lesson | Proven | `tests/retention-flashcards.test.js:101` (M26) | browser (`e2e/flashcards.spec.js`) |
| p5-73 | A cheater row is flagged, not displayed | Built, unproven | `tests/db/leaderboard.spec.js:180` | DB only |
| p5-74 | Dashboard trend renders with 0, 1 and 7 days of data | Built, unproven | `tests/retention-trend.test.js:45` (M25) proves the maths; no run renders the 1-day and 7-day states | unit only |
| p5-75 | Retention queries p95 < 300 ms at 10k users | **Absent** | no load harness, no fixture generator, no threshold | n/a |

### 2.8 Phase 6 — credential and projects (10 rows)

| ID | Claim | Verdict | Witness | State |
| --- | --- | --- | --- | --- |
| p6-81 | Issuing twice returns the existing certificate | Built, unproven | `tests/db/certificate.spec.js`; `/verify` is public, issuing is not reachable in any gate | DB only |
| p6-82 | Name cannot be changed by client, DB update or re-issue | Built, unproven | `tests/db/certificate.spec.js` (write-once trigger, `23001`) | DB only |
| p6-83 | `/verify/{id}` works signed out | Proven | `e2e/certificate.spec.js:19,31` | browser, signed out |
| p6-84 | Unknown ID returns a clean not-found page | Proven | `e2e/certificate.spec.js:37,46` | browser |
| p6-85 | Revoked certificate shows "revoked" and still resolves | Built, unproven | `tests/db/certificate.spec.js`; no revoked fixture reaches a browser | DB only |
| p6-86 | Enumeration rate-limited, a reader is not | Proven | `tests/verify-limit.test.js:29`; `e2e/verify-limit.spec.js` | browser + unit — **value unpinned**, M11 |
| p6-94 | LinkedIn URL prefills the licence form | Built, unproven | `tests/certificate.test.js` asserts the URL field by field; never opened in LinkedIn | claim admits it |
| p6-95 | Printed sheet correct with a 60-char name and non-Latin characters | Built, unproven | `tests/client.test.js:323,330,337` cover ink, one page and the URL; the 60-char + non-Latin case is unrecorded | print not exercised with that input |
| p6-97 | Four projects downloadable first-party, correct MIME and size | Proven | `e2e/projects.spec.js:81` (M24); `tests/projects.test.js:101` | browser |
| p6-104 | Projects gated identically to lessons | Proven | `e2e/projects.spec.js:96` | browser |

### 2.9 Phase 7 — SEO content engine (7 rows)

| ID | Claim | Verdict | Witness | State |
| --- | --- | --- | --- | --- |
| p7-67 | Eight notes live, unique title/description, working drill | Proven | `e2e/article.spec.js:16,28,53` | browser |
| p7-69 | Zero orphan pages, link lint green | Proven | `tests/build.test.js:441` (M22 → "internal links point at pages that are not built") | build |
| p7-70 | Lighthouse SEO ≥ 95 on three articles | **Absent** | no Lighthouse config, no CI step | n/a |
| p7-71 | Every note reachable in two clicks, sibling links between notes | Built, unproven | `e2e/article.spec.js:16` proves hub → note; no sibling-link assertion exists | half the claim unexercised |
| p7-72 | Sitemap matches the route list exactly (118 over 120) | Proven | `tests/metadata-routes.test.js:31` (M9) | route — counts moved; invariant holds |
| p7-73 | JSON-LD validates in the Rich Results test | Built, unproven | `tests/build.test.js:309` parses it; `e2e/article.spec.js:38` reads it; no external validation recorded | claim admits it |
| p7-75 | Note ships one module, drill island ~3 KB | Proven | `e2e-static/static-drill.spec.js:115`; `tests/articles.test.js` | browser |

### 2.10 Phase 8 — SQL track (8 rows)

Wholly absent. No route, no engine, no content, no test; the only SQL-shaped artifact is
`reference/excelexercises-mirror/`, which is read-only reference material.

| ID | Claim | Verdict | Witness |
| --- | --- | --- | --- |
| p8-66 | Aliasing/whitespace-insensitive grading | **Absent** | no SQL grader |
| p8-67 | Wrong column order fails with a column diff | **Absent** | — |
| p8-68 | Right rows, wrong order passes unless `ordered` | **Absent** | — |
| p8-69 | `DELETE`/`UPDATE` grade table state; next screen sees a clean DB | **Absent** | — |
| p8-70 | Destructive statements cannot touch anything outside the lesson DB | **Absent** | — |
| p8-71 | 23 lessons complete end-to-end, category counts match | **Absent** | — |
| p8-72 | Engine loads in < 1.5 s, added JS documented | **Absent** | — |
| p8-73 | Every fixture verdict matches in CI | **Absent** | — |

This is the ledger's largest problem: phase 8 is in the definition of launch (phase-10 doc, "0–8, 9A,
10, except 9B") and it is the one phase with zero artifacts.

### 2.11 Phase 9 — 9A polish, 9B deferred (9 rows)

| ID | Claim | Verdict | Witness | State |
| --- | --- | --- | --- | --- |
| p9-278 | Dark mode: zero contrast failures | Proven | `e2e/a11y.spec.js:412,434,451` | browser, both schemes |
| p9-282 | axe zero critical/serious on five core pages, both themes | Proven | `e2e/a11y.spec.js:40,45,83,98,317` + dark block at 412 | browser |
| p9-284 | Certificate prints on one page in A4 and Letter | Built, unproven | `tests/client.test.js:330` asserts one page and *leaves paper size to the printer*; no A4/Letter run | print, one paper size |
| p9-287 | No hard-coded user-facing string outside the catalogue | **Absent** | no string catalogue, no lint that proves it | n/a |
| p9-291 | Owner invites 3, 2 accept → seats/table/CSV agree | **Absent** | 9B; `groups`/`group_invites` appear only in `tests/db/rls.spec.js` and the harness | n/a |
| p9-292 | 4th invite with 3 seats fails cleanly, no orphan row | **Absent** | 9B | n/a |
| p9-293 | Removing a member frees a seat, revokes on next request | **Absent** | 9B | n/a |
| p9-295 | Non-owner cannot reach `/admin`; RLS proves no cross-group reads | **Absent** | no `/admin` route exists | n/a |
| p9-296 | Referral click → signup → first payment = one conversion, one credit | **Absent** | no referral code anywhere | n/a |

### 2.12 Phase 10 — analytics and launch (9 rows)

| ID | Claim | Verdict | Witness |
| --- | --- | --- | --- |
| p10-134 | Every event fires once; duplicates dropped by `(session_id, event, ts)` | **Absent** | event vocabulary exists (`tests/session.test.js:402`) but no sink, no dedupe key, no vendor |
| p10-135 | Funnel reconciles with Stripe within 2% | **Absent** | no funnel, no reconciliation |
| p10-136 | Lighthouse CI green on five budgeted routes | **Absent** | no Lighthouse |
| p10-137 | All 201 legacy HTML routes return a single 301 | **Absent** | `next.config.mjs` has 2 rules; the other 118 legacy pages are served directly, never redirected |
| p10-139 | Sitemap count === route count; Search Console accepts it | Built, unproven | `tests/metadata-routes.test.js:31` proves the equality; Search Console submission is unrecorded |
| p10-140 | Restore drill: backup restored into staging, row counts verified | **Absent** | no staging, no backup job |
| p10-142 | Error monitoring receives a synthetic error | **Absent** | no monitoring client in any dependency |
| p10-143 | Rollback to legacy executed in staging and timed | **Absent** | no staging |
| p10-144 | Launch checklist signed line by line | **Absent** | no checklist exists |

### 2.13 Counts

| Phase | Rows | Proven | Built, unproven | Absent | Obsolete |
| --- | --- | --- | --- | --- | --- |
| 0 — port shell | 20 | 17 | 1 | 1 | 1 |
| 1 — content factory | 16 | 14 | 2 | 0 | 0 |
| 2 — exercise engine | 20 | 18 | 2 | 0 | 0 |
| 3 — dashboard | 16 | 13 | 3 | 0 | 0 |
| 4 — accounts | 10 | 0 | 9 | 1 | 0 |
| 5 — retention | 8 | 2 | 5 | 1 | 0 |
| 6 — credential/projects | 10 | 5 | 5 | 0 | 0 |
| 7 — SEO engine | 7 | 4 | 2 | 1 | 0 |
| 8 — SQL track | 8 | 0 | 0 | 8 | 0 |
| 9 — 9A/9B | 9 | 2 | 1 | 6 | 0 |
| 10 — analytics/launch | 9 | 0 | 1 | 8 | 0 |
| **Total** | **133** | **75** | **31** | **26** | **1** |

75 + 31 + 26 + 1 = 133, reconciled against the Step 1 claim census (84 ticked / 49 open). The shape
is what matters: **a bare majority is Proven, nearly a quarter is built-but-unproven, and a fifth does
not exist** — and the absent fifth is concentrated exactly where launch is claimed (phase 8) and where
the product's money and growth live (4, 9B, 10). Note the mismatch with the docs' own tally: 84 boxes
are ticked, but 11 of those ticks do not survive adjudication (p0-180, p0-187, p1-1014, p2-35, p3-172,
p3-180, p3-185, p6-81, p6-82, p6-85, p7-71), and two Proven rows (p5-68, p5-72) are left unticked —
so the docs are wrong in both directions. The phase-4 and phase-5 docs are wrong the other way:
18 open boxes and 0 done, although the code and the DB suites for them exist today.

### 2.14 New defects found while building this ledger

| # | Defect | Evidence | Severity |
| --- | --- | --- | --- |
| D1 | `VERIFY_LIMIT.max` is asserted only against itself; the shipped ceiling can change to 6 000/min without a red test | M11 | medium |
| D2 | `DEFAULT_SESSION_MINUTES` is never exercised; the "60-minute session" is a comment, not a claim a test holds | M16 | low |
| D3 | `LEADERBOARD_TTL` is asserted only through itself; the "one minute" cache is unpinned | M27 | low |
| D4 | `datasetFor()` — the only thing standing between a URL and the filesystem — has no unit test; it is covered only by one browser fetch | M23, M24 | medium |
| D5 | No secret-scan gate exists although phase 4 claims one | `.github/workflows/ci.yml` | medium |
| D6 | `tests/db/` (223 tests) is outside every gate; CI has no Supabase job | `ci.yml`; `package.json` | high |
| D7 | Phase 4's ten acceptance rows cannot be exercised by any run because no gate configures accounts | `e2e/auth.spec.js` covers only the unconfigured state | high |
| D8 | Phase 10's "201 legacy routes → 301" has 2 redirect rules behind it, and the remaining legacy pages are served directly, so the claim and the artifact describe different things | `next.config.mjs` | medium |
| D9 | Phase 0's page count ("27 pages") and phase 7's sitemap count ("118 over 120") are stale; a reader cannot tell from the docs what ships today | `phase-00:180`, `phase-07:72` | low |

Defects are recorded, not fixed — the ledger is not complete for Step 5/6 yet, and the plan forbids
fixing while it is open.

**Stop point 2.** The ledger above is the decision input for Step 3 onward.

## Step 3 — Runtime state matrix

Both builds were walked by hand, at HEAD `6ca8828`, from a detached worktree so no repo file changed:

| Build | Served by | Port |
| --- | --- | --- |
| Next | `npx next start` over `.next` | 4174 |
| Static | `node scripts/serve-static.mjs legacy/dist 4175` | 4175 |

Rows 5 and 6 also needed a local Supabase (`supabase start`, API on 54351) plus a `.env.local` with the
local publishable and secret keys, which is the state no gate ever runs. **51 screenshots** live under
`screenshots/2026-10-31/{next,static}/`; every row below names them. "Exercised" means the state was
reached and its outcome read from the page or the HTTP response — not inferred from code.

| # | State | Next build | Static build |
| --- | --- | --- | --- |
| 1 | First visit, cold | `01-cold-first-visit.png` — 200, title `Excel Supreme · Excel formula drills`, hero, `Start drill 1`, no storage. **Exercised.** | Same shot, same 200 and same copy. **Exercised.** |
| 2 | Returning learner with progress | `02-…-a…d.png` — drill finished, after reload the drill says *Already solved*, dashboard reads `1/88` with up-next *Start drill 2*, and re-entering the drill keeps the solved state. **Exercised** (signed out); the signed-in variant is row 5. | Identical in all four shots. **Exercised.** |
| 3 | Mid-drill abandon and resume | `03-…-a…c.png` — left at screen 2 of 3, returned: **back at screen 1**, dashboard's up-next still points at that drill as unfinished, and no attempt is recorded anywhere. **Exercised — see D12.** | Identical. **Exercised — see D12.** |
| 4 | Gated lesson, paywall boundary | `04-…-a…c.png` + probe — a cold request hits the **order** gate (`data-gate="order"`, *Drill 5 opens after drill 1*, formula hidden); with drill 1 done, drill 4 shows the **prompt** gate whose `#grace-pass` opens it once (*One free pass used*); drill 5 then shows the **trial** gate, whose email opens it (*Trial started*) and stays open across reload. **Exercised.** | Same three gates, same copy, same outcomes. **Exercised.** |
| 5 | Accounts configured | `05-…-a…g.png` + probe — real signup → redirect to `/learn` signed in → `POST /api/progress` **201** → dashboard `1/88` → `/account` shows name, email, username, plan, member since, zero-stat copy. With 88/88 recorded the certificate issues (`/api/certificate` 200) and resolves publicly. **Exercised**, with D10 below. | No account surface exists (no API): signup, login and `/account` are Next-only. **Not available.** |
| 6 | Payments configured | `06-payments-configured-a-pricing.png` — `/pricing` renders `$59.99/year`, one purchase for 88 drills, and *Checkout is not open yet. Until it opens, every paid drill opens free*. No Stripe key was available, so **no test-mode card and no webhook replay** were walked. **Not exercised.** | Same page, same state. **Not exercised.** |
| 7 | Errors: bad slug, 500, offline | `07-errors-a…b.png` — unknown lesson returns **HTTP 404** (curl-confirmed) with the full chrome and *That page is not a drill*; offline submit still grades (*Correct*) because the grader is client-side, with no error banner and no lost work. No 500 path could be induced. **Partially exercised.** | `07-errors-a…b.png` — unknown lesson is **HTTP 404 with a bare `Not found`** body, no chrome, no route home (D13). Offline behaves as Next. **Partially exercised.** |
| 8 | 1280×720 at 100 % and 150 % | `08-zoom-a…b.png` — no horizontal overflow at 150 % (`scrollWidth === clientWidth`). **Exercised.** | Identical. **Exercised.** |
| 9 | Phone at 360 px | `09-phone-360-a…b.png` — no overflow; 115 interactive targets, **none under 24 px tall**. **Exercised.** | Identical. **Exercised.** |
| 10 | Keyboard only | `10-keyboard-only.png` — first Tab lands on `Check` with a 2 px solid outline in the accent colour; the sixth lands on the next-drill link with the same ring. **Exercised.** | Identical. **Exercised.** |
| 11 | Dark scheme, reduced motion | `11-dark-reduced-motion-a…b.png` — `rgb(25, 25, 24)` background with `color-scheme: dark`; under `prefers-reduced-motion: reduce` every transition and animation duration computes to `0s`. **Exercised.** | Identical. **Exercised.** |
| 12 | Print | `12-print-a4.png`, `12-print-letter.png`, `12-print-a-verify-held.png` — a real credential (`XYHDC6GNTQTGA36F`, issued from 88/88) prints on A4 and Letter with header and footer hidden and the verification URL spelled out; `12-print-unknown-credential.png` shows the unknown-id state. **Exercised.** | `12-print-verify-404.png` — `/verify/<id>` is **404**, so there is no certificate to print. **Not available.** |
| 13 | Static deep URL, cold request | `13-cold-deep-url.png` — 200 with assets. **Exercised.** | 200 from a cold request with no prior navigation; relative assets resolve. **Exercised.** |

### 3.1 Cross-build differences (the two builds are not the same site)

| Difference | Next | Static | Consequence |
| --- | --- | --- | --- |
| `/verify/<id>` | 200; held, unknown and malformed ids each render their own state in ~350 ms | **404** | A printed certificate's own verification URL dies on a static host (D11) |
| `/api/health` | 200 `{"status":"ok","sha":"6ca8828"}` | route absent | Invariant 10 can only be met by the Next deployment |
| Accounts | signup, login, `/account`, `/api/progress`, `/api/certificate` | absent | Rows 5, 6 and 12 exist in one build only |
| 404 page | HTTP 404 with chrome and a route home | HTTP 404 with a bare `Not found` | Static 404s strand the visitor (D13) |

### 3.2 New defects from the walk

| # | Defect | Evidence | Severity |
| --- | --- | --- | --- |
| D10 | Work done before creating an account is invisible after signup: the dashboard reads `0/88` and *Nothing started yet* while `es.progress` still holds the finished drill, because nothing syncs at sign-in. It self-heals on the next graded drill, which pushes the whole local record (measured `0/88` → `2/88` after one more completion). | signup immediately after finishing drill 1: dashboard `0/88`; `/api/progress` 401 before sign-in, 201 only at the next submission | medium |
| D11 | The static build serves **404** for `/verify/<id>`, yet the printed certificate carries that URL and the site's print path is the certificate's purpose | `12-print-verify-404.png`; curl and Playwright both 404 | high |
| D12 | Mid-drill abandonment resumes at **screen 1**, not the screen left, and leaves no record of the attempt — the dashboard still offers the drill as unfinished and the order gate still blocks the next one. Plan §4 calls this "the most-used real path"; no claim in phases 0–10 promises screen-level resume, so this is a product decision to triage, not a proven bug against a claim | `03-…-a…c.png`; probes on both builds | needs decision |
| D13 | The static build's 404 is a bare `Not found` page with no chrome and no way back | `07-errors-a-unknown-lesson.png` (static) | low |

### 3.3 Method notes

- **A status code was almost mis-recorded.** `page.goto` in one probe returned 200 for an unknown
  lesson while `curl -I` and a fresh Playwright navigation both returned 404. The code is 404; the
  probe was reading a stale response from a reused page. Statuses in this section come from a document
  response or curl, never from a reused page object.
- **The verify page is not stuck.** It was first read as "Loading the form…" at 1.5 s; measured to
  settle at ~350 ms for held, unknown and malformed ids. No defect.
- **Grading offline is correct**, not a fallback leak: the grader is client-side by design, so "offline
  submit still grades" is the intended behaviour, and only the progress POST is lost.
- **`.env.local` is still in the worktree** and must be removed before any gate re-run, because 14 specs
  assert the unconfigured state (`.env.example` says so).
- **Not walked, and therefore not signable:** Stripe checkout, a webhook replay, any 500 path, and rows
  5/6/12 in the static build, which has no account or certificate surface at all.

**Stop point after the matrix** is not a plan stop; Step 4 follows directly, and Step 5 is where these
rows become decisions.

## Step 4 — Invariants

Eleven invariants, checked against the artefact rather than the plan. Two had no test at all
(invariants 1 and 3-static); both now do, and both were mutation-proved by breaking the assertion and
watching it go red. One (`tests/db/`) has a test suite and no gate.

| # | Invariant | Status | Evidence | Test |
|---|---|---|---|---|
| 1 | Every route reachable in ≤3 clicks, exceptions listed | **Partial — one orphan family** | BFS from `/` at depth 3 reaches **129 paths** including every sitemap entry except the 8 `/excel-functions*` pages. New defect **D14**: those are sitemapped, canonical, indexable, and linked by nothing (their only inbound links are from each other). | **Written this review:** `e2e/reachability.spec.js:65` (depth-3 BFS ⇔ sitemap, orphans exempt with D14 named), `:73` (fails the day an orphan is linked, so the exemption cannot rot), `:98` (front door carries no `/verify`, `/api` or `/reset` link). Mutation: `DEPTH = 1` → red. |
| 2 | Every route 200 with chrome, except `/api/*` and unheld `/verify/[id]` | **Satisfied, with one hole** | 128 paths (119 sitemapped + 9 gated) all answer 200 with `<header class="site">` and `<footer class="foot">`. The hole is **D16**: unknown dynamic slugs (`/learn/excel/<x>`, `/learn/projects/<x>`, `/learn/groups/<x>`) answer **200** with Next's bare error shell — no `<title>`, no `<h1>`, only `<meta name="robots" content="noindex">`. Only a genuinely unknown top-level path (`/nothing-here`) gets a real 404. | **Written this review:** `e2e/reachability.spec.js:83`. Existing: `e2e/routes.spec.js:37` covers the real-404 case only. |
| 3 | No dead internal link in either build | **Next yes; static no** | Next crawl is clean (`e2e/routes.spec.js:109`, 12 representative surfaces). First static crawl of all 120 `legacy/dist/**/*.html` found **two dead destinations**, D15: `/pricing` ships a primary CTA "Create an account" → `/signup?next=/pricing` (404), and `/privacy`, `/terms` link "account page" → `/account` (404) — the accounts surfaces exist only on the Next deploy. | **Written this review:** `e2e-static/static-links.spec.js:38` — every `href`/`src` in every shipped HTML file, resolved and requested. Mutation: empty `KNOWN_DEAD` → red on exactly those two. |
| 4 | `sitemap.xml` ⇔ static routes, exactly | **Satisfied** | `tests/build.test.js` pins the 118-loc sitemap; `tests/seo.test.js:61` renders every URL it lists and only those; `tests/metadata-routes.test.js:31` pins the Next-side sitemap against `indexablePaths()`. | `tests/build.test.js`, `tests/seo.test.js:61`, `tests/metadata-routes.test.js:31` |
| 5 | Every lesson has a reference answer, a rejected fixture, a hint and a solution, graded by the real grader | **Satisfied, all 88** | `tests/fixtures.test.js` runs the real `grade()` over 88 lessons / 152 screens / 147 formula screens; 0 published drills are missing fixtures; per-screen accepted+rejected floor and hint reachability are asserted. | `tests/fixtures.test.js:31,52,65,106,142` |
| 6 | Every page has a title, description and canonical | **Satisfied on coverage, hollow on host** | Runtime audit of 25 routes across the Next build: every one has a unique title, a description and exactly one `<h1>`; 9 indexable pages carry a canonical; 15 private/`noindex` pages carry `noindex` and (correctly) none. What the audit also shows is that **every canonical reads `http://localhost:4173`** — the documented `SITE_URL` fallback (`legacy/src/site/config.mjs:7`). No gate and no CI job sets `SITE_URL`, so a deploy that forgets it ships canonicals pointing at a laptop. Documented in `README.md:65`, gated by nothing: **no test asserts the production origin**. Minor: `/reset/password` reuses the generic site description. | `tests/seo.test.js`, `tests/metadata-routes.test.js` (coverage); **no test for the origin** |
| 7 | No banned copy, no typography violations, over chrome **and** lessons **and** legal | **Partial — legal is unchecked** | `npm run content:check` lints lessons and the function notes (`packages/content-lint/cli.js`), and `tests/copy.test.js` pins the rules. The legal pages are checked for *sections* (`tests/legal.test.js:42`) but not for typography or banned vocabulary, and chrome strings are covered by `tests/messages.test.js` only. | `tests/copy.test.js`, `packages/content-lint/cli.js`, `tests/legal.test.js:42` |
| 8 | Contrast, hit targets, focus rings, labels, including checkout and account | **Satisfied** | `e2e/a11y.spec.js` walks home, dashboard, drill (before and after a miss), groups, projects, pricing, the gates, login, signup, account and profile; `e2e/wcag22.spec.js` adds 2.2 criteria. | `e2e/a11y.spec.js:40-120`, `e2e/wcag22.spec.js` |
| 9 | Empty states carry a CTA; loading states are skeletons, not spinners | **Satisfied** | Dashboard empty state CTA asserted; skeleton asserted; no spinner class exists in the shell. | `e2e/dashboard.spec.js:32`, `e2e/a11y.spec.js:364` |
| 10 | `/api/health` reports the deployed SHA | **Satisfied** | Live probe returns `{"status":"ok","sha":"6ca8828"}`; the route reads `GIT_SHA`/`VERCEL_GIT_COMMIT_SHA` and falls back to `unknown` for a bare checkout. | `e2e/routes.spec.js:45`, `tests/metadata-routes.test.js:102` |
| 11 | `tests/db/` runs inside the gate | **Absent — by construction** | `npm run db:check` is a separate script (`supabase db reset` + 12 spec files, 223 assertions, all green on this machine). `.github/workflows/ci.yml` has no job that runs it and no Supabase service; nothing in `npm run check` touches it. So every green CI run to date is silent about RLS, constraints and migration safety. Proposed job (not applied — a workflow edit is an owner decision, Step 5): a `db` job with `supabase/setup-cli`, `supabase start`, then `npm run db:check`, `needs: check`. | none |

### 4.1 Two tests added in this review

Both were run green against the built app, then mutated to prove they can fail, then restored.

| File | Proves | Green run | Mutation that reddens it |
|---|---|---|---|
| `e2e/reachability.spec.js` (4 tests) | invariants 1 and 2 for the Next build | 4 passed | `DEPTH 3 → 1` → 128 unreachable |
| `e2e-static/static-links.spec.js` (1 test) | invariant 3 for the static build | 1 passed, 100+ targets, 120 pages parsed | `KNOWN_DEAD` emptied → 2 dead links |

Both carry an explicit, named exemption (`ORPHAN_FAMILY`, `KNOWN_DEAD`) tied to a defect id, so the
suite is green today *and* fails on any new instance of either fault. That is a deliberate trade: the
alternative is one red gate that hides the next regression, or a green gate that hides these.

### 4.2 Defects found by Step 4

| id | Defect | Class |
|---|---|---|
| **D14** | The 8 `/excel-functions*` pages are sitemapped, canonical and indexable but reachable by no click path — inbound links come only from each other. Discovery depends entirely on crawlers already knowing. | Runtime / SEO |
| **D15** | The static build links two destinations it does not ship: `/pricing`'s "Create an account" → `/signup?next=/pricing`, and `/privacy` + `/terms`' "account page" → `/account`. Both 404. | Runtime / invariant 3 |
| **D16** | Unknown dynamic slugs answer **200** with an untitled, h1-less error shell instead of 404 (`/learn/excel/nope`, `/learn/projects/nope`, `/learn/groups/nope`). A crawler indexes them; a reader without JS sees a blank page. | Runtime / SEO |


## Step 5 — Triage

### 5.1 The rule, as amended by the owner

`phase-10-analytics-launch.md` defined launch as "phases 0–8, 9A and 10", 9B excluded. On 2026-10-31
the owner amended that definition in this review's conversation. The amendment is the triage rule:

- **In launch:** phases 0–7, 9A, 10.
- **Out of launch:** phase 8, the SQL track. Not slipping, not blocked — "I do not need that sql part on
  launch". Its 8 rows leave the ledger as out of scope rather than as failures.
- **Deleted from the product plan:** 9B, referrals and the organizational portal, entirely. "I do not
  need organizational access like universities and so on, that's bullshit." Deleted, not deferred: a
  deferral implies it comes back.
- **In launch, configured:** accounts and payments, live (`STRIPE_*` set, `PAYWALL=on`). The gate must
  therefore be exercised with accounts on, which no run has ever done.
- **Both builds are the product.** The static build is not a fallback, so a capability that works only
  on the Next build is a defect, not a caveat.
- **Build, don't defer.** Anything missing that launch needs gets built. Deferral is reserved for work
  whose blocker is outside the repo — an external vendor, a live domain, a load profile that does not
  exist yet — and each deferral carries the four fields §6 of the plan requires.
- **Analytics: no vendor at launch.** The owner skipped that question; the default is recorded here as
  a decision rather than left as a gap, and it is the one triage call in this section the owner did not
  make explicitly.

Amending the rule first is what makes the rest of this section short. Eight Absent rows (phase 8) and
five phase-9 rows (9B) were never going to ship, and scoring them as failures is what made the ledger
look worse than the product is.

### 5.2 Corrections to the Step 2 ledger

Step 3's runtime evidence and Step 6's reading of the phase docs move three verdicts and add three
defects. Corrections, not re-scoring to taste:

| Row | Was | Now | Why |
| --- | --- | --- | --- |
| p3-185 | Built, unproven | **Proven** | The criterion's analogue in a site with no progress fetch is a browser that denies `localStorage`, and `e2e/dashboard.spec.js:175` drives exactly that, asserting the printed note at line 185. The Step 2 verdict checked for a failing *fetch* that the architecture does not have. |
| p9-284 | Built, unproven | **Proven** | Step 3 printed the certificate under A4 and under Letter and asserted one page in both: `screenshots/2026-10-31/next/12-print-a4.png`, `12-print-letter.png`, plus `tests/client.test.js:330`. |
| p10-137 | Absent | **Proven, criterion rewritten** | "All 201 legacy HTML routes return a single 301" describes an architecture this site does not have and should not: the legacy pages are *served*, not redirected. The outcome the criterion exists for — every legacy address resolves to exactly one live page — is proven by `e2e/routes.spec.js:25,31` plus the static crawl. The 301 count was wrong (D8), not the capability. |

The corrected counts: **78 Proven, 29 Built-unproven, 25 Absent, 1 Obsolete** of 133.

New defects found while triaging:

| id | Defect | Class |
| --- | --- | --- |
| **D17** | Every canonical falls back to `http://localhost:4173` and **no gate asserts the production origin** (`legacy/src/site/config.mjs:7`; `README.md:65` documents `SITE_URL`; no CI job sets it). A deploy that forgets the variable ships canonicals pointing at a laptop. | invariant 6 |
| **D18** | The legal pages are checked for *sections* (`tests/legal.test.js:42`) but not for banned copy or typography, and chrome strings only by `tests/messages.test.js`. Invariant 7 says "over chrome **and** lessons **and** legal". | invariant 7 |
| **D19** | The phase-3 doc says a script prices the dashboard at 21.4 kB against a 40 kB budget and "fails the build if a change spends it". `scripts/bundle-measure.mjs` measures and is wired to nothing: no npm script, no CI step, no threshold. The citation is false. | docs / gate |

### 5.3 Build — 32 rows, in 14 work items (plus B15, which guards the ledger)

Grouped by the change that closes the row, because one change closes many rows: accounts-before-launch
closes 18 of the 32 at once.

| # | Work item | Rows closed | What it takes |
| --- | --- | --- | --- |
| B1 | **Accounts and payments exercised in a gate** — the single highest-leverage item; also closes invariant 11 / D6 / D7 | p4-289, p4-290, p4-294, p4-298, p4-304, p4-307, p4-312, p4-320, p4-322, p3-172, p5-69, p5-70, p5-71, p5-73, p5-74, p6-81, p6-82, p6-85 | A `db` CI job (`supabase/setup-cli` → `supabase start` → `npm run db:check`, `needs: check`) **and** a Playwright project that boots the Next build with `NEXT_PUBLIC_SUPABASE_*`, `SUPABASE_SECRET_KEY`, `PAYWALL=on`, then signs in, buys in test mode, renders the leaderboard, the trend at 0/1/7 days, a revoked certificate, and deletes an account. Eighteen rows cannot be proven any other way, and today every green gate is silent about all of them. |
| B2 | **Budget the bytes in the gate** | p3-180, p0-187, p10-136, p7-70, D19 | Wire `scripts/bundle-measure.mjs` into `npm run check` with the 40 kB lesson-page threshold from phase 0 (so the *build* enforces what the doc claims), emit the per-route table into this report, and add Lighthouse CI on five budgeted routes including three articles and the dashboard. |
| B3 | **Cross-browser proof** | p2-237 | Add `firefox` and `webkit` Playwright projects running `e2e/drill.spec.js` and the chord/sequence spec. Playwright's WebKit is not Safari and Linux is not Windows, so the matrix becomes "three engines, recorded", with the two human cells (Safari/macOS, Edge/Windows) named in the launch checklist instead of ticked. |
| B4 | **Pin the constants that no test holds** | p2-35, D1, D3, D4 | Four small tests: `DEFAULT_SESSION_MINUTES` exercised without injection, `VERIFY_LIMIT.max` against its real ceiling, `LEADERBOARD_TTL` against a clock, and `datasetFor()` against traversal, case and unknown names. |
| B5 | **Print the hostile name** | p6-95 | One fixture: 60 characters plus non-Latin, asserted one page at A4 and Letter with the Step 3 harness. |
| B6 | **Give the function notes a door** | p7-71, D14 | Sibling links between the eight notes and a real inbound path from `/excel-functions` and the lessons that use them; then delete the `ORPHAN_FAMILY` exemption in `e2e/reachability.spec.js` so the test enforces the fix. |
| B7 | **Static build parity** | D11, D13, D15 | Serve `/verify/<id>` from the static build (or redirect it to the app), give the static 404 the chrome the Next build has, and fix the two dead links (`/signup?next=/pricing`, `/account`). Then empty `KNOWN_DEAD` in `e2e-static/static-links.spec.js`. |
| B8 | **No soft 404s** | D16 | Unknown dynamic slugs answer 404 with a titled, h1-bearing page on both builds; the reachability spec then asserts every sitemapped URL 200s and every invented one 404s. |
| B9 | **The origin is not a laptop** | D17 | Fail the build when `SITE_URL` is unset in a production build, and assert the canonical host in `tests/metadata-routes.test.js`. |
| B10 | **Lint the legal pages** | D18 | Run the typography/banned-copy rules over `app/legal/*` and the chrome catalogue in `npm run content:check`. |
| B11 | **Scan for secrets** | p4-325, D5 | A gate step that greps the client bundle for `SUPABASE_SECRET_KEY`, `STRIPE_SECRET_KEY`, `sk_live`, `service_role` and fails on a hit. |
| B12 | **Deploy, back up, monitor, roll back** | p0-183, p10-140, p10-142, p10-143, p10-144 | Owner-gated: pick the host, then a deploy job with the post-deploy smoke `/api/health` SHA + three deep URLs per build; a restore drill against a scratch Supabase project with row counts; an error sink with a synthetic error; a rollback rehearsal (serve `legacy/dist`, time it) — the last one is provable locally today and should not wait for a host; and this review's checklist, signed. |
| B13 | **One learner, two identities** | D10, D12 | Merge anonymous progress into the account at signup (today work done signed-out vanishes: dashboard `0/88` after signup, self-healing only on the next graded drill), and resume an abandoned drill at the screen it stopped on. Both are launch defects the moment accounts go live. |
| B14 | **Drop the last institutional words** | — | No marketing copy sells organizations, universities, cohorts or referrals — the only hits are schema.org `Organization` (correct publisher markup), a loose "cohort" in `lib/retention/challenge.js` meaning *learners*, and a comment at `app/api/stripe/portal/route.js:53` about an "institutional seat". Copy that implies a deleted feature is a claim too; the comment goes. |
| B15 | **Re-derive the ledger, do not assert it** — closes no row, guards all 133 | — | The `npm run review` gate the plan's Step 7 asks for: fails when the db specs are missing from the run, when a Proven row has no witness, when a sitemap URL or internal link 404s in either build, when copy/typography lint fails (legal pages included), or when the canonical origin is not production. Specified in Step 7.2. |

### 5.4 Defer — 6 rows, each with its reason

| Row | What is missing | Who is affected | Workaround | Trigger to build |
| --- | --- | --- | --- | --- |
| p5-75 | No load harness, so "p95 < 300 ms at 10k users" is unmeasured | Nobody at launch volume; the queries are indexed and the DB suite runs them | None needed below ~1 000 daily users | First month over 1 000 DAU, or any leaderboard p95 over 300 ms in the field |
| p6-94 | The LinkedIn add-licence URL is asserted field by field but was never opened in LinkedIn's UI | Learners who use the button; they land on a prefilled form either way | Fields checked against LinkedIn's documented parameter names | LinkedIn changes its share/add endpoints, or the first report of a blank field |
| p7-73 | No Rich Results run recorded; the JSON-LD is parsed and shape-checked in `tests/build.test.js:309` | Search appearance only | Structural parse plus `e2e/article.spec.js:38` reading it live | One manual Rich Results run on three notes, performed as a launch-checklist line, not as a gate |
| p10-134 | No analytics sink, so "every event fires once" cannot be observed | Nobody: no vendor at launch (5.1) | Events already carry `(session_id, event, ts)` in the payload | A vendor is chosen; the dedupe key ships with the sink |
| p10-135 | No funnel, so "reconciles with Stripe within 2%" has nothing to reconcile | Nobody at launch | Stripe's own dashboard is the revenue truth | Same as p10-134 |
| p10-139 | Search Console submission is unrecorded | Nobody; the sitemap equality is proven by `tests/metadata-routes.test.js:31` | Submit after the domain exists | First production deploy, as a launch-checklist line |

### 5.5 Remove the claim — 9 rows

| Row | Claim | Why it goes |
| --- | --- | --- |
| p8-66 … p8-73 | The 8 SQL-track criteria | Owner: not in this launch. The phase doc keeps its plan and is stamped out of scope; the rows leave the launch ledger. |
| p9-291 | Owner invites 3, 2 accept, seats/table/CSV agree | Owner: no organizational access. |
| p9-292 | 4th invite over 3 seats fails cleanly | Same. |
| p9-293 | Removing a member frees a seat and revokes | Same. |
| p9-295 | Non-owner cannot reach `/admin` | Same; there is no `/admin` and there will not be one. |
| p9-296 | Referral click → signup → payment = one conversion, one credit | Owner: referrals not wanted. |
| p9-287 | No hard-coded user-facing string outside a catalogue | There is no second locale and no catalogue, so the criterion has no subject. Its purpose — copy that does not drift — is carried by `tests/copy.test.js`, `tests/messages.test.js` and `npm run content:check` (B10 extends the last one to legal). |
| p1-206 | Cohorts of ten through a human review pass | The "cohort" was 9B's institutional portal. Content correctness is carried by 1 946 fixture replays and 88 lessons with 6+6 fixtures; the owner's content spot-check moves to the launch checklist (B12) where a signature can hold it. |
| p1-1014 | A second person can author a lesson unaided | There is no second person; the claim cannot be tested by a single-author repo, and `docs/content-authoring.md` plus the new-lesson fixture path (`tests/content-lint.test.js:687`) prove the mechanics it was meant to prove. |
| p0-180 | "all 27 pages" | Obsolete number, covered by p0-184 (120 prerendered, 144 HTML, asserted by `tests/build.test.js:56`). |

### 5.6 Defects, triaged

`Build` means it is in the launch backlog above; nothing here is deferred silently.

| Defect | Decision | Notes |
| --- | --- | --- |
| D1, D3, D4 | Build (B4) | Three unpinned constants and one untested path resolver. |
| D2 | Build (B4) | `DEFAULT_SESSION_MINUTES` folded into B4 with D1. |
| D5 | Build (B11) | Secret scan. |
| D6, D7 | Build (B1) | The DB suite and the accounts flow both enter the gate. |
| D8 | Resolved | Criterion rewritten in p10-137 (§5.2). |
| D9 | Fixed by Step 6 | The stale counts are rewritten in the phase docs. |
| D10 | Build (B13) | Launch defect once accounts are live. |
| D11, D13, D15 | Build (B7) | Static parity. |
| D12 | Build (B13) | Resume where the learner stopped. |
| D14 | Build (B6) | Notes get a door; the exemption goes. |
| D16 | Build (B8) | Soft 404s. |
| D17, D18, D19 | Build (B9, B10, B2) | Origin, legal lint, false budget citation. |

### 5.7 The ledger after triage

| | Rows |
| --- | --- |
| Proven | 78 |
| Build | 32 |
| Defer, with a reason | 6 |
| Claim removed | 9 |
| Out of launch (phase 8) | 8 |
| Total | 133 |

No row is left grey. Every Build row names the work item that closes it, every Defer row carries the
four fields the plan demands, and every removed claim is gone from its phase doc in Step 6 — including
the two phase-4 clauses that referenced features that never existed (`referral_code`) or that no longer
will (`institutional seat`).

## Step 6 — Phase docs rewritten as evidence tables

Every acceptance checklist in `docs/plans/parity/phase-*.md` is now a table with an ID, the criterion,
a verdict, a witness with a path and line, the state exercised, and the Step 5 decision. The tables are
generated from the ledger in this report rather than retyped, so a row cannot say one thing here and
another in its phase doc. No row is left grey: every row is Proven, Build (with its work item), Defer
(with its reason), removed, or out of launch.

| Doc | Rows | What changed |
| --- | --- | --- |
| `phase-00-port-shell.md` | 20 | Checklist → table; `p0-183` Build B12, `p0-187` Build B2; `p0-180` deleted as obsolete, with `tests/build.test.js:56` carrying "120 prerendered / 144 HTML" instead of the stale 27. |
| `phase-01-curriculum-content-factory.md` | 16 | Checklist → table; `p1-206` (cohorts of ten) and `p1-1014` (second author) removed as claims with no testable subject, and the reason recorded in the row. |
| `phase-02-exercise-engine.md` | 20 | Checklist → table; `p2-35` Build B4 (the 60-minute default is now a test, not a comment), `p2-237` Build B3 with the honest scope: three engines automated, two human cells named. |
| `phase-03-dashboard-progression.md` | 16 | Checklist → table; **p3-185 corrected to Proven** (`e2e/dashboard.spec.js:175`), `p3-172` Build B1, `p3-180` Build B2 — the doc's claim that a build gate enforces the byte budget was false (D19) and is now work. |
| `phase-04-accounts-entitlements.md` | 10 | Checklist → table; nine Build B1 rows, `p4-325` Build B11; `p4-312`'s criterion no longer mentions the referral code that was never written and never will be. |
| `phase-05-retention.md` | 8 | Checklist → table; five Build B1, `p5-75` Deferred with its reason. |
| `phase-06-credential-projects.md` | 10 | Checklist → table; `p6-81/82/85` Build B1, `p6-95` Build B5, `p6-94` Deferred (LinkedIn's UI is not automatable). |
| `phase-07-seo-content-engine.md` | 7 | Checklist → table; `p7-70` Build B2, `p7-71` Build B6 (which is also how D14 gets closed), `p7-73` Deferred to a manual launch-checklist line. |
| `phase-08-sql-track.md` | 8 | Acceptance section retitled **out of launch**: eight rows, one decision, no failures. Doc kept as the post-launch plan. |
| `phase-09-b2b-referrals-polish.md` | 9 | Split into 9A (four rows: three Proven, one removed) and **9B — removed** (five rows, all deleted from the product). |
| `phase-10-analytics-launch.md` | 9 | Checklist → table plus **the amended "Definition of launch"**; `p10-137` rewritten to the outcome that is true (one live destination per address, served or 301) and Proven; the Test plan's "crawl all 201 legacy routes, assert 301" row corrected to match. |
| `00-overview.md` | — | §10 items 2, 4, 7 and 8 amended or deleted with dates, and "Launch vs parity" now reads phases 0–7, 9A, 10, deferring to phase 10 for the authoritative text. |

The point of Step 6 is that the next reader cannot get a green answer out of a stale tick. Where a
claim survives, the table says which line fails if the capability goes away; where it does not, the row
says what happens instead — a build item, a deferral with a trigger, or a deletion with a reason.

## Step 7 — The gate run

The plan asks for a review command that re-derives the ledger. That command does not exist yet (B15,
below); what was run is the three gates by hand, on the amended launch scope, with the checkout in the
state that ships.

| Command | Result | Detail |
| --- | --- | --- |
| `npm run check` | **green**, exit 0 | Unit tests, content/typography lint, `next build` (120 prerendered pages), page parity (88 lessons, index, dashboard, pricing, 16 groups — 4869 checks), legacy `verify.mjs`. |
| `npx playwright test` | **green**, 158 passed in 36.0 s | Both projects: `chromium` against `next start` on 4174 (144 specs) and `static` against `legacy/dist` on 4175 (14 specs). |
| `npm run db:check` | **green**, 223 assertions in 23.5 s | `supabase db reset` then 12 specs: RLS, auth, progress, migrations, profile, legal, institution, stripe, retention, leaderboard, challenge, certificate. |

Run with no `.env.local`, so the unconfigured build is what both suites exercised — 14 specs assert
that state, and they would not be able to while local keys were present. No stray server was reused:
`reuseExistingServer` is false for the static project and opt-in for the Next one, and the two servers
left over from the Step 3 walk were killed first, so both suites served the build produced by
`npm run check`.

### 7.1 What these three gates do not prove

- **The database layer is green here and unguarded in CI.** *(Superseded by §8: the `db` job now exists.)* `npm run db:check` needs `supabase start`
  and Docker, and no job in `.github/workflows/ci.yml` runs it (invariant 11, defect D6). The 223
  assertions pass on this machine today; nothing makes them pass on the next push. B1 is the fix.
- **The 32 Build rows are still gaps.** Green gates mean the site is not broken; they do not mean the
  launch scope is complete. Nine of the fourteen work items (B1, B2, B4, B5, B6, B7, B8, B9, B10, B11,
  B12, B13, B14) change code the gates already cover, so each will move a witness line, not just add
  coverage.
- **The post-deploy smoke has not run.** `/api/health` SHA, three deep URLs per build, a graded drill
  and print preview are deploy-time checks, and there is no deploy: `p0-183` and `p10-140/142` are
  owner-gated, and the canonical origin still falls back to `http://localhost:4173` (D17).
- **`npm run check` cannot fail on the copy it claims to lint for legal pages** (D18) and cannot fail on
  the byte budget the phase-3 doc says it enforces (D19). Both are cited as enforcement in phase docs
  and neither is wired.

### 7.2 B15 — the review command the plan asks for

Not built in this pass *(it now exists as `scripts/review.mjs`; see §8)*: it is new code, not documentation, and the ledger had to be closed first. It
should be one script (proposed `npm run review`) that fails when

1. any of `tests/db/` is not part of the run, or is and fails (closes the CI half of D6),
2. a row marked Proven has no witness that a run fails without — checked against the table in the dated
   report, so the ledger cannot rot,
3. a sitemap URL or an internal link 404s in either build,
4. a content file fails the copy or typography lint, including the legal pages (D18),
5. the production origin is not the one the canonicals emit (D17).

It writes the dated report. Until it exists, the ledger is re-derived by hand, which is exactly the
failure mode this review was commissioned to end.

---

## 8. What landed after this review — the waves

Steps 1–7 above are the census as measured *before* any fix, and their numbers are left exactly as
they were taken; this section is what changed afterwards, and supersedes §7's gate run wherever the
two disagree. The owner's ruling that scoped the work: phases 0–7, 9A and 10 ship; the SQL track
(phase 8) and the organizational surface (9B: referrals, cohorts, institution seats) do not.

### 8.0 The four wave-0 probes

Before any work item was started, four probes were run to turn the open questions in §7 into
measurements. Each is listed with the question it answered and where its answer went.

| Probe | Question | Measured | Fed into |
| --- | --- | --- | --- |
| P1 | Do unknown dynamic slugs 404, or answer 200 with an empty page? | They answered **200**: an invented `/excel-functions/<slug>` and an invented group slug both rendered the route shell. A 200 for a page that does not exist is a soft 404, and it makes "reachable" unverifiable by status code alone. | B8 |
| P2 | Does the static build carry the chrome the Next build does? | It shipped **no `404.html`**, so the static host answered with its own bare page; `/verify/<id>` had no static counterpart. | B7 |
| P3 | Is every link in the shipped static HTML resolvable? | **120 HTML files**, **133 distinct `href`/`src` targets**: 2 dead, both already in `KNOWN_DEAD` (`/signup?next=/pricing`, `/account`), and `/certificate` shipped with no inbound link at all. | B7 |
| P4 | Can the accounts surfaces authenticate against the local Supabase stack from the browser? | Yes — a signup through `/login` on the local stack returns a session, so an accounts browser suite is possible without mocks; the suite then caught the real defect, that the accounts surfaces were being baked out of the build. | B1 |

The point of P1 and P2 is that both defects were invisible to the gates that existed at the time: a
soft 404 passes every "does it render" test, and a missing static `404.html` is not a broken link.

### 8.1 The 15 work items

| # | What shipped | Witness |
| --- | --- | --- |
| B1 | A `db` CI job running `npm run db:check`, and an `accounts` Playwright project (port 4176, `PW_ACCOUNTS=1`) that signs up, buys in test mode, reads the leaderboard and the trend, sees a revoked certificate and deletes an account. Fixed the underlying "accounts baked out of the build" defect with `lib/auth/request.js` + `await connection()`. | `gate:accounts`; `tests/db/*.spec.js` |
| B2 | The byte budget became a gate step, with Lighthouse CI on the budgeted routes. | `gate:budget`; `lighthouserc.json` |
| B3 | `firefox` and `webkit` projects over the drill and keyboard specs; `tabKey()` uses `Alt+Tab` on WebKit. Two human cells (Safari/macOS, Edge/Windows) are named in the launch checklist rather than ticked. | `gate:browser` |
| B4 | Pinned constants: session clock, `VERIFY_LIMIT`, `LEADERBOARD_TTL`, `datasetFor()` traversal. Four mutants, all red. | `tests/pinned-constants.test.js` |
| B5 | A 60-character non-Latin name printed on A4 and Letter, on both `/certificate` and `/verify/<id>`, with a real `page.pdf()`. | `e2e-accounts/certificate.spec.js` |
| B6 | Function notes got doors: sibling links, an inbound path from `/excel-functions` and the lessons that use them, and the `ORPHAN_FAMILY` exemption deleted. | `tests/articles.test.js` |
| B7 | Static parity: absolute-or-omitted account links (`config.appUrl`), a real `legacy/dist/404.html` the server answers with, `KNOWN_DEAD` emptied. | `tests/static-parity.test.js`; `e2e-static/static-404.spec.js` |
| B8 | No soft 404s: the proxy guard, `lib/not-found.js`, and an unknown lesson answering 404 with an `h1`. | `tests/progress-record.test.js`; `e2e/reachability.spec.js` |
| B9 | A production build refuses the localhost fallback for `SITE_URL`. | `gate:origin` |
| B10 | The legal pages go through the copy and typography lint. | `gate:content` |
| B11 | The client bundle is scanned for `sk_live`, `service_role` and friends. | `gate:secrets` |
| B12 | A post-deploy smoke (`npm run smoke`), a restore rehearsal with row counts, a timed rollback rehearsal, and the four ops documents. | `tests/smoke.test.js`; `artifact:docs/ops/deploy.md` |
| B13 | Anonymous progress merges into the account at signup; an abandoned drill resumes at its screen. | `packages/progress/index.js`; `tests/progress-record.test.js` |
| B14 | The last copy that implied institutions is gone. | `tests/articles.test.js` |
| B15 | `npm run review` re-derives this ledger, re-runs the gates, and fails when a Proven row loses its witness, when a db spec sits outside `db:check`, or when a link or origin is wrong. | `gate:` — this file's annex |

### 8.2 Service and operations

- **Deploy** — `docs/ops/deploy.md`: two deployables, the env matrix, the static host's 404 and
  extension-less URL requirements, the order of a release, and the smoke command.
- **Backup** — `docs/ops/backup.md`: dump, restore into a fresh project, and the rehearsal transcript
  (schema dump, `--no-seed` reset, data restore, per-table counts identical, 50 ms).
- **Rollback** — `docs/ops/rollback.md`: four undos in rising cost, and the rehearsal — a previous
  static snapshot served and smoked in ≈2 s.
- **Launch checklist** — `docs/ops/launch-checklist.md`: the pre-release lines, seven human checks
  named rather than ticked (Safari/macOS, Edge/Windows, Rich Results, LinkedIn, Search Console, a
  real keyboard, a real print dialogue), the sign-offs, and what is deliberately not shipping.

### 8.3 The numbers now

| Gate | Result |
| --- | --- |
| `npm test` | **1800 tests, 1800 pass, 0 fail** |
| `npx playwright test` | **194 passed** — chromium, static, firefox, webkit |
| `npm run db:check` | **12 specs green** (and now a CI job, so it is no longer the unguarded layer) |
| `npm run e2e:accounts` | **26 passed** |
| `npm run smoke` (static dist) | **12 passed, 0 failed** |
| `npm run smoke` (`next start`, `--sha`) | **14 passed, 0 failed** |
| `node legacy/src/verify.mjs` | **4877 checks** on the shipped origin, 88 lessons, 16 groups |
| `npm run review` | all 11 gates green, every Proven row witnessed |

Counts that changed since Step 1, because the waves added pages and specs: the static build is **121
HTML** (120 pages plus `404.html`), `.next` still carries 144 HTML with 120 prerendered, and the
browser suite grew from 158 to 194 specs.

### 8.4 What is still not proven, honestly

| Item | Why it is not a gate | Where it is recorded |
| --- | --- | --- |
| A *hosted* preview (p0-183's deploy half) | There is no host: choosing one is the owner's call | The smoke is proven against a real `next start`; `deploy.md` is the runbook |
| Restoring into a *staging project* (p10-140) | Needs a second Supabase project | `backup.md`, rehearsed locally with counts |
| An error sink receiving a synthetic error (p10-142) | No vendor is added at launch by ruling | `app/error.js` and stderr are the sink until one is chosen |
| Signing the checklist (p10-144) | A signature is a person's act | `docs/ops/launch-checklist.md` |
| Safari/macOS, Edge/Windows, Rich Results, LinkedIn, Search Console, real keyboard, real printer | Machines in CI are Linux, and the last four need external accounts | The seven named cells in the launch checklist |

None of these is a defect hidden behind a green gate; each is an act the owner performs, on a page
that says so.
