# Excel Supreme

Zero-signup, in-browser Excel formula drills with a deterministic grader. Optional Supabase accounts, Stripe
paywall, streaks/flashcards/daily challenge, certificates. Deployed on Vercel. Full docs: `README.md`,
`PRODUCT.md`, `DESIGN.md`, `docs/`.

**State:** mid-port. `legacy/` is the frozen static site (still the deployable artifact); `app/` is the Next.js
shell being built beside it on `phase-*` branches (plan: `docs/plans/parity/00-overview.md`).

## Stack
Next.js 16 (App Router, `cacheComponents`, `proxy.js` not middleware), React 19, plain JavaScript (ESM),
Supabase (`@supabase/ssr`), Stripe via fetch (no SDK), npm workspaces in `packages/`, `node --test`, Playwright.
**Next 16 differs from older versions: read `node_modules/next/dist/docs/` before writing Next code.**
Next is held at 16.4.3 (16.4.5 drops `content-length` on `/datasets/*`; see `e2e/projects.spec.js`).

## Commands
- `npm run next:hot` dev server (port 3000, run `npm run build` once first); `npm run next:dev` builds first
- `npm run dev` serves the legacy static site on 4173
- `npm test` unit tests (~2,100, ~10s); `npm run golden:update` only for an intended grader change
- `npm run lint` ESLint (app, lib, proxy, instrumentation); `npm run typecheck` (opt-in via `// @ts-check`);
  `npm run typecheck:all` shows the existing JSDoc error baseline (~160, not enforced)
- `npm run test:e2e` Playwright against a built app (`npm run next:build` first, or use `npm run e2e`);
  `--project=chromium` for a fast run
- `npm run content:copy` copy gate (banned phrases, structural AI-tell patterns, readability); rules in
  `packages/content-lint/data/copy-rules.json`. `npm run vale` runs Vale (`brew install vale`) on a generated
  copy of the same rules; after editing the rules run `npm run vale:sync`. Findings are warnings, never verdicts
- `npm run check` the full gate: tests, content gates, next build, budget, origin, secret scan, crawl
- `npm run db:start` / `db:check` local Supabase (needs Docker) and the `tests/db` suites

## Layout
- `app/` routes and server actions; `lib/` pure rules (auth, paywall, retention, certificate, stripe)
- `proxy.js` session refresh and `/account` gate
- `legacy/src/{site,client}` shared templates and browser modules; `legacy/content/` lessons as JSON
- `packages/` grader, sheet, session, progress, keys, content, content-lint, search
- `supabase/migrations/` numbered SQL; `tests/` unit, `e2e*/` browser, `scripts/` build gates

## Conventions (match them)
- kebab-case `.js`/`.mjs`, ESM, explicit relative imports; global CSS (no Tailwind/CSS-in-JS)
- Logic lives in small pure modules with injectable env (`fn(env = process.env)`); routes stay thin
- Each module opens with a prose comment explaining *why*; keep that style
- Pages reuse `legacy/src/site/*` templates via `dangerouslySetInnerHTML`; `npm run next:check` guards parity
- Feature flags are env vars (`PAYWALL`, `RETENTION_*`); unset must remain a supported state
- Privacy promise: nothing leaves the browser unless signed in; no third-party requests, no analytics

## Rules
- Match existing patterns; do not restructure or mass-reformat (Prettier would touch 45 files; `format:check` is informational)
- Before calling work done run `npm run lint`, `npm run typecheck`, `npm test`; for app changes also `npm run check`
- Never commit secrets: `.env*` is gitignored except `.env.example`; document new variables there
- Ask before adding dependencies or bumping Next
- Grader changes: update golden snapshot deliberately and review the diff
