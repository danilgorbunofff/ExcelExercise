// Shared plumbing for the phase-4 database suite.
//
// The stack under test is the local Supabase one (`npm run db:start`). Nothing here talks to a
// remote project, and no secret is written to disk: the local API keys are read from
// `supabase status` at run time. The suite deliberately goes over HTTP with real user JWTs
// rather than as the postgres superuser, because RLS only exists for non-superusers.

import { execFileSync } from 'node:child_process';

let cached;

export function stack() {
  if (cached) return cached;
  let out;
  try {
    out = execFileSync('supabase', ['status', '-o', 'env', '--agent', 'no'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    throw new Error('local Supabase stack is not running — start it with `npm run db:start`');
  }
  const env = {};
  for (const line of out.split('\n')) {
    const m = /^([A-Z_]+)="(.*)"\s*$/.exec(line.trim());
    if (m) env[m[1]] = m[2];
  }
  if (!env.API_URL || !env.ANON_KEY || !env.SERVICE_ROLE_KEY) {
    throw new Error('`supabase status` did not report API_URL/ANON_KEY/SERVICE_ROLE_KEY');
  }
  cached = {
    api: env.API_URL,
    anon: env.ANON_KEY,
    service: env.SERVICE_ROLE_KEY,
    dbUrl: env.DB_URL,
    mailpit: env.MAILPIT_URL ?? env.INBUCKET_URL,
  };
  return cached;
}

export function psql(sql) {
  const { dbUrl } = stack();
  try {
    return execFileSync('psql', [dbUrl, '-AtF', '\t', '-c', sql], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (err) {
    throw new Error(`psql failed: ${err.stderr || err.message}`);
  }
}

export async function signIn(email, password = 'password123') {
  const s = stack();
  const res = await fetch(`${s.api}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: s.anon, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`sign-in failed for ${email}: ${res.status} ${JSON.stringify(body)}`);
  return { token: body.access_token, id: body.user.id, email };
}

// PostgREST request. `as` is a session (from signIn), 'anon', or 'service' for the bypassing role.
export async function rest(path, { as, method = 'GET', body, prefer } = {}) {
  const s = stack();
  const bearer = as === 'service' ? s.service : as === 'anon' ? s.anon : as?.token;
  const headers = { apikey: s.anon };
  if (bearer) headers.authorization = `Bearer ${bearer}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (prefer) headers.prefer = prefer;
  const res = await fetch(`${s.api}/rest/v1/${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, body: json };
}

// Every table the suite writes, with a filter that matches all rows. Children before parents.
const FIXTURE_TABLES = [
  ['feedback', 'id'],
  ['payments', 'id'],
  ['entitlements', 'user_id'],
  ['attempts', 'id'],
  ['lesson_progress', 'user_id'],
  ['daily_points', 'user_id'],
  ['streaks', 'user_id'],
  ['group_invites', 'id'],
];

// Wipe the fixture rows the suite owns, leaving the seeded users and group alone.
export async function resetFixtures() {
  for (const [table, column] of FIXTURE_TABLES) {
    const { status, body } = await rest(`${table}?${column}=not.is.null`, {
      as: 'service',
      method: 'DELETE',
    });
    if (status >= 400) throw new Error(`could not clear ${table}: ${status} ${JSON.stringify(body)}`);
  }
}

// ── GoTrue ───────────────────────────────────────────────────────────────────────────────────────
// The auth server is the second half of the stack: sign-up, sign-in, recovery and magic links all go
// through it, and it is the only thing that inserts into `auth.users`. The profile rows those inserts
// produce are the trigger's job, so these helpers are how the suite proves the trigger fires.

export async function gotrue(path, { method = 'POST', body, token } = {}) {
  const s = stack();
  const headers = { apikey: s.anon };
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(`${s.api}/auth/v1/${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, body: json };
}

export async function signUp(email, password = 'password123', data = {}) {
  const res = await gotrue('signup', { body: { email, password, data } });
  return res;
}

// The mailbox the local stack writes to (Mailpit). Nothing here reads a production inbox.
export async function mailbox(email) {
  const s = stack();
  const res = await fetch(`${s.mailpit}/api/v1/messages?limit=200`);
  if (!res.ok) throw new Error(`mailpit list failed: ${res.status}`);
  const { messages = [] } = await res.json();
  const mine = messages.filter((m) =>
    (m.To ?? []).some((to) => String(to.Address).toLowerCase() === email.toLowerCase()),
  );
  return mine.map((m) => ({ id: m.ID, subject: m.Subject, to: email }));
}

export async function message(id) {
  const s = stack();
  const res = await fetch(`${s.mailpit}/api/v1/message/${id}`);
  if (!res.ok) throw new Error(`mailpit message failed: ${res.status}`);
  return res.json();
}

// Users made by the suite are removed afterwards: the seed owns the three named accounts, and a
// leftover probe address would make the next run's username collisions depend on history.
export function purgeUsers(emails) {
  const list = emails.map((e) => `'${e.replace(/'/g, "''")}'`).join(', ');
  psql(`delete from auth.users where email in (${list});`);
}
