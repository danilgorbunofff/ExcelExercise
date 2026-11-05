# Go-live plan

What has to happen between this repository and a public site that takes money, in what order, and
how each step is *checked* rather than assumed. `launch-checklist.md` says what must be true;
this says how to get there. `launch-log.md` records what happened.

Scope: product phases 0–7, 9A and 10. Out of scope and staying out: the SQL track (phase 8), 9B
(referrals, cohorts, institution seats), and any analytics vendor — the last is a recorded decision,
not a gap.

Secrets are named, never written. They travel from a password manager into the host's environment
form, and nothing secret appears in this file, in a commit, or in a shell history.

## 0. Corrections to the brief this plan was written from

The brief carried three facts that were stale. All three were measured on 2026-11-05, and two of
them change the work.

| Claim | Measured | Consequence |
| --- | --- | --- |
| "383 files uncommitted" | `git status --porcelain` listed nothing. The tree was clean. | There is no mega-commit to cut. |
| "no PR" | PR #2 (`phase-0-port-shell` → `main`) merged 2026-11-05 11:57Z as `962b498`. CI on it: `check`, `e2e`, `db`, `static`, all success. | The release commit already exists on `main`. Nothing needs opening. |
| "0 ahead / 2 behind `main`" | That reading came from a stale local `origin/main` (last fetched 2026-10-31). After `git fetch`: `HEAD` (`b5c79dd`) is an ancestor of `origin/main`, and `git diff HEAD origin/main` is empty. | The branch is fully merged. The two "behind" commits are the merge commits. A rebase would be a no-op. |

Two further corrections that belong in the plan rather than in a discovery later:

- **`supabase/seed.sql` must never run against production.** Its own header says "Local development
  seed… never pushed to a remote project". It inserts three demo users with `password123`, a demo
  group (a 9B surface) and demo challenge rows. The brief's "schema push, seed" is half a no-op that
  must be actively skipped. `/daily` still works on an empty production database because
  `challenge_ensure()` in migration `0011` creates the day's row on first use.
- **`db` and `accounts` are not unproven.** Both ran green in CI on the merged commit — the `db` job
  runs `npm run db:check` *and* `npm run e2e:accounts`. What is missing locally is the reproduction
  on the release commit.

## Who does what

| Mark | Means |
| --- | --- |
| **Code** | Written in this repository. |
| **Dashboard** | Done in a web console. The exact steps are below; the login is not mine to have. |
| **Human** | A person, on hardware or an account that cannot be reached from a development machine. |

## Progress since this plan was drafted

Recorded here so the steps below can be read as status, not just intent. Everything in this table is
verified by a command in this repository.

| Item | State |
| --- | --- |
| The full-SHA smoke bug (Step 8) | **Fixed** — `deploy.md`, `rollback.md` and `launch-checklist.md` now use `git rev-parse HEAD`; `scripts/smoke.mjs` reports a short-vs-full mismatch as a length mistake instead of a stale build; `tests/smoke.test.js` has a witness for it. |
| `legacy/content` at runtime (Step 3c) | **Measured, no mitigation needed.** 119 of 120 content files appear in `.next/server/**/*.nft.json`; the only miss is `.DS_Store`. |
| `proxy.js` runtime (Step 3c) | **Measured.** Next 16 runs Proxy on Node.js and throws if the file exports `runtime`, so its 859 kB trace is irrelevant to the edge limit. |
| `launch-log.md` (Step 2) | **Scaffolded.** The frames exist; they get filled at launch. |
| The static host's clean-URL config (Step 3b) | **Done.** `vercel.json` sets `cleanUrls` and deliberately nothing else — the file is shared by both projects, so a build command there would apply to the wrong one. `tests/static-parity.test.js` guards that, and `deploy.md` now carries the per-project settings table. |
| The error and uptime sink (Step 7d) | **Code done and proved.** `instrumentation.js` (`onRequestError`), `lib/report-error.js` and `app/api/report-error` turn a server or browser failure into one sanitized record, forwarded to `ERROR_SINK_URL` if set. Proved end to end against a live server and a real listener: 204 to the boundary, record at the sink with the query string stripped. What remains is a monitor and a destination — dashboards, not code. |
| Tests after this work | **2,099 unit tests pass** in 316 suites (was 2,078), including 15 for the error record, the wire and the route, and 3 pinning the engine matrix that H1 leans on. |
| README §Known limits and the command table | **Corrected** to the measured numbers. |
| The local `db` and `accounts` gates (Step 1) | **Green locally, and the full gate is green.** After restarting colima at 6 GiB: `db` 232 tests / 0 failures across 13 specs, `accounts` 30 e2e passed, and `npm run review` with **no skips** — all nine gates, zero `skipped` rows in the annex. The 2 GiB wedge was a machine limit, not a repository one. |
| Step 3d, the canonical topology | **Decided.** Both editions stay self-canonical; no code change. Reasoning written into 3d, including the duplicate-content cost this does not solve by construction and where it gets read. |
| The release commit (Step 2) | **Cut as `d5d353e`** on `phase-0-port-shell`, 19 files, clean tree. CI has **not** run on it — that needs a push, which is the owner's call. |
| H1's automatable half | **Closed on WebKit.** `e2e/certificate.spec.js` now runs in the `webkit` project alongside `drill` and `keyboard`, so all three behaviours H1 names — playable exercise, Tab to the answer field, certificate prints — execute on the engine. 23 passed. The residual is the Safari app and the OS print stack. |
| Everything needing an account, a dashboard or a second person | **Open.** Steps 3–11 below. |

One consequence to carry into Step 2: `d5d353e` is the release candidate, and until CI has run on that
exact SHA, Steps 3–10 cannot cite a green commit. The check is a push and a wait, not a fix.

## Why this order

1. **Gates first.** Everything after this spends money on an artifact that could turn out red.
2. **Host and database before Stripe.** A webhook needs a public URL, and an entitlement needs a
   database to be a fact in.
3. **Email before the live purchase.** Proving the purchase signs up a fresh account, and without
   SMTP that account cannot confirm its address. The same dependency puts Step 4b here too: the daily
   challenge and the leaderboard need a *second* real person on a real database, and a purchase proof
   built on one unproven account is not worth much.
4. **The error sink before the deploy.** The first error needs somewhere to land.
5. **Final environment and both rebuilds last.** `SITE_*`, `PAYWALL` and the Stripe ids are baked
   into prerendered HTML at build time, so a value set after a build means rebuilding both editions.
6. **Human checks where they can run.** H1, H2, H6 and H7 work on a preview URL; H3, H4, H5, H8 and
   H9 need the public domain and real mail.

---

## Step 1 — Reproduce the two unrun gates locally (no credentials)

**What.** Start Docker, run the full suite, then run the review gate with `db` and `accounts` live.

```sh
colima start                      # or Docker Desktop, with at least 4 GB
npm run db:check                  # 13 specs: RLS, auth, progress, stripe, certificates…
npm run e2e:accounts              # 26 specs, PW_ACCOUNTS=1
npm run review                    # with no --no-db --no-accounts
```

**Who.** Human (start the daemon) → Code (run the commands).

**Blocked by.** Nothing, once the VM has the memory. It did not, until 2026-11-05: a 2 GiB VM
overflowed — the container died at exit 137 and then `docker ps` hung, which is how the wedge looks.
`colima stop && colima start --memory 6 --cpu 3` fixed it, and the other stacks on the machine came
back up by themselves with their volumes intact.

**Status: green locally.** After the resize, both halves passed on this tree — `db` **232 tests, 0
fail** across 13 specs, `accounts` **30 e2e passed** — and then `npm run review` with no skips put all
nine gates in the annex as **pass**, zero `skipped` rows. The gate set is complete on this tree; what
it is missing is the commit line underneath it, which is Step 2.

**Verified.** `npm run review` writes `docs/plans/parity/reviews/completeness-<date>-gates.md`; the
`db` and `accounts` rows must read **pass**, not **skipped**. That annex is part of the release, not
noise.

**Note.** `npm run db:check` shells out to whatever `supabase` is on `PATH`, which here is 2.84.2
against CI's 2.122.1. Run it by hand as two commands — `npx --yes supabase@2.122.1 db reset`, then the
`node --test --test-concurrency=1 tests/db/*.spec.js` list from that script — so a CLI difference is
never the explanation for a red gate.

---

## Step 2 — Cut the release (a git mutation — the owner's call)

**What.** The work is already on `main`. Pick the release commit, name it, and start the log.

```sh
git fetch origin && git rev-parse origin/main      # the PR #2 merge, and whatever follows it
git tag -a release/<date> -m "…" <sha>             # only on the owner's go-ahead
```

Then fill in `launch-log.md`: release SHA, both origins, smoke outputs, anything rolled back.

**Who.** Human (approve the tag) → Code (the log).

**Blocked by.** The owner's instruction. This plan does not tag, commit or push.

**Verified.** The tag resolves to a SHA that CI was green on, and `/api/health` on production reports
that same SHA (Step 10).

**Do not** rebase onto `main` or re-merge the branch: the trees are identical, and a rewrite would
invalidate the SHA the smoke compares against.

---

## Step 3 — Hosting and DNS (Vercel, two projects)

The decision taken: the app on the primary domain, the frozen static edition on a subdomain, each a
separate Vercel project built from this repository.

### 3a — The app project

- Build command **`npm run next:build`**, not the default `next build`. `next:build` runs the legacy
  build, copies `legacy/dist/assets` into `public/assets` via `scripts/next-assets.mjs`, then builds.
  The default command ships a site whose `/assets/client/drill.js` and fonts 404.
- Node **24**, matching CI.
- Production domain `www.excelsupreme.com`; the apex 301s to `www`.
- Deployment protection **off** for production. Previews may stay protected.

### 3b — The static project

- Build command **`npm run build`**, output directory **`legacy/dist`** — set in the project's dashboard,
  because both projects read the same `vercel.json` and a build command in it would apply to both.
- **Done in code:** `vercel.json` carries `cleanUrls: true`, so `/excel/sum-basics` serves
  `excel/sum-basics.html`. That is the deploy.md requirement and the defect the build was fixed for.
  `tests/static-parity.test.js` fails if a build command, output directory or framework preset is ever
  added to that file, since that is how the app project would start publishing `legacy/dist`.
- **Still to do in the dashboard:** the settings table in `deploy.md` — root directory, build command,
  output directory, framework preset `Other`, Node 24, and `SITE_URL`/`SITE_ENV` on the static origin.
- `404.html` already exists in the output, and Vercel answers an unknown path with it **and status
  404** — which has to be checked, not assumed. Vercel can be configured to rewrite everything to
  `index.html`, and that soft 404 is the thing this build exists to avoid. Check it on the preview:
  `curl -sS -o /dev/null -w '%{http_code}\n' https://<preview>/no-such-page-xyz` must print `404`, and
  the body must be the site's own error page, not the host's.
- Domain `static.excelsupreme.com`.

### 3c — `legacy/content` and `proxy.js` at runtime (measured, no mitigation needed)

This was flagged as the highest-risk hosting unknown: `lib/site.js` resolves content from
`join(process.cwd(), "legacy/content")`, `proxy.js` imports it, and `next.config.mjs` sets no
`outputFileTracingIncludes`. On a serverless host a path that is not statically analyzable might not
be in the function bundle, and the symptom would be lessons 404ing in production while `next start`
on a laptop is perfect.

**Measured, on a real build:** every content file except `.DS_Store` is listed in the route trace
manifests. The repeatable check:

```sh
grep -o legacy/content '.next/server/app/learn/excel/[lesson]/page.js.nft.json' | wc -l   # 119
```

**`proxy.js` is not an edge function.** Next 16 runs Proxy on Node.js by default and throws if the
file exports `runtime`, so the 859 kB its trace carries is harmless rather than three-quarters of a
1 MB ceiling.

**Residual risk.** Whether Vercel's builder honours those manifests as faithfully as a local build is
unverified. It is discharged cheaply at Step 3's preview and again at Step 10: a lesson page that
renders with its exercise payload proves it. No configuration is planned for it.

### 3d — Canonical topology (decided: each build stays self-canonical)

Both editions emit canonicals from their own `SITE_URL`. Two origins therefore means two URL sets —
`static…/excel/<slug>` and `www…/learn/excel/<slug>` — and the app 301s `/excel/<slug>` to
`/learn/excel/<slug>`.

**Decided:** each build's `SITE_URL` is its own origin; both editions are self-canonical. No code
change.

The reasoning, because the alternative looks tidier than it is. Pointing the app's lesson canonicals at
the static edition would tell a search engine that the authoritative copy of a lesson is the frozen
mirror — the copy that cannot accept a drill answer, hold progress, issue a certificate or take a
purchase. That inverts authority toward the surface with less of the product behind it, and it would
have to be undone the first time the mirror ages past the app. The mirror is a distinct deliverable
(a printable, commit-pinned edition), so it is defensible for it to canonicalise to itself.

The cost is duplicate-content risk between the two, which is the one thing this decision does not
answer by construction. It is read in Search Console after launch (H5) and revisited with coverage
numbers rather than opinion. If it ever needs the other topology, note that `SITE_URL` is baked at
build time, so switching costs a rebuild of both editions — cheap, but not free.

**Who.** Dashboard (Vercel projects, domains, env) + Human (registrar, DNS) + Code (`vercel.json`).

**Blocked by.** A Vercel account and registrar access.

**Verified.** `curl -sI https://static.<host>/excel/sum-basics` answers 200; an invented path answers
**404** with the site's own 404 body; a lesson page renders its exercise payload; the rendered
canonical names the production origin, not `localhost:4173`.

---

## Step 4 — Supabase production project

1. **Dashboard:** create the project in a region near the Vercel deployment. Note the project URL,
   the anon key and the service-role key into the password manager.
2. **Dashboard:** Authentication → URL configuration. Site URL `https://www.excelsupreme.com`; redirect
   allow-list for `/auth/callback` and `/reset/password`.
3. **Code/Human:** apply migrations from the release commit with the pinned CLI, not the local one:

   ```sh
   npx supabase@2.122.1 link --project-ref <ref>
   npx supabase@2.122.1 db push          # 14 migrations, forward-only
   ```

4. **Explicitly skip `supabase/seed.sql`.**
5. **Verify against the real project:** deploy a preview with the Supabase trio set, then sign up,
   sign in, complete a lesson, print a certificate and delete the account. The `accounts` Playwright
   suite drives exactly this shape locally; against production it has to be a throwaway account that
   is then deleted.

**Who.** Dashboard + Human.

**Blocked by.** A Supabase account.

**Verified.** `supabase migration list` shows all 14 applied remotely; the `0003` trigger creates a
`profiles` row on sign-up; `attempts` and `lesson_progress` rows exist after a drill; `/api/health`
answers 200; `npm run smoke` is green.

**Do not** point `npm run db:check` at production — it begins with `supabase db reset`, which is
destructive. It stays a local gate.

---

## Step 4b — Accounts, the daily challenge and progression, proved against production

**Runs after Step 5 and before Step 6.** It is numbered with the database because that is what it
exercises, but a second account cannot confirm its address until SMTP exists, and a purchase proof
built on an unproven account is not worth having.

This step exists because of what the database suite *cannot* reach. `npm run db:check` already holds
149 assertions across the seven specs that own these surfaces — `challenge.spec.js`,
`leaderboard.spec.js`, `retention.spec.js`, `certificate.spec.js`, `auth.spec.js`, `profile.spec.js`,
`progress.spec.js` — including "creates the day once and returns it to every caller", "gives two
different viewers the same numbered list", "ranks by points, settling a tie on the username", and the
whole `touch_streak` matrix checked against `streakAfter`. Those are the rules only a real database
can hold, and they are proven.

What no local suite can prove is that they hold on an **empty production project with real clocks and
two real people**. Production is the one environment that has no day's row, no second viewer and no
yesterday. Each check below names the page or table it reads; run them on the production origins, not
on a preview, because the environment is the thing under test.

1. **The first visitor draws the day.** On an untouched project, open `/daily`: `challenge_ensure()`
   in migration `0011` creates the row on that first call and the page renders five screens. Refresh
   and get the same draw. Sign in as the second throwaway account and get the *identical* draw — the
   identity rule the spec proves, now observed through the app.
2. **A run resumes, then finishes.** Start `/daily/run`, close the tab mid-run, come back on the same
   account: the original clock is kept, not restarted. Finish it, and the points appear on
   `/leaderboard` — from the database, not from a local placeholder.
3. **Two accounts rank correctly.** Play the day as both throwaway accounts with different accuracy,
   then open `/leaderboard` as each: both viewers see the same numbered list, the ranking follows
   accuracy then time, and each viewer's own row sits at the right rank.
4. **A streak survives one real midnight.** Pick a throwaway profile, set its `timezone` to a zone
   whose local time is a few minutes before midnight — the SQL consults `pg_timezone_names` and falls
   back to UTC, so this is the documented lever. Play the daily, wait out the boundary, play the new
   day's daily, and watch 1 become 2. **If no boundary falls inside the session, record the
   `retention.spec.js` proof and mark this check deferred with its reason.** Do not fake the clock;
   a fabricated streak proof is worse than an honest deferral.
5. **The certificate verifies signed out.** Print a certificate, then open `/verify/<id>` in a private
   window: it resolves, names the learner and the group, and an invented id does not resolve. A
   verification page that only works while signed in is worthless at launch, and the e2e suite only
   ever sees it signed in.
6. **Deletion actually cascades.** Set a profile's timezone and username through `/account/profile`
   first — both are the columns a careless policy would leave writable — then delete the account in
   the UI. In the SQL editor, confirm no `auth.users`, `profiles`, `attempts`, `daily_points` or
   `streaks` rows remain for that id, that its `/verify/<id>` stops resolving, and that
   `/account/deleted` thanks the person.

**Who.** Dashboard (SQL editor, two throwaway accounts) + Human; Code only if a check fails.

**Blocked by.** Steps 4 and 5 — the second account cannot confirm its address before SMTP exists.

**Verified.** The six checks above, each named by page or table. A failure here is a launch blocker,
not a first-week follow-up: these are the surfaces a learner meets on their first visit, and a
production database is the only place they have never run.

---

## Step 5 — Transactional email (before the live purchase)

All four mails — confirmation, reset, magic link, invite — are GoTrue's, not the app's.

1. **Human/Dashboard:** create the sending domain at a provider (Resend, Postmark, SES or Google
   Workspace), publish the records it prints, and wait for **verified**, not "pending".
2. **DNS:** one SPF TXT record, `v=spf1 include:<provider> -all`. Two SPF records is `permerror`.
   DKIM records as printed. DMARC `v=DMARC1; p=none; rua=mailto:<SITE_CONTACT>`, tightened in Step 11.
3. **Dashboard:** Supabase → Authentication → Emails → SMTP with the provider credentials. The sender
   must be an address a person reads; it is also `SITE_CONTACT`.
4. **Dashboard:** the templates carry that address as the "I didn't ask for this" route.

**Who.** Human (provider account, DNS) + Dashboard (Supabase SMTP).

**Blocked by.** A provider account and registrar access.

**Verified.** H8 — a real sign-up and a real reset, in Gmail **and** Outlook, with raw headers showing
`spf=pass`, `dkim=pass`, `dmarc=pass`. Mailpit proves nothing about deliverability.

---

## Step 6 — Stripe live mode

1. **Human:** complete live-mode activation (business details, bank account). This is the one thing
   nobody can do on the owner's behalf.
2. **Human/Dashboard:** `STRIPE_SECRET_KEY=sk_live_… npm run stripe:seed`, which prints
   `STRIPE_PRICE_MONTHLY`, `_SEMIANNUAL`, `_ANNUAL` (and `_LIFETIME`). It is idempotent by
   `lookup_key`, so a second run does not create a second product.
3. **Dashboard:** webhook endpoint `https://www.excelsupreme.com/api/stripe/webhook`, subscribed to
   the events the handler consumes; copy the signing secret to `STRIPE_WEBHOOK_SECRET`.
4. **Env:** `PAYWALL=on` only now — after Step 4 and after 1–3. The flag is ignored without accounts,
   and checkout without enforcement shows a buyer the buy button.
5. **Human:** one live purchase with a real card, then refund it.

**Who.** Human + Dashboard.

**Blocked by.** Live-mode activation, and the public URL from Step 3.

**Verified, in this order.** Stripe's dashboard shows the delivery **200**; a `stripe_events` row
exists, because the event id is claimed before any entitlement moves, so a replay is a no-op;
`entitlements` has the row; the buyer's lesson gate is replaced by content and `/account` names the
plan; a second purchase attempt answers 303 to `/account`, or 409 `already_entitled`; the refund
revokes the Stripe-sourced plan and the lesson gates again. Then refund the charge and record it.

**Not optional** (deploy.md): a key or price change is a **rebuild**, not a restart, because the
paywall payload is baked into prerendered lesson HTML; and with `STRIPE_WEBHOOK_SECRET` unset every
delivery is refused 503 and no entitlement ever lands.

---

## Step 7 — Ops: backup, restore, rollback and the error sink

### 7a — Backup schedule

Supabase's daily backups are the floor. Take an independent dump before every migration and before
every launch-week deploy, per `backup.md`. A dump is a secret — it holds password hashes, email
addresses and Stripe customer ids — so store it where the service-role key lives.

### 7b — Restore rehearsal against a real project

The local rehearsal already passes (50 ms, row counts identical). The sign-off needs a **scratch
Supabase project**: push migrations from the release commit, load the data dump, compare row counts
per table including `auth.users`, then delete the scratch project. A `createdb` target is not a
valid substitute — the restore target is a Supabase project.

### 7c — Rollback rehearsal against the real host

Static: swap the served directory or deployment, measured locally at about 2 seconds. App: Vercel
Instant Rollback to the previous deployment. Do it deliberately, with a stopwatch, and record the
time. Never roll back a schema with a down-migration — the migrations are forward-only, so a schema
rollback is a restore.

### 7d — Error and uptime sink (the genuine gap)

**The code half is done.** What was missing was not a vendor, it was a wire:

- `instrumentation.js` exports Next's own `onRequestError`, so a failed render, route handler, action
  or Proxy becomes a record instead of a line only a developer's console ever saw.
- `lib/report-error.js` turns whatever was thrown into a small sanitized record (route, method,
  message, digest, three frames — no address, no token, same rule as `log-event.js`) and, if
  `ERROR_SINK_URL` is set, POSTs it with a two-second timeout and a sixty-per-ten-minutes burst guard.
  Unset is supported: the record still reaches the host's logs.
- `app/api/report-error` is the browser's half — `app/error.js` is a client component and cannot hold
  a sink URL, so it posts the digest and message to a same-origin route that does the rest. It refuses
  an oversized or non-JSON body and rate-limits per address, and always answers 204 to the boundary.
- Covered by `tests/report-error.test.js`: the record's shape, the address being dropped, the wire
  being silent when unset, a failing sink being swallowed, the burst cap, and the route's refusals.

What remains is choosing where the records go and pointing a monitor at the site. Cheapest first:

1. **Uptime monitor** (Better Stack, UptimeRobot, or Vercel's own) on `/api/health` — asserting
   `status: ok` **and** the SHA — plus `/`, one lesson, `/pricing` and the static origin's `/`, at
   one-minute cadence, alerting to an address a person reads. Contract and targets: `deploy.md`,
   "What tells you it is down". No further code.
2. **Set `ERROR_SINK_URL`** to any endpoint that takes a JSON body — a chat webhook is enough to start.
   A log drain is the alternative if you would rather read than be pinged; the records carry the
   events either way.
3. **Sentry, only if stack traces are wanted.** The server hook and the browser route already exist,
   so this is a project, a DSN and an SDK call inside `reportError` — not a re-architecture. Not
   required for launch, and not a reason to delay it.

**Who.** Code is done; what is left is Dashboard (create the monitor and the sink) and Human (an
address that gets read, and the decision on option 3).

**Verified.** Proved end to end on 2026-11-05, locally, against a real `next start` and a throwaway
listener: `POST /api/report-error` with a message, a digest and `path=/learn/excel/vlookup?q=secret`
answered **204**, and the sink received

```json
{"event":"error","at":"…","name":"ClientRenderError","message":"…","digest":"proof123",
 "routeType":"render","method":"GET","path":"/learn/excel/vlookup"}
```

— the query string gone, which is the privacy promise holding in transit rather than in a comment. The
same record appeared on stdout. What is left to verify is the part only a dashboard can: fire the same
synthetic error into the real sink, break a page on a preview and see the server record with its
route, then stop the app and confirm the monitor alerts exactly once and clears exactly once. An
untested sink is the same gap as no sink, with a false sense of coverage.

---

## Step 8 — Final environment, then rebuild both editions

Set these in the Vercel **Production** environment for the relevant project, from the password
manager, then **rebuild both projects**. None of them is a secret in this document.

| Variable | App | Static | Notes |
| --- | --- | --- | --- |
| `SITE_URL` | ✓ | ✓ | Each build's own origin (Step 3d). Not `localhost`. |
| `SITE_ENV` | ✓ | ✓ | `production`. Without it `origin:check` does not bite. |
| `SITE_CONTACT` | ✓ | ✓ | The address that receives and answers mail (H9). |
| `SITE_AUTHOR` | ✓ | ✓ | The name on a receipt; turns on "Who runs it" on `/about`. |
| `SITE_APP_URL` | — | ✓ | Absolute account and checkout links from the mirror to the app. |
| `NEXT_PUBLIC_SITE_URL` | ✓ | — | Client-side absolute links. |
| `NEXT_PUBLIC_SUPABASE_URL` / `_ANON_KEY` | ✓ | — | Accounts on. |
| `SUPABASE_SERVICE_ROLE_KEY` | ✓ | — | Server only. Never `NEXT_PUBLIC_`. |
| `PAYWALL` | ✓ | ✓ | `on`. Read at build time for the static payload. |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_MONTHLY`/`_SEMIANNUAL`/`_ANNUAL` | ✓ | ✓ | Prices are baked into the pricing page and the gate. |
| `GIT_SHA` | optional | — | Leave unset on Vercel; `VERCEL_GIT_COMMIT_SHA` wins. |

**Who.** Dashboard (environment) → Dashboard (rebuild both).

**Blocked by.** Steps 3–6 being done.

**Verified.** `/pricing` shows three buy forms, not "Checkout is not open on this copy of the site
yet."; a lesson's HTML carries the buy gate (`data-offer="buy"`, no `#gate-unlock`); `/about` shows
"Who runs it"; the footer prints a `mailto:`; the canonical host is the production origin; and
`SITE_ENV=production SITE_URL=… npm run origin:check` passes against an artifact built with the same
environment.

**A doc bug fixed on the way here.** `deploy.md` used to say
`npm run smoke -- <origin> --sha "$(git rev-parse --short HEAD)"`, while `/api/health` bakes
`VERCEL_GIT_COMMIT_SHA` — 40 characters on Vercel — and `smoke.mjs` compares with strict equality.
The documented command failed against a perfectly good deploy. The docs now pass the full SHA, and
the smoke distinguishes a length mismatch from a stale build rather than blaming the wrong one:

```
✗ the release is the one that was deployed — served b5c79dd, deploy notes say b5c79dd779c…:
  same commit, different sha length — pass the full sha
```

---

## Step 9 — Human sign-offs H1–H9

Nine cells, not seven — `completeness-2026-10-31.md` §8.2 says "seven", which is stale. Each one
records a date and a name.

| # | Check | Who | Second person? | When |
| --- | --- | --- | --- | --- |
| H1 | Safari on macOS: play an exercise, Tab into the answer field, print the certificate | Human on a real Mac | **Yes**, unless the owner has one — Playwright's WebKit is not Safari | Preview URL, before DNS |
| H2 | Edge on Windows: the same three behaviours | Human on Windows | **Yes**, unless the owner has a Windows machine | Preview URL |
| H3 | Rich Results on three note URLs (`p7-73`) | Human, Google's validator | No — needs only the public URL | After DNS |
| H4 | LinkedIn add-licence prefills institution, title and date (`p6-94`) | Human, own LinkedIn account | No | After DNS |
| H5 | Search Console accepts the sitemap (`p10-139`) | Human, own Google account | No, but only the owner can | After DNS |
| H6 | Keyboard-only pass through the first lesson, including the chord matrix | Human, real keyboard | No | Preview URL |
| H7 | Print to PDF from a real print dialogue, A4 and Letter | Human | No | Preview URL |
| H8 | Sign-up and reset arrive at Gmail **and** Outlook, headers `spf`/`dkim`/`dmarc` pass | Human with two real inboxes | **Yes** — two inboxes, at least one not a work alias | After Step 5 |
| H9 | `SITE_CONTACT` receives mail and answers it | Someone outside the domain sends | **Yes** — the sender must be someone else | After Step 8 |

Then four sign-offs below the table:

- Restore rehearsal against production, row counts compared (Step 7b).
- Rollback rehearsal against the production host, time recorded (Step 7c).
- The five signed deferrals accepted **with their triggers intact** — load harness, LinkedIn UI, Rich
  Results gate, analytics sink and funnel, Search Console. Decisions, not gaps.
- One human end-to-end account pass: sign up, buy, see the entitlement, delete the account.

**Who.** The owner, plus a second person for H1, H2, H8 and H9.

**Verified.** The dated signature is the evidence. Nothing in CI can produce it.

---

## Step 10 — Deploy, smoke both origins, write the log

Order, from deploy.md: migrations → static → app.

```sh
npm run smoke -- https://www.excelsupreme.com    --sha "$(git rev-parse HEAD)"
npm run smoke -- https://static.excelsupreme.com --sha "$(git rev-parse HEAD)"
```

**Who.** Code (commands) + Human (play an exercise and print a certificate on production, signed out).

**Verified.** App origin: every check green **and** the SHA check passes. Static origin: green, with
the SHA check **skipped with its reason printed** — the only check it may skip. Then a person plays an
exercise signed out and prints a certificate on production. The launch log records the SHA, both
origins, both smoke outputs in full, and anything rolled back.

---

## Step 11 — First week after launch

- Move DMARC from `p=none` to `p=quarantine` once a week of aggregate reports is clean.
- `node scripts/content-report.mjs` for the funnel numbers; watch for repeated `checkout_failed`
  reasons, `checkout_refused` climbing (someone pressing buy twice) and `checkout_started` with no
  matching charge in Stripe.
- Read Search Console coverage (H5) and settle the canonical-topology question in 3d from evidence.
- Keep the deferral triggers armed: a load harness at more than 1 000 DAU or leaderboard p95 over
  300 ms; an analytics sink only if a vendor is chosen.

---

## Definition of done

Launch is done when all of this is true, on the record:

1. Both editions serve from the production origins, from the same commit, built with the final
   environment.
2. `npm run check` and `npm run review` are green on the release commit, with `db` and `accounts`
   **run**, not skipped — locally or in CI, and the choice recorded.
3. Canonicals, Open Graph, sitemap and `robots.txt` name the production origin on both builds. No
   artifact says `localhost:4173`.
4. Both smoke runs are green: the app's SHA check passes, the static edition's skips with its reason.
5. A real purchase yields an entitlement that survives a reload and appears on `/account`; a refund
   revokes it; a second purchase is refused. The test charge is refunded and recorded.
6. Sign-up and reset land in Gmail and Outlook with `spf=pass`, `dkim=pass`, `dmarc=pass`.
7. `SITE_CONTACT` prints in the footer, receives mail from outside the domain, and is answered.
8. A backup exists, a restore into a scratch project reproduces the row counts, and the scratch
   project is deleted.
9. A rollback was rehearsed on the real host, with a recorded time.
10. An error and uptime sink received a synthetic error and a deliberate outage, and alerted.
11. H1–H9 each carry a date and a name; H1, H2, H8 and H9 carry a second person.
12. The launch log holds the SHA, both origins, both smoke outputs and every rollback.
13. Accounts, the daily challenge, the leaderboard, a certificate's public verification and an
    account deletion were each exercised on the production origins with two throwaway accounts, and
    both accounts are gone. Any check deferred for want of a midnight boundary says so and names the
    `retention.spec.js` proof standing in for it.

## Checklist items that are stale or already satisfied

| Item | Verdict | Evidence |
| --- | --- | --- |
| "`npm run db:check` green against a freshly reset database" | **Satisfied in CI**; only the local Docker is in the way | PR #2's `db` job, which runs `db:check` |
| "`npm run e2e:accounts` green (`PW_ACCOUNTS=1`)" | **Satisfied in CI**, against a freshly built candidate | The same job, the same run |
| "`npm run check` green on the exact release commit" | **Satisfied** on `962b498`; a new commit needs its own run | `check` job |
| "`npx playwright test` green — all projects, both builds" | **Satisfied** | `e2e` job |
| "`npm run review` green, locally, on the release commit" | **Partly.** Green with `db`/`accounts` skipped; both must actually run once | `completeness-2026-11-05-gates.md` |
| "`SITE_URL` and `SITE_ENV=production` set for both builds" | **True in CI only.** The Vercel environment does not exist yet | `.github/workflows/ci.yml` |
| "`PAYWALL` set only after accounts and billing are confirmed live" | Still correct, still pending | Step 6 |
| "`SITE_CONTACT` / `SITE_AUTHOR` set for both builds" | Still pending | Step 8 |
| "`npm run smoke -- <app> --sha \"$(git rev-parse --short HEAD)\"`" | **Stale command, now corrected** — it failed against a real Vercel SHA | `scripts/smoke.mjs`, `app/api/health/route.js` |
| "seven human checks" (`docs/plans/parity/reviews/completeness-2026-10-31.md` §8.2) | **Stale number.** The table has nine | `launch-checklist.md` |
| "Sixteen lessons", "Verified in Chrome only", "129 assertions" (README) | **Stale, now corrected** — 86 lessons, three engines, and the assertion count replaced by a pass condition | `npm run check`, `content:check` |
| "Seed" as part of the production database step | **Stale.** `supabase/seed.sql` is local-only and must not run | `supabase/seed.sql` header |
| Nothing in the checklist for accounts, the daily challenge, the leaderboard or streaks | **Not a gap at the DB layer** — 149 assertions across seven specs already hold those rules; what is missing is their first run on an empty production project | `tests/db/{challenge,leaderboard,retention,certificate,auth,profile,progress}.spec.js` → Step 4b |

## Deliberately not in this plan

- The SQL track (phase 8) and 9B (referrals, cohorts, institution seats) — owner ruling.
- Any analytics vendor — a recorded decision; events stay observable in the payload and in logs.
- A load harness, a Rich Results *gate*, LinkedIn UI automation — signed deferrals with triggers.
- Rewriting history or rebasing `main` — the trees are identical and the SHA is load-bearing.
