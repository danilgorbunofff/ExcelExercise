# Backup and restore

The database is the only stateful thing this site owns: accounts, progress, streaks, daily
challenges, entitlements, payments and certificate records. Everything else (lessons, notes,
articles, the pricing copy) is in git and can be rebuilt from the release commit.

## What must be in a backup

| Data | Tables | Cost of losing it |
|---|---|---|
| Identities | `auth.users` | Nobody can sign in; every reference below dangles |
| Profiles and progress | `profiles`, `lesson_progress`, `progress_batches`, `attempts`, `streaks`, `daily_points`, `screen_awards` | Learners restart; dashboards go empty |
| Money | `entitlements`, `payments`, `stripe_events` | Paid readers lose access; Stripe replay is possible but manual |
| Credentials | `certificates` | Issued certificates stop verifying — a public promise, not just rows |
| Small social/ops surfaces | `groups`, `group_invites`, `institution_domains`, `daily_challenges`, `challenge_answers`, `challenge_attempts`, `feedback` | Recoverable or tolerable |

`auth.users` is the part people forget: a `public`-only dump restores progress rows that point at
identities that no longer exist.

## Taking one

```bash
# Whole database, restoration-shaped: schema and data, every schema Supabase manages.
npx supabase db dump --db-url "$PRODUCTION_DB_URL" -f backup-schema.sql
npx supabase db dump --db-url "$PRODUCTION_DB_URL" --data-only -f backup-data.sql
```

Against the linked project the `--db-url` flag is unnecessary (`supabase db dump -f …`). Keep both
files: the schema dump is what a forensic restore reads, the data dump is what a restore into a
fresh project needs, because the shipped schema already exists there from the migrations.

`supabase db dump` refuses to guess a project; locally it needs `--local`.

## Restoring into a fresh project

1. Create the project, note its connection string, and apply the migrations exactly as the release
   did: `supabase db push` from the release commit. The schema must be the shipped one, not the one
   in the dump — otherwise a restore silently reinstalls a schema nobody has tested.
2. Load the data:
   ```bash
   psql "$NEW_PROJECT_DB_URL" -v ON_ERROR_STOP=1 -f backup-data.sql
   ```
   The dump carries `auth`, `storage`, `extensions` and `vault` objects. A project supplies those
   schemas; a bare `createdb` does not, and psql will report `schema "extensions" does not exist` once
   per object. That is why a restore target is a *Supabase project*, never an empty database.
3. Verify before switching traffic: the row counts in the next section must match the source, and
   `npm run db:check` must pass against the restored database.
4. Point the app at the new project (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`), redeploy, and run `npm run smoke` plus a signed-in pass of
   `npm run e2e:accounts` against the candidate origin.

## Rehearsal, run on 2026-10-31

Performed against the local stack, which is the only database this session may touch. The rehearsal
is the interesting half of the procedure: it proves the dump reloads into the shipped schema with no
manual repair, and it measures how long a restore takes at this size.

```text
$ npx supabase db dump --local -f /tmp/xs-schema.sql
Dumped schema to /tmp/xs-schema.sql.            # 90,359 bytes
$ npx supabase db dump --local --data-only -f /tmp/xs-data.sql
Dumped schema to /tmp/xs-data.sql.              # 113,011 bytes  (INSERT statements)

# the source, before the dump was taken
attempts=0 certificates=0 challenge_answers=0 challenge_attempts=0 daily_challenges=3
daily_points=0 entitlements=0 feedback=0 group_invites=0 groups=2 institution_domains=0
lesson_progress=0 payments=0 profiles=3 progress_batches=0 screen_awards=0 streaks=0
stripe_events=0

# a "fresh project": migrations only, no demo rows
$ npx supabase db reset --no-seed
Finished supabase db reset on branch phase-0-port-shell.
# …confirmed empty: every table above at 0

$ time psql "$LOCAL_DB_URL" -q -f /tmp/xs-data.sql
real 0m0.050s          # 0 errors
# …after: daily_challenges=3 groups=2 profiles=3, auth.users=3 — identical to the source
```

Two things the rehearsal taught:

- The data dump restores in **50 ms** at this size, and the row counts come back exactly, including
  `auth.users`. The slow part of a real restore is creating the project and pushing migrations, not
  the data.
- A restore into a database without Supabase's own schemas fails 86 times on `extensions`, `vault`,
  `graphql` and the `grant_institution_access` function. Those errors are the shape of "wrong target",
  not "bad dump" — decide that from the error text, not from the exit status.

Restoring the local stack afterwards is `npx supabase db reset`, which replays migrations plus
`supabase/seed.sql`.

## Cadence and retention

- Supabase's own daily backups cover the platform; treat them as the floor and keep an independent
  dump before every migration and before every launch-week deploy.
- Keep a dump from the day a certificate-issuing change ships: `certificates` rows are the ones with
  a public promise attached (`/verify/<id>`), and revocation is additive, so a restored copy is still
  verifiable.
- A dump is a secret. It contains password hashes, emails and Stripe customer ids; store it where
  `SUPABASE_SERVICE_ROLE_KEY` lives, never in the repo and never in a build artifact.
