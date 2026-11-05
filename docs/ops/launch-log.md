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
| Release commit (full sha) | `962b498` — merge of PR #2, *fill in the full sha at deploy time* |
| Tag | none yet |
| App origin | *not assigned* |
| Static origin | *not assigned* |
| Migrations applied | *none — `supabase migration list` output pasted here* |
| `PAYWALL` | *unset* |

## Before the deploy

| Gate | Where it was proven | Date | By |
|---|---|---|---|
| `npm run check` on the release commit | | | |
| `npm run review` — all four gates, `db` and `accounts` included | | | |
| `npm run e2e:accounts` against the release candidate | | | |
| Both editions built from the release commit with production `SITE_*` | | | |
| Restore rehearsal against a real project (`backup.md`) | | | |
| Rollback rehearsal against the real host (`rollback.md`) | | | |
| Error and uptime sink live, alert proven by a synthetic failure | | | |
| One live purchase, entitlement proven, charge refunded | | | |

## Human checks

Every row needs a date and a name. The four marked *(second person)* need someone other than the
person who wrote the code — a check by its author is a self-review.

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
| | | | | |

## The first week

- DMARC tightened from `p=none` to `p=quarantine` after a clean week — date:
- Search Console coverage read, and the self-canonical question settled for the two origins — date:
- Deferrals still unbuilt, with their triggers unchanged — checked on:
