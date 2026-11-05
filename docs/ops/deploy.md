# Deploying

Two deployables, one content source. Both are built from this checkout and both are gated by the
same evidence, but they have different hosts and different jobs:

| Deployable | Built by | Artifact | Runs |
|---|---|---|---|
| The app | `npm run next:build` | `.next` | `next start` (Node) |
| The static edition | `npm run build` | `legacy/dist` | any file host |

`npm run next:build` runs the static build first, because the Next routes render from the same
`legacy/src/site/*.mjs` renderers and would otherwise ship yesterday's copy.

**The app is the product.** The static edition is its SEO, no-JS and print mirror: it carries the
exercises, the notes, the hubs, `/pricing`, `/search`, the legal pages and the sitemaps, and every page on it
that needs an account, a certificate, checkout or progress links out to the app. The rule that follows
from that, and the one to hold when adding a surface: **a page that needs the database is built once, in
the app.** A second copy in the static build is a parser, a second set of pins and a place for the two
editions to disagree about the offer, which is exactly what happened to `/pricing` before the price
lived in one module.

| Surface | App | Static edition |
|---|---|---|
| Exercises, notes, hubs, `/about`, `/search`, `/pricing`, legal, sitemaps, `robots.txt` | served | served (the same renderers) |
| Sign-in, sign-up, reset, `/account`, certificates, `/leaderboard`, `/daily`, `/flashcards`, checkout, portal | served | linked to the app when `SITE_APP_URL` is set |
| Progress, entitlement, feedback rows | database | none: the page says so |

## Hosting the two editions

The plan of record is two projects on one platform: the app built with `npm run next:build` and served
on Node, the static edition publishing `legacy/dist` to a subdomain, both answering extension-less URLs
and a real 404. Two things that were assumptions about that shape until they were measured on a local
build of `962b498`:

- **The content ships with the app.** Every route's trace manifest under `.next/server/**/*.nft.json`
  names the files it reads from `legacy/content/` — 119 of the 120 files there, the one miss being a
  `.DS_Store`. That manifest is the list a Serverless host uploads, so the function that renders a
  lesson carries the lesson, and no `outputFileTracingIncludes` is needed. The check to repeat after a
  change to how content is loaded: `npm run next:build`, then
  `grep -o legacy/content '.next/server/app/learn/excel/[lesson]/page.js.nft.json' | wc -l` — it
  answers 119 today, and a zero means the tracer lost the directory: the lessons will 404 in
  production while passing locally.
- **`proxy.js` runs on Node, not the edge.** Next 16 defaults Proxy to the Node runtime and throws if
  the file exports `runtime`. That is what keeps the middleware safe: it imports `lib/site.js`, so its
  trace carries the whole content tree (859 kB — three quarters of an edge function's 1 MB ceiling, and
  no ceiling worth naming on Node).

Each build's `SITE_URL` is its own origin, so the two editions are each self-canonical. Making the
static mirror the canonical copy of a lesson is a code change in the renderers, not a hosting setting;
it is not part of this release.

Both projects point at this repository, so there is one `vercel.json` at the root and both read it. It
carries `cleanUrls` and nothing else — the two deployments differ in *how they are built*, and that
belongs in each project's dashboard settings, not in a file they share. `tests/static-parity.test.js`
fails if a build command or output directory is ever added to it, because that is how the app project
would quietly start publishing `legacy/dist`.

| Setting | App project | Static project |
|---|---|---|
| Root Directory | repo root | repo root |
| Build Command | `npm run next:build` | `npm run build` |
| Output Directory | (Next default) | `legacy/dist` |
| Framework Preset | Next.js | Other |
| Node Version | 24 | 24 |
| `SITE_ENV` | `production` | `production` |
| `SITE_URL` | app origin | static origin |
| 404 document | `app/not-found.js` | `legacy/dist/404.html`, written by the build |

Extension-less URLs come from `cleanUrls` for the static project, and from the Next router for the app.
`legacy/dist/404.html` is what makes a wrong path a 404 with the site's own chrome rather than the
host's plain text; the build writes it, and a missing one is a soft 200 the smoke cannot see.

## What tells you it is down

Two questions a launch has to answer before the first stranger arrives: *is it up*, and *what broke*.
Neither is answered by the site itself, so both need something outside it.

**Uptime — a monitor, not code.** `GET /api/health` answers `{"status":"ok","sha":"<commit>"}`. Point
any monitor at it on a one-minute cadence and alert to an address a person actually reads:

| Target | What a failure means |
|---|---|
| `/api/health` | the app is not answering, or the deploy lost its build |
| `/` | the app answers but the front page throws |
| `/learn/excel/<a lesson>` | the content tree did not travel with the deploy |
| `/pricing` | the paywall payload or the offer failed to render — the revenue page |
| the static origin's `/` | the mirror is down, which is separate from the app being down |

Assert two things, not one: the status code **and** that `sha` equals the release commit. A host that
serves a stale deployment answers 200 happily, and the whole point of the field is to catch that. The
smoke already does this check once, by hand; the monitor does it forever.

**Errors — a sink.** `instrumentation.js` exports Next's `onRequestError`, so every server-side failure
(a render, a route handler, an action, the Proxy) becomes one sanitized JSON line; `app/api/report-error`
does the same for errors the browser's boundary catches, which the server would otherwise never see.
Set `ERROR_SINK_URL` and each record is also POSTed there. Unset is supported: the lines still reach
the host's log viewer, which is a real but short-lived record — exit 137, a bad deploy and a copy of
the log that outlives it are three different problems, and a sink is how the third one stops mattering.

Three properties worth knowing, because they are why this can be switched on without fear:

- **No person in the record.** The same rule as `log-event.js` drops addresses, tokens and identity
  fields. `/privacy` says nothing joins these logs to an account, and this does not change that.
- **It cannot hurt the site.** The forward has a two-second timeout, failures are swallowed, and past
  sixty forwards in ten minutes (per instance) the record is logged but not sent — a render loop must
  not become a denial of service on the sink.
- **It is vendor-neutral.** A Slack webhook, a Better Stack source, or your own function all work,
  because it is a URL and a JSON body rather than an SDK. `sendDefaultPii` and similar vendor settings
  do not exist to get wrong here.

The verification is not "the env var is set": fire one synthetic error (`curl -X POST` the route, or
break a page in a preview) and watch it arrive; then stop the app and confirm the monitor alerts once
and recovers once. Step 7d of `go-live-plan.md` holds the order.

## The environment each one needs

The app refuses to pretend. `lib/auth/config.js` reports accounts as *off* unless the whole pair is
present, and `lib/paywall.js` treats enforcement as off unless there is a database to ask.

| Variable | Where | Meaning when set | Meaning when absent |
|---|---|---|---|
| `SITE_URL` | both | Canonical origin used in canonicals, OG tags, sitemap, `robots.txt` | Falls back to a local origin; **never ship without it** |
| `SITE_ENV` | both | `production` marks the edition as live | Treated as a preview |
| `NEXT_PUBLIC_SITE_URL` | app | Origin for client-side absolute links | Same fallback as above |
| `NEXT_PUBLIC_SUPABASE_URL` | app | Supabase project URL | Accounts off |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | app | Anon key (browser) | Accounts off |
| `SUPABASE_SERVICE_ROLE_KEY` | app (server only) | Progress, daily, certificates, account deletion, stripe webhook | Those routes answer 500 with a named reason in the log; the pages they back stay readable |
| `PAYWALL` | app | `on`/`1`/`true` enforces the lesson gate | Gate off: lessons are open, `/pricing` still sells |
| `STRIPE_SECRET_KEY` | app | Checkout and portal | Checkout answers "not configured" |
| `STRIPE_WEBHOOK_SECRET` | app | Signature check on `/api/stripe/webhook` | Webhook refuses every request |
| `STRIPE_PRICE_MONTHLY` / `_ANNUAL` / `_LIFETIME` | app | Price ids sold on `/pricing` | That plan is not offered |
| `GIT_SHA` (or `VERCEL_GIT_COMMIT_SHA`) | app | Baked into `/api/health` | Health reports `git rev-parse --short HEAD`, else `unknown` |
| `SITE_APP_URL` | static edition | Absolute account/certificate/signup/checkout links pointing at the app | The links are omitted: this build *is* the whole site |
| `RELEASE_SHA` / `SMOKE_ORIGIN` | smoke only | Defaults for `--sha` / the origin argument | — |

Two rules that have bitten this repository:

1. **`PAYWALL=on` is only safe with accounts configured.** Without a signed-in reader there is no
   entitlement to check and no route back from `/pricing`, so the flag is ignored and the lessons
   stay open. Launch order is: database, accounts, then the flag.
2. **An env read that decides what a page says must sit behind `await connection()`.** Next 16's cache
   components otherwise bake the build-time answer into prerendered HTML — that is how accounts once
   shipped "off" while the environment said otherwise (`lib/auth/request.js`).

Never put `SUPABASE_SERVICE_ROLE_KEY` or a Stripe secret in anything that starts with `NEXT_PUBLIC_`.

## The order of a release

1. Apply migrations to the database (`supabase db push` against production). Migrations are
   forward-only; a schema rollback is a restore, not a down-migration — see `rollback.md`.
2. `npm run check` in CI on the release commit. It is the same command as locally: tests, content
   lint, build, byte budget, page-shape check, origin guard, secret scan, and `legacy/src/verify.mjs`.
3. Build both deployables from that commit with `SITE_URL` set.
4. Upload `legacy/dist` to the static host, then deploy `.next`.
   - The static host must serve **extension-less URLs** (`/excel/sum-basics` from
     `excel/sum-basics.html`) and must answer an unknown address with `404.html` **and status 404**.
     A host that returns 200 for everything is the soft-404 defect this build was fixed for;
     `e2e-static/static-404.spec.js` is the proof, and the smoke below re-checks it in place.
5. Run the smoke against both origins with the SHA from step 1:
   ```
   npm run smoke -- https://www.example --sha "$(git rev-parse HEAD)"
   npm run smoke -- https://static.example --sha "$(git rev-parse HEAD)"
   ```
   Pass the **full** sha. The smoke compares it to `/api/health` for equality, and a Serverless host
   bakes the whole 40-character `VERCEL_GIT_COMMIT_SHA` — a seven-character sha from
   `--short` is a different string and fails the check on a perfectly good deploy. `GIT_SHA` wins over
   `VERCEL_GIT_COMMIT_SHA` when both are set, so a host that only has short shas exported should bake
   the short one and be smoked with the short one; what matters is that the same string is compared.
   The static edition has no `/api/health`, so the SHA check is skipped there with the reason
   printed — that is the only check it may skip.

## What the smoke proves, and what it cannot

`scripts/smoke.mjs` follows the origin's own links: it reads the exercise hub, takes the first lesson
address off it, grades that page's embedded payload with the shipped grader using the formula the
page's own hint spells out, and refuses a wrong answer. It checks every same-origin stylesheet,
script and image those pages name, and that `/certificate` answers (one of three legitimate shapes:
a sheet, a gate, or the accounts-off notice). It fails loudly on an unknown address that is not a
404 with an `h1`.

It cannot sign in, so the signed-in half of the site is proven by `npm run e2e:accounts` against a
release candidate, not against production.

## Email, which nobody sees working until it stops

The site sends four kinds of mail, and every one of them is GoTrue's job, not the app's: the sign-up
confirmation, the password reset, the magic link, and the institution invite. Nothing in this repository
can make them arrive, which is why they are a launch checklist item with a person's name on it rather
than a test.

The default stack sends mail from a shared address that has no alignment with your domain, so a
production deployment must set **custom SMTP** in the Supabase project (Authentication → Emails → SMTP):

1. **A sending domain with DKIM.** Let the provider create the keys — Resend, Postmark, SES and Google
   Workspace all do — and publish the `CNAME`/`TXT` records they print. Confirm the provider's dashboard
   says the domain is verified, not merely "pending".
2. **SPF.** One record per domain, `v=spf1 include:<provider> -all`. Two SPF records is the same as none:
   receivers return `permerror` and every reset lands in spam.
3. **DMARC**, at minimum `v=DMARC1; p=none; rua=mailto:<the address in SITE_CONTACT>`, then tighten to
   `quarantine` once a week of aggregate reports is clean. `p=none` is not a policy, it is a request.
4. **`SITE_URL`, `SUPABASE_EMAIL_*` and the templates.** Confirmation and reset links are built from the
   project's Site URL, so a stale one mails a link to `localhost` — the most common way a launch loses
   its first hundred sign-ups. The templates must also carry the address in `SITE_CONTACT` as the
   "didn't ask for this" route.
5. **The sending address must receive replies.** `no-reply@` is a dead end for someone who cannot get
   in; use an address a person reads, and set the same one as `SITE_CONTACT` so the footer, the privacy
   page and the mail all name one destination.

Two things a launch has to say out loud, and both are environment values rather than copy, because a
name written into the source is a name that stays wrong after the site changes hands:

- **`SITE_CONTACT`** is printed in the footer, in the privacy page's deletion request, and on the pricing
  page's "still not sure" line. Unset is valid and prints nothing, but a paid site with no address is a
  site that takes money and cannot be asked a question.
- **`SITE_AUTHOR`** is the byline and the name in the "Who runs it" section of `/about`. Unset omits both.

Two things to prove by hand, because no gate can: a sign-up confirmation and a reset both arrive in a
real inbox at Gmail and Outlook (not just the local Mailpit), and the raw headers show `spf=pass`,
`dkim=pass` and `dmarc=pass` for the sending domain.

## What the log answers

`lib/log-event.js` writes one JSON line per operational event, because `/privacy` promises no analytics
and a launch still has to distinguish "nobody wanted to buy" from "the buy button answered 500 for a
week". The lines are `checkout_started`, `checkout_refused`, `checkout_failed`, `feedback_received` and
`feedback_failed`, with a plan name, an outcome and a count — never an address, an account id or an IP
(`tests/log-event.test.js` enforces the redaction). On Vercel they are in the deployment's function logs;
anywhere else they are wherever `stdout` goes.

Four more lines feed the launch funnel. `content_rendered` is written by `proxy.js` once per request for a
lesson, note, problem page or shortcut family, after the 404 check and after the paywall redirect, and it
skips prefetches and bots. `drill_started`, `drill_completed` and `paywall_shown` arrive from the browser
at `POST /api/events` as `surface`, `slug` and up to two counts, with no cookie and no answer text. The
proxy cannot see a request a CDN answers from cache, so `content_rendered` is a floor, not a census: read
a rate as a lower bound on starters. `node scripts/content-report.mjs` turns these lines into the five
phase-7 numbers, each printed beside its denominator.

What to look at after launch: a `checkout_started` with no matching `checkout_completed` in Stripe, a
`checkout_failed` reason that repeats, or a `checkout_refused` count climbing (someone pressing buy twice,
or a page that hides that they already own it). A durable table was considered and left out: it would
need a retention row and a deletion path in the privacy page for data that is not about a person.

## When something is wrong

- **Front page fine, a lesson 404s** — the static host is not mapping extension-less URLs; check its
  rewrite table before re-uploading.
- **Pages render unstyled** — HTML went up without `assets/`; the smoke names the missing files.
- **`/api/health` reports the old SHA** — the new artifact was not deployed, or the SHA was baked at
  build time from a stale checkout (it is prerendered on purpose).
- **Lessons suddenly gated** — `PAYWALL` is on and the entitlement read is failing; unset the flag to
  reopen lessons, which is the break-glass move, then read the logs for the Supabase error.
- **A release must be undone** — `rollback.md`.

## What the checkout switch drags with it

Setting `STRIPE_SECRET_KEY` turns the buy door on in *both* editions: the pricing page replaces the
"checkout is closed" note with a form post, and every lesson's gate swaps its free-unlock button for the
buy form (`data-offer="buy"`, no `#gate-unlock`, no local trial). Three rules come with it, and they are
not optional:

1. **`PAYWALL=on` whenever checkout is open.** With the checkout on and enforcement off, an entitled
   learner on the Next host can be shown the buy button. `POST /api/stripe/checkout` now refuses a
   second purchase (303 to `/account`, or 409 `already_entitled` for JSON) instead of charging twice,
   but the right door is the one that never offers it.
2. **A key change is a rebuild, not a restart.** Lesson HTML is prerendered with the paywall payload
   baked in, so `STRIPE_SECRET_KEY` set after a build does not reach the static edition until it is
   rebuilt — and neither does a price change.
3. **The webhook secret is the only thing that makes a purchase believed.** With `STRIPE_WEBHOOK_SECRET`
   unset every delivery is refused with 503 and an entitlement never lands, whatever the buyer's card
   did.

## The address a person answers from

`SITE_CONTACT` is printed in the footer of every page ("Write to us"), on the privacy page as the
deletion route, and on the hub as the corrections line. It is a host fact: unset means the footer prints
no `mailto:` at all, which is honest but leaves a complaint with no destination. Set it before launch,
and set the same address on the sending domain the SMTP section describes — an address that cannot
receive a reply is worse than none.

The feedback dialog posts to `POST /api/feedback` when the deployment has a service-role key, and says
so ("a person reads these"). Without one the route answers 503 and the dialog falls back to the local
queue with the copy that names it. `npm run db:check` is the only thing that proves the insert path
end to end, and no gate runs it.
