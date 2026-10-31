// Shared helpers for the accounts suite.
//
// Everything here talks to the *same* database the app under test talks to, through the local stack's
// service role — which is the point of the project: these specs prove that a session, an entitlement
// and a certificate survive a real browser round trip, not that mock objects can be constructed.
//
// The suite is serial (`workers: 1` in the project): `resetFixtures()` wipes tables for everybody, so
// two specs running at once would delete each other's rows mid-assertion.

import { createHmac } from "node:crypto";

import { psql, purgeUsers, resetFixtures, stack } from "../tests/db/harness.mjs";

/** Re-exported so a spec can create an account without a browser. */
export { gotrue } from "../tests/db/harness.mjs";

/** The secret `playwright.config.js` hands the accounts server. The tests sign their own payloads. */
export const WEBHOOK_SECRET = "whsec_local_accounts";

export const PASSWORD = "password123";

/**
 * The gate has three states, and the catalog decides which lesson is in which: `freeLessonCount` is 3,
 * so lesson 4 is served with a prompt the drill paints in the browser (a redirect here would make its
 * "continue free this once" button unreachable), and lesson 5 is the wall the request refuses.
 */
export const FREE_LESSON = "/learn/excel/what-a-formula-actually-does";
export const PROMPT_LESSON = "/learn/excel/sum-basics";
export const PAID_LESSON = "/learn/excel/sumifs-two-conditions-at-once";
/**
 * Every free lesson is a single screen, so a real "second screen" only exists behind the wall — the
 * specs that need a position other than zero grant an entitlement first (`deliver(lifetimeEvent)`).
 */
export const TWO_SCREEN_LESSON = PAID_LESSON;

/** One address per run, so a leftover account cannot make the next run's username collide. */
export function address(label) {
  return `e2e-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@accounts.example`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** A fresh uuid for `/api/progress`'s idempotency key. Random per call on purpose. */
export function batchId() {
  const hex = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
  if (!UUID.test(id)) throw new Error(`bad batch id: ${id}`);
  return id;
}

/** Wipe the fixture tables. Serial project, so this is safe. */
export async function reset() {
  await resetFixtures();
}

/** Remove the accounts a spec made. Cascades the profile through `auth.users`. */
export function forget(...emails) {
  const list = emails.filter(Boolean);
  if (!list.length) return;
  purgeUsers(list);
}

/**
 * Sign in through the real form, not the API: the form is the surface a learner uses, and every
 * assertion after it depends on the cookie path it produces.
 */
export async function signIn(page, email, next = "/learn") {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  const form = page.locator("form").filter({ has: page.locator('input[name="password"]') }).first();
  await form.locator('input[name="email"]').fill(email);
  await form.locator('input[name="password"]').fill(PASSWORD);
  await form.locator('button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

/** Create the account through the sign-up form, which signs the learner in on success. */
export async function signUpThroughForm(page, email, displayName = "") {
  await page.goto("/signup");
  const form = page.locator("form").filter({ has: page.locator('input[name="password"]') }).first();
  await form.locator('input[name="email"]').fill(email);
  await form.locator('input[name="password"]').fill(PASSWORD);
  if (displayName) await form.locator('input[name="display_name"]').fill(displayName);
  await form.locator('button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.startsWith("/signup"));
}

// ── Stripe ───────────────────────────────────────────────────────────────────────────────────────
// The webhook is the only thing allowed to say someone paid, and it is offline-testable: the
// signature is an HMAC over `${timestamp}.${raw}` with the secret the server was started with.

export function sign(body, { timestamp = Math.floor(Date.now() / 1000), secret = WEBHOOK_SECRET } = {}) {
  const digest = createHmac("sha256", secret).update(`${timestamp}.${body}`, "utf8").digest("hex");
  return `t=${timestamp},v1=${digest}`;
}

/** Deliver one signed event to the running server. `request` is Playwright's API context. */
export async function deliver(request, { id, type, object }, options) {
  const body = JSON.stringify({ id, type, data: { object } });
  const response = await request.post("/api/stripe/webhook", {
    headers: { "content-type": "application/json", "stripe-signature": sign(body, options) },
    data: body,
  });
  return { status: response.status(), body: await response.json() };
}

/** A lifetime purchase, which needs no period and therefore no renewal. */
export function lifetimeEvent(userId, name = "purchase") {
  return {
    id: `evt_e2e_${name}`,
    type: "checkout.session.completed",
    object: {
      id: `cs_e2e_${name}`,
      customer: `cus_e2e_${name}`,
      payment_intent: `pi_e2e_${name}`,
      amount_total: 19900,
      currency: "usd",
      client_reference_id: userId,
      metadata: { user_id: userId, plan: "lifetime" },
    },
  };
}

/** A refund of the payment above, which takes the entitlement away with it. */
export function refundEvent(name = "refund") {
  return {
    id: `evt_e2e_${name}`,
    type: "charge.refunded",
    object: { id: `ch_e2e_${name}`, payment_intent: "pi_e2e_purchase" },
  };
}

// ── Progress ─────────────────────────────────────────────────────────────────────────────────────

/**
 * Mark lessons finished for a user, straight into `lesson_progress`.
 *
 * The service role is used deliberately: this is setup for a browser assertion (does the dashboard
 * paint the count?), and driving the drill UI to write it would make every screen's grader a
 * dependency of the dashboard's rendering — which is the coupling this suite is meant to break.
 */
export async function finishLessons(userId, lessonIds) {
  const s = stack();
  const at = new Date().toISOString();
  const rows = lessonIds.map((lessonId) => ({
    user_id: userId,
    lesson_id: lessonId,
    track: "excel",
    status: "complete",
    score: 100,
    attempts: 1,
    wrong_count: 0,
    helped: false,
    first_try_accuracy: 100,
    best_ms: 1000,
    completed_at: at,
    last_seen_at: at,
  }));
  const response = await fetch(`${s.api}/rest/v1/lesson_progress`, {
    method: "POST",
    headers: {
      apikey: s.service,
      authorization: `Bearer ${s.service}`,
      "content-type": "application/json",
      prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify(rows),
  });
  if (!response.ok) {
    throw new Error(`could not seed progress: ${response.status} ${await response.text()}`);
  }
}

/** The signed-in learner's id. */
export function userIdOf(email) {
  const value = psql(`select id from auth.users where email = '${email.replace(/'/g, "''")}'`);
  if (!value) throw new Error(`no user for ${email}`);
  return value.trim();
}

/** Whether an account still exists, asked of the database rather than of the page. */
export function accountExists(email) {
  return psql(`select count(*) from auth.users where email = '${email.replace(/'/g, "''")}'`).trim() !== "0";
}
