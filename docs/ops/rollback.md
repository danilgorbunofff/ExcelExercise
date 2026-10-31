# Rolling back

A rollback is a decision, not a command. The cheapest move that removes the harm wins, and there are
four of them, in rising order of cost:

| Harm | Cheapest undo | Time, measured |
|---|---|---|
| The gate is walling readers out | Unset `PAYWALL`, restart the app | one restart |
| The app release is wrong | Redeploy the previous `.next` | one deploy |
| The static edition is wrong | Swap the served directory back | **≈ 2 s** (rehearsed below) |
| The schema or the data is wrong | Restore the dump | minutes — `backup.md` |

Never roll the schema back with a down-migration: the migrations are forward-only and a "rollback"
migration is a new, untested schema. Restore instead.

## The static edition: keep the previous directory

The static build is a directory of files, so a rollback is a directory swap — but only if a copy of
the previous one still exists. Keep the last two:

```bash
# at release time, after `npm run build`
rsync -a --delete legacy/dist/ /srv/xs/dist-$(git rev-parse --short HEAD)/
ln -sfn /srv/xs/dist-$(git rev-parse --short HEAD) /srv/xs/current
```

Rolling back is then `ln -sfn /srv/xs/dist-<previous> /srv/xs/current`.

## Rehearsal, run on 2026-10-31

The rehearsal took a snapshot of the built site, served it as if it were the previous release, and
ran the smoke at it. This is the whole procedure minus the symlink:

```text
$ npm run build && cp -R legacy/dist /tmp/xs-release-a     # 12 MB, 121 pages
$ node scripts/serve-static.mjs /tmp/xs-release-a 4197 &
static: serving /tmp/xs-release-a on http://127.0.0.1:4197
$ curl -s -o /dev/null -w "%{http_code} %{time_total}s\n" http://127.0.0.1:4197/
200 0.020s
$ time npm run smoke -- http://127.0.0.1:4197
✓ /excel-exercises — …
✓ … names only live assets
• http://127.0.0.1:4197 answers /certificate — no certificate route on this origin (the static edition)
✓ http://127.0.0.1:4197 answers an unknown address with 404 — 4744 bytes of the site's page

12 passed, 0 failed
real 0m0.305s
```

So: previous artifact on disk, served, verified, in about two seconds. The parts that take real time
on the day are finding the previous artifact and pointing DNS or the host at it — which is why the
artifact is kept, not rebuilt. Rebuilding "the old version" is not a rollback: it produces whatever
the current checkout renders.

## The app

Redeploy the previous immutable deployment (Vercel and most hosts keep them), or check out the
previous release commit, `npm run next:build`, and start that artifact. Two rules:

- The previous app must be able to read the **current** schema. If the bad release came with a
  migration, roll back the app first and the data second, and expect to restore rather than migrate
  down.
- After any rollback, run the smoke twice — once at the restored origin, once at the origin that was
  bad — so the report says what the reader is actually served:
  ```bash
  npm run smoke -- https://www.example --sha "$(git rev-parse --short HEAD)"
  ```

## Deciding, in the first five minutes

1. Is anything being written wrongly? Stop writes first: unset the service-role key or take the
   affected route out of service. A read-only site is a degraded site; a corrupt ledger is a restore.
2. Is the front page wrong or is a deep address wrong? The smoke answers that in five seconds without
   touching anything (`npm run smoke -- <origin>`); a front page that works with a shattered lesson
   is a static-host rewrite problem, and re-uploading the same bytes will not fix it.
3. Is it the app or the edition? `/api/health` exists only on the app. If it answers, you are looking
   at the app; if it 404s, the static edition.
4. Roll back the smallest thing that removes the harm, then record the SHA, the time, the symptom and
   the move in the launch log. A rollback without a recorded SHA cannot be told apart from a second
   bad deploy.
