# Deploying

Two deployables, one content source. Both are built from this checkout and both are gated by the
same evidence, but they have different hosts and different jobs:

| Deployable | Built by | Artifact | Runs |
|---|---|---|---|
| The app | `npm run next:build` | `.next` | `next start` (Node) |
| The static edition | `npm run build` | `legacy/dist` | any file host |

`npm run next:build` runs the static build first, because the Next routes render from the same
`legacy/src/site/*.mjs` renderers and would otherwise ship yesterday's copy.

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
   npm run smoke -- https://www.example --sha "$(git rev-parse --short HEAD)"
   npm run smoke -- https://static.example --sha "$(git rev-parse --short HEAD)"
   ```
   The static edition has no `/api/health`, so the SHA check is skipped there with the reason
   printed — that is the only check it may skip.

## What the smoke proves, and what it cannot

`scripts/smoke.mjs` follows the origin's own links: it reads the drill hub, takes the first lesson
address off it, grades that page's embedded payload with the shipped grader using the formula the
page's own hint spells out, and refuses a wrong answer. It checks every same-origin stylesheet,
script and image those pages name, and that `/certificate` answers (one of three legitimate shapes:
a sheet, a gate, or the accounts-off notice). It fails loudly on an unknown address that is not a
404 with an `h1`.

It cannot sign in, so the signed-in half of the site is proven by `npm run e2e:accounts` against a
release candidate, not against production.

## When something is wrong

- **Front page fine, a lesson 404s** — the static host is not mapping extension-less URLs; check its
  rewrite table before re-uploading.
- **Pages render unstyled** — HTML went up without `assets/`; the smoke names the missing files.
- **`/api/health` reports the old SHA** — the new artifact was not deployed, or the SHA was baked at
  build time from a stale checkout (it is prerendered on purpose).
- **Lessons suddenly gated** — `PAYWALL` is on and the entitlement read is failing; unset the flag to
  reopen lessons, which is the break-glass move, then read the logs for the Supabase error.
- **A release must be undone** — `rollback.md`.
