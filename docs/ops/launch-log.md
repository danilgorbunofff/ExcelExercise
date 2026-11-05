# Launch log

One page of facts about the go-live, filled in as it happens and never tidied afterwards. The
checklist says what must be true; this says what was true, when, and who said so. `launch-checklist.md`
asks for it under *After the deploy*; `rollback.md` asks for the same record from the other direction.
`go-live-plan.md` is the sequence that produces the entries.

Fill a line only when you have the output in front of you. A guess here is worse than a blank, because
the next person reads it as evidence.

## The release

| Field | Value |
|---|---|
| Release commit (full sha) | `5e3a1b6f7644c803e84137c95c2f0a41d6eba24c` — cut 2026-11-05 on `phase-0-port-shell`, 23 files, +1450 −49 against `main`. Green on both CI runs on this sha: push `42103111994` and PR `42103114809`. |
| Tag | none yet |
| App origin | *not assigned* |
| Static origin | *not assigned* |
| Migrations applied | *none — `supabase migration list` output pasted here* |
| `PAYWALL` | *unset* |

## Before the deploy

| Gate | Where it was proven | Date | By |
|---|---|---|---|
| `npm run check` on the release commit | CI `check` job, both runs on `5e3a1b6` — 139 pages prerendered, 86 lessons, 6326 content checks, byte budgets, origin and secret scans | 2026-11-05 | CI (`ubuntu-24.04`) |
| `npm run review` — all four gates, `db` and `accounts` included | local, on `5e3a1b6` — eleven gates green; 78 of 78 proved witnesses re-ran, 158 Next and 138 static links answered 200; annex `docs/plans/parity/reviews/completeness-2026-11-05-gates.md` | 2026-11-05 | this machine |
| `npm run e2e:accounts` against the release candidate | CI `db` job, both runs on `5e3a1b6` — 30 passed (22.7s on the push run, 29.2s on the PR run); also 30/30 locally | 2026-11-05 | CI (`ubuntu-24.04`) |
| Both editions built from the release commit with production `SITE_*` | `npm run review`, whose build gate sets `SITE_ENV=production` and `SITE_URL=https://excelsupreme.com`; the budget, route, origin and secret gates then run against that pair | 2026-11-05 | this machine |
| Restore rehearsal against a real project (`backup.md`) | | | |
| Rollback rehearsal against the real host (`rollback.md`) | | | |
| Error and uptime sink live, alert proven by a synthetic failure | | | |
| One live purchase, entitlement proven, charge refunded | | | |

## Human checks

Every row needs a date and a name. The four marked *(second person)* need someone other than the
person who wrote the code — a check by its author is a self-review.

What a machine has already proved, so the person signing knows what is actually left to them:

- **H1** — the three behaviours named there now run on WebKit in CI (`drill`, `keyboard` and
  `certificate` specs; 23 passed). What remains is the Safari app and this Mac's print stack, not the
  code.
- **H6** — `keyboard.spec.js` passes the whole first lesson with no mouse on Chromium, Firefox and
  WebKit, and the walk was re-run thirty times on WebKit — sixty passes, no failure — after its tab
  budget was fixed. What remains is a physical keyboard and a person who does not reach for the
  trackpad.
- **H7** — A4 and Letter are both measured against a sixty-character unbroken name, and `page.pdf()`
  is asserted to be a real, non-empty PDF with the verification URL on it. What remains is the OS
  print dialogue.

| # | Check | Date | Who |
|---|---|---|---|
| H1 | Safari on macOS *(second person)* | | |
| H2 | Edge on Windows *(second person)* | | |
| H3 | Rich Results on three note URLs | | |
| H4 | LinkedIn add-licence prefills | | |
| H5 | Search Console accepts the sitemap | | |
| H6 | Keyboard-only pass on a real keyboard | | |
| H7 | Print to PDF, A4 and Letter | | |
| H8 | Sign-up and reset mail at Gmail and Outlook, `spf=pass` `dkim=pass` `dmarc=pass` *(second person)* | | |
| H9 | `SITE_CONTACT` receives and answers mail sent from outside the domain *(second person)* | | |

## Sign-offs

- [ ] Restore rehearsal performed, row counts compared — date:
- [ ] Rollback rehearsal performed, time recorded — date:
- [ ] The signed deferrals in the review's §5.4 accepted by the owner with their triggers intact — date:
- [ ] A human exercised sign-up, buy, entitlement and account deletion end to end — date:

## The deploy

Order: migrations, then the static edition, then the app (`deploy.md`). Paste each smoke in full; a
summary line is not evidence.

| Step | Output | Date | By |
|---|---|---|---|
| `supabase migration list` against production | | | |
| Static edition published, extension-less URLs and 404 checked | | | |
| App deployed | | | |
| `npm run smoke -- <app origin> --sha <full sha>` | | | |
| `npm run smoke -- <static origin> --sha <full sha>` | | | |
| A person played an exercise signed out and printed a certificate | | | |

## Anything that went wrong

One entry per incident: what the reader saw, what was actually wrong, what was done, how long it took.
`rollback.md` lists the four undos; name which one was used.

| Time | Symptom | Cause | Undo used | Duration |
|---|---|---|---|---|
| 2026-11-05 | CI `e2e` cancelled at its 25-minute timeout having run **zero** tests, while `check`, `db` and `static` had already passed | `ubuntu-latest` resolved to pre-release `resolute`, and its `azure.archive.ubuntu.com` mirror stalled inside `playwright install --with-deps` — still on package 59 of the set when the budget ran out | none needed: every job pinned to `ubuntu-24.04`, `e2e` budget 25 → 35 min (`da278fc`) | one CI cycle |
| 2026-11-05 | `e2e/keyboard.spec.js` failed on WebKit in the PR run and passed in the push run on the same sha; the walk reported `body` partway round, and the hint button looked like it would not expand | Not a product defect. `tabTo`'s fixed 30-press budget was smaller than the page's tab-stop count once the footer arrives (~22 anchors alone), and a return to `body` was read as stolen focus — but tabbing off the last control hands focus to WebKit's own chrome, which reports `body`. Separately, the `data-full` hydration signal fired one line before the formula bar was wired. | none needed: budget computed from the live tab-stop count, one wrap allowed and a second still fails, and `waitForClient` now waits for `#formula` enabled (`5e3a1b6`) | an evening |
| 2026-11-05 | `npm run review` red: `p2-263 — e2e/keyboard.spec.js:67 is not inside any browser test that ran` | The fix above added lines above the first test, so a `path:line` witness in the parity docs came to point into a docstring. Adding lines to a cited test file invalidates every witness below the edit. | none needed: repointed `p2-263` to `:92` in the phase doc and in the review document; review then green | under five minutes |

## The first week

- DMARC tightened from `p=none` to `p=quarantine` after a clean week — date:
- Search Console coverage read, and the self-canonical question settled for the two origins — date:
- Deferrals still unbuilt, with their triggers unchanged — checked on:
