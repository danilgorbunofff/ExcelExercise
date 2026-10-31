# Program completeness review — verification plan

**Status:** plan of record, unexecuted. Written 2026-10-31 against `phase-0-port-shell`.
**Scope:** establish, from artifacts rather than from the phase docs, which parts of the shipped site are
actually complete, before the remaining launch work (9B, deployment, the copy remainder) is called done.
**Audience:** a session with no prior context. Everything below is executable from the repository root.

---

## 0. The one rule

**Truth comes from artifacts, not from tracking docs.** A feature counts as complete when (a) a route
renders it, (b) a test fails if you delete it, and (c) the state a user reaches it in is exercised — not
when a checkbox is ticked. Every step below is ordered by that evidence hierarchy:

**runtime > tests > code > docs**

Docs are reconciled last, never used as input.

---

## 1. Why this review exists — seeded findings

The artifact checks below were run while writing this plan. Three conclusions, stated plainly.

### 1.1 The phase docs are not a ledger, and they are wrong in both directions

| Doc | Doc claims | Tree says | Verdict |
|---|---|---|---|
| `../phase-04-accounts-entitlements.md` | Open rows: auth flows, profile onboarding, progress writer, anonymous import, paywall, legal/data rights — "not started"; item 9 institutional domain allowlist — "not started" | `app/login`, `app/signup`, `app/reset`, `app/account`, `app/api/progress`, `lib/paywall.js`, `app/pricing`, `app/privacy`, `app/terms`, the `auth`/`progress`/`paywall`/`legal` specs, and migrations `0001`–`0008` including `0007_institution_domains.sql` | Doc is **stale-low** |
| `../phase-05-retention.md` | 8 unchecked boxes | `app/daily`, `app/leaderboard`, `app/flashcards`, `lib/retention/*`, five `retention-*.test.js` files | Doc is **stale-low** |
| `../phase-08-sql-track.md` | 8 unchecked boxes; 23 SQL lessons across 6 categories | **Zero SQL footprint** — no route, no lib module, no content, no test | Genuinely **unbuilt** |
| `../phase-09-b2b-referrals-polish.md` §B (B2B referrals) | 7 unchecked boxes | **Zero `referral` matches** in `app`, `lib`, `packages`, `legacy/src`, `scripts`; no cohort or admin route. Scaffolding exists in the schema only — `groups` and `group_invites` tables, with no code writing to them | Genuinely **unbuilt**, with dead schema |
| `../phase-10-analytics-launch.md` | 9 unchecked boxes; §8 indexability marked as built | `app/sitemap.js`, `app/robots.js`, `/api/health` exist; no analytics integration anywhere | **Partially built** |

So no answer to "are the other parts complete?" can be derived from the docs. It must be derived, then
written back into them.

### 1.2 A green suite cannot prove completeness

Current gates: `npm run check` → 1696 tests, 0 failures, 120 prerendered pages, 4869 template checks;
`npx playwright test` → 153 passed; `legacy/dist` byte-identical to a pinned baseline.

That is strong evidence that *what exists behaves as specified*. It is zero evidence about *what was
never built* — by construction, tests only cover code that was written. The largest unverified region
is not a module; it is the absence list.

### 1.3 The product ships as two builds, and they are not the same product

| Build | Surface |
|---|---|
| `legacy/dist` (static) | 120 HTML pages — `index`, `about`, `learn`, `excel`, `excel-exercises`, `excel-functions`, `pricing`, `privacy`, `terms`, plus `robots.txt` and `sitemap.xml` |
| `.next` (the app) | 144 prerendered HTML, plus dynamic `account`, `daily`, `flashcards`, `leaderboard`, `login`, `signup`, `reset`, `verify/[id]`, `api/*` |

A review that inspects one build can pass while the other is broken. Route coverage must be stated
per build.

### 1.4 Config-gated surfaces are only proven *off*

Accounts (Supabase), payments (Stripe) and progress writes are exercised exclusively in their
unconfigured state: `/login` renders disabled fields, `/certificate` renders the "accounts not
configured" branch, `POST /api/progress` answers 503. Fourteen specs assert that state — so enabling
config breaks the suite, which means **the configured state is the least proven part of the product and
the one a launch depends on.**

### 1.5 A whole test layer sits outside every gate

`tests/db/` holds 12 spec files — RLS, migrations, profiles, institutions, Stripe, retention,
leaderboards, challenges, certificates — run by `npm run db:check`, which resets a local Supabase stack
first (`supabase db reset && node --test --test-concurrency=1 tests/db/*.spec.js`). That command is in
neither `npm run check` nor `.github/workflows/ci.yml`, and the `supabase` CLI is not a project
dependency. So every green run reported so far, local or CI, has said nothing about row-level security,
constraint behaviour, or whether a migration is idempotent. The database is the layer a launch actually
risks; it is currently the layer nothing verifies on the way in.

### 1.6 Known deferrals still standing

- Keyboard-shortcut matrix — phase 2's last acceptance criterion, waiting on content rather than code.
- Certificate "one page in both A4 and Letter" — needs a held credential, which needs accounts configured.
- Unit 10 copy remainder — `app/account`, `app/daily`, `app/leaderboard`, `app/flashcards` and
  `app/verify` still hold literal strings; chrome, auth and certificate went through `t()`.

---

## 2. Step 1 — Build the inventory (evidence, not opinion)

Run from the repository root. Capture stdout into the report; do not paraphrase.

```bash
# route census, per build
find app -name "page.js" | sort
find legacy/dist -name "*.html" | sort

# content census
node -e 'const c = require("./packages/content/index.js");
const d = c.loadContent("legacy/content");
console.log("lessons", d.exercises.length,
  "screens", d.exercises.reduce((n, e) => n + (e.screens?.length ?? 1), 0));'

# test census per surface
ls tests e2e e2e-static
grep -c "^test\|^describe" tests/*.test.js

# schema census: a table is an artifact, and it outlives the doc that asked for it
ls supabase/migrations | sort
grep -ho "create table[a-z ]*\s[a-z_.]*" supabase/migrations/*.sql | sort -u

# capability census: ask for routes and directories, not for words
for d in sql datasets referrals cohorts admin export; do
  printf "%-10s route=%s lib=%s\n" "$d" \
    "$(test -d "app/$d" && echo yes || echo no)" \
    "$(ls lib/$d* 2>/dev/null | wc -l)"
done

# claim census
for f in docs/plans/parity/phase-*.md; do
  printf "%-46s open=%-3s done=%-3s\n" "$(basename "$f")" \
    "$(grep -c '^\s*- \[ \]' "$f")" "$(grep -c '^\s*- \[x\]' "$f")"
done

# gates, for the baseline record
npm run check 2>&1 | grep -E "^ℹ (tests|pass|fail)|checks passed"
npx playwright test 2>&1 | tail -3

# the layer no gate runs: needs the supabase CLI and a local stack (`npm run db:start`)
npm run db:check 2>&1 | grep -E "^ℹ (tests|pass|fail)" | tail -3
```

**A warning about substring counts.** `grep -rli export` returns 143 files, because `export` is a
JavaScript keyword; `grep -rli sql` returns files that merely mention SQL in a comment. A word census is
a pointer to where to look, never a verdict. Confirm every hit by reading it, and prefer the two
structural probes above — a route directory and a migration file cannot be a coincidence.

**Output of Step 1:** one table — *surface → routes → tests → states proven → states unproven*. A
surface with zero routes is a candidate gap; a surface with tests but no route (or a route with no
tests) is a claim to chase.

---

## 3. Step 2 — Reconcile claims against artifacts

For every acceptance checkbox in `docs/plans/parity/phase-00…phase-10`, assign exactly one verdict:

| Verdict | Meaning | Action |
|---|---|---|
| **Proven** | Route renders; a named test fails without the code; the states users reach are exercised | Tick the box, cite the witness by `file:line` |
| **Built, unproven** | Code exists, but no test would catch its removal, or only one state is exercised | Keep open; the fix is a test, not a feature |
| **Absent** | No artifact | Keep open; decided in Step 5 |
| **Obsolete** | The criterion no longer applies to this product | Delete the row; record the reason in one line |

Do not batch rows. Each gets a name and a path. The deliverable is a ledger where every ✅ has a
witness and every ✗ has a decision.

**Accuracy trap:** do not verify by reading code. Verify by removing the capability on a scratch branch
and confirming a test goes red; where that is impractical, verify in the browser. Reading code proves
intent, not behaviour.

---

## 4. Step 3 — Exercise the runtime state matrix

The suite covers happy paths and the unconfigured states well. These states must be walked by hand in
**both** builds before "complete" is claimed.

| # | State | Why it breaks | How |
|---|---|---|---|
| 1 | First visit, cold | Cache and persistence assumptions, first paint | Private window |
| 2 | Returning learner with progress | Storage hydration across sessions | Complete a drill, reload, navigate away and back |
| 3 | Mid-drill abandon and resume | The most-used real path | Leave at screen 3, return |
| 4 | Gated lesson, paywall boundary | Entitlement logic and 503 paths | Request a locked lesson URL directly |
| 5 | Accounts **configured** | Never exercised by CI | `.env.local` plus `npm run db:start`; accept the 14 spec failures knowingly and log them |
| 6 | Payments configured | Never exercised by CI | `npm run stripe:seed`, test-mode card; verify webhook idempotency by replaying one event |
| 7 | Errors: bad lesson slug (404), 500 path, offline mid-drill | Unknown-route rendering, recovery banners | Throttle to offline, then submit |
| 8 | 1280×720 at 100 % and at 150 % zoom | Hardcoded heights, sliced content | DevTools zoom |
| 9 | Phone at 360 px | Reflow and hit targets | Device emulation |
| 10 | Keyboard only | Focus order, focus-visible, dialog trapping | Unplug the mouse |
| 11 | `prefers-reduced-motion`, `prefers-color-scheme: dark` | Animation and palette branches | DevTools rendering pane |
| 12 | Print | Certificate only; unproven with a held credential | Print preview, A4 and Letter |
| 13 | Static build, deep URL on a cold request | Relative asset paths, prefix handling | `node scripts/serve-static.mjs legacy/dist 4175`, then hit `/excel/…` |

Record a screenshot per row per build. A row without a screenshot is not reviewed.

---

## 5. Step 4 — Completeness invariants

Independent of any feature list, these must hold. Most already have a test — name it, or write it.

1. **Every route is reachable** from the front door in ≤3 clicks, or is deliberately unlinked, and the
   exceptions are listed.
2. **Every route returns 200 and renders chrome**, except `/api/*` and `/verify/[id]` unheld.
3. **No dead internal link** in either build (crawl `legacy/dist`; crawl `.next` through Playwright).
4. **`sitemap.xml` ⇔ static routes**, exactly.
5. **Every lesson has ≥1 screen with a reference answer, ≥1 wrong-answer fixture, a hint and a
   solution**, and the fixture is *actually rejected by the real grader*. This exists — confirm it
   covers all 88.
6. **Every page has a title, description and canonical.** The SEO gate exists — confirm its coverage count.
7. **No banned copy, no typography violations** — confirm content-lint runs over chrome **and** lessons
   **and** legal.
8. **Contrast, hit targets, focus rings, labels** — the WCAG 2.2 spec covers the front door and a drill;
   confirm the checkout and account surfaces are covered too.
9. **Empty states carry a CTA; loading states are skeletons, not spinners.**
10. **`/api/health` reports the deployed SHA** — the only post-deploy proof that the thing serving
    traffic is the thing that was shipped.
11. **`tests/db/` runs inside the gate**, not beside it — see §1.5. Until it does, no green run is
    evidence about RLS, constraints or migration safety.

---

## 6. Step 5 — Triage every gap with a rule, not a feeling

For each **Absent** or **Built, unproven** row, choose exactly one:

- **Build** — it is inside the definition of launch.
- **Defer, with a recorded reason** — one sentence in the doc: what is missing, who is affected, the
  workaround, and what triggers building it. A deferral without a reason is a lie with a checkbox.
- **Remove the claim** — delete the feature from the plan, and from any marketing copy that implies it.

The current definition of launch (`../phase-10-analytics-launch.md`, "Definition of launch") names
phases 0–8, 9A and 10, **except 9B**. Under that rule, phase 8 (the SQL track: 23 lessons, 6
categories, datasets) is launch-blocking and entirely unbuilt, while 9B is explicitly out. If that is
not what the owner means, **amend the rule first** — otherwise the review spends days on a phase that
was never meant to ship.

---

## 7. Step 6 — Make the docs a ledger

Rewrite each phase doc's acceptance section as a table, not a checklist:

| Criterion | Verdict | Witness | State exercised | Owner |
|---|---|---|---|---|
| Progress survives a reload | Proven | `e2e/progress.spec.js:62` | configured and unconfigured | — |
| SQL track ships 23 lessons | Absent | — | — | — |

Rules: no ✅ without a path to a test; no ✗ without a decision from Step 5; delete rows that no longer
apply rather than leaving them grey. Stamp the review date on the doc.

---

## 8. Step 7 — One gate, one report

Add a review command that re-derives the ledger instead of asserting it. It runs the gates, crawls both
builds, and fails on any of:

- the database specs are not part of the run (or are, and fail),
- a row marked Proven that no test witnesses,
- a sitemap URL that 404s,
- an internal link that 404s,
- a content file failing the copy or typography lint.

Output: `docs/plans/parity/reviews/completeness-YYYY-MM-DD.md`.

Sign the launch checklist only when every row is Proven or Deferred-with-reason. Then run the
post-deploy smoke: `/api/health` SHA matches the release, three deep URLs per build return 200, a drill
grades, print preview opens.

---

## 9. Sequence and shape

| Step | Sessions | Output |
|---|---|---|
| 1 Inventory | 1 | census tables |
| 2 Reconcile | 1–2 | verdict ledger, every row named |
| 3 Runtime matrix | 2–3 | screenshots plus a defect list |
| 4 Invariants | 1 | pass/fail per invariant, with the missing tests written |
| 5 Triage | ½ (owner decision) | build / defer / delete per gap |
| 6 Docs | 1 | rewritten acceptance tables |
| 7 Gate | 1 | review command plus a dated report |

Do Steps 1 and 2 before touching code again. Fixing while still unsure which gaps are real is how the
last phase gets declared done twice.

---

## 10. Questions to settle before Step 1

1. Is phase 8 (the SQL track) in this launch, or does the definition of launch change?
2. Is 9B (referrals, cohorts, admin) permanently out of the first release?
3. Which analytics vendor, if any — or is "no analytics" the decision?
4. Will accounts and payments be live at launch, or does the site launch unconfigured, and is that
   acceptable?
5. Is one of the two builds the product, or do both ship?
6. Who signs the "Deferred" decisions?
