# Launch checklist

The review at `docs/plans/parity/reviews/completeness-2026-10-31.md` establishes what is proven; this
page is what a person does with that, in order, on the day. Nothing here replaces a gate — every line
is either a *human judgement* no test can make, an *external service* that only a person can query,
or a *decision* that must be recorded.

Scope, as ruled by the owner: phases 0–7, 9A and 10 ship; the SQL track (phase 8) and the
organizational surface (9B: referrals, cohorts, institution seats) are **not** in this launch, and
their phase docs are stamped out of scope rather than left as promises.

## Before the release commit

- [ ] `npm run check` green on the exact release commit (tests, content lint, build, byte budget,
      page-shape check, origin guard, secret scan, static verify).
- [ ] `npx playwright test` green — all projects, both builds.
- [ ] `npm run db:check` green against a freshly reset database. CI's `db` job runs it — that job was
      added by this review, because before it no gate ran the database suite at all. If the workflow
      is ever edited, this job is the one thing not to drop.
- [ ] `npm run e2e:accounts` green (`PW_ACCOUNTS=1`), against a candidate build that has the real
      Supabase env.
- [ ] `npm run review` green, locally, on the release commit: it re-derives the ledger, re-runs the
      gates itself, and fails when a Proven row has lost its witness or a sitemap URL or internal link
      404s in either build. It is a pre-release line rather than a CI job because it *is* the gate
      suite plus the document, not a fourth copy of it.
- [ ] `npm run lighthouse` at or above the thresholds in `lighthouserc.*`.
- [ ] `SITE_URL` and `SITE_ENV=production` set for both builds; `PAYWALL` set only after accounts and
      billing are confirmed live.

## Human checks the gates cannot make

These are named, not ticked, until a person does them and records the date beside them.

| # | Check | How | Why a machine cannot |
|---|---|---|---|
| H1 | **Safari on macOS** — a drill is playable, Tab reaches the answer field, the certificate prints | Open the candidate on real Safari | Playwright's WebKit is not Safari, and CI is Linux |
| H2 | **Edge on Windows** — same three behaviours | Open the candidate on real Edge | Same; the engine matrix covers Chromium, not the OS |
| H3 | **Rich Results** — schema.org for three notes validates (`p7-73`) | Google's Rich Results test on three live note URLs | Needs the public URL and Google's validator |
| H4 | **LinkedIn add-licence** — the button prefills institution, title and issue date (`p6-94`) | Sign in to LinkedIn, press the button on a real certificate | LinkedIn's UI is not automatable |
| H5 | **Search Console** — the sitemap is submitted and accepted (`p10-139`) | Search Console after the domain resolves | External account |
| H6 | **Keyboard-only pass on a real keyboard** — the whole first lesson, including the chord matrix | A person, no mouse | Chord handling depends on real key events per OS |
| H7 | **Print to PDF on a real printer dialogue** — A4 and Letter, no clipped name | Print preview from the owner's machine | `page.pdf()` proves the CSS, not the OS print stack |

## Sign-offs to record

- [ ] Restore rehearsal performed against the production project, row counts compared (procedure and
      the locally-measured numbers: `backup.md`).
- [ ] Rollback rehearsal performed against the production host, time recorded (`rollback.md`).
- [ ] The signed deferrals in the review's §5.4 accepted by the owner with their triggers intact:
      load harness (`p5-75`), LinkedIn UI (`p6-94`), Rich Results (`p7-73`), analytics sink and funnel
      (`p10-134`, `p10-135`), Search Console (`p10-139`). These are launch *decisions*, not gaps the
      ledger forgot.
- [ ] The account/payment surfaces are exercised once by a human end to end: sign up, buy, see the
      entitlement, delete the account.

## Not in this launch, deliberately

| Surface | Status | Where it is recorded |
|---|---|---|
| SQL track (phase 8) | Out of scope by owner ruling | `phase-08-sql-track.md`, stamped |
| Referrals, cohorts, institution seats (9B) | Deleted, schema included | `phase-09-b2b-referrals-polish.md`, stamped; B14 removed the last copy that implied it |
| Analytics | No vendor at launch | `phase-10-analytics-launch.md`; events remain observable in the payload |

A future reader should be able to tell the difference between "we did not build it" and "we forgot".
That is what the stamps are for.

## After the deploy

- [ ] `npm run smoke -- https://<app origin> --sha <release sha>` — every check green, SHA matches.
- [ ] `npm run smoke -- https://<static origin> --sha <release sha>` — green; the SHA check skips with
      its reason printed, because the static edition has no `/api/health`.
- [ ] A drill is played by a person on production, signed out, and then a certificate is printed.
- [ ] The launch log records the release SHA, both origins, the smoke outputs, and anything rolled
      back.
