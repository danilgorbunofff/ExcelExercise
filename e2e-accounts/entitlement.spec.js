// The paywall, end to end: a price is charged, the webhook says so, the drill opens, a refund closes it.
//
// The entitlement is a database fact read by the request (`is_entitled`), so this suite never has to
// trust a cookie: after the signed webhook lands, the *next* navigation is a different answer. That is
// the whole claim of phase 4 in one spec.

import { expect, test } from "@playwright/test";

import {
  PAID_LESSON,
  PROMPT_LESSON,
  address,
  deliver,
  forget,
  gotrue,
  lifetimeEvent,
  refundEvent,
  reset,
  signUpThroughForm,
  userIdOf,
} from "./fixtures.js";

test.describe.configure({ mode: "serial" });

const made = [];

test.beforeAll(async () => {
  await reset();
});

test.afterAll(async () => {
  forget(...made);
});

test("a walled drill is refused to a signed-out visitor before any session work happens", async ({
  page,
}) => {
  await page.goto(PAID_LESSON);
  await page.waitForURL((url) => url.pathname === "/pricing");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("the prompt drill is served, because its wall is a button the browser paints", async ({ page }) => {
  // The exception is deliberate and easy to lose: lesson 4 is past the free three, but its drill
  // offers "continue free this once", and a redirect on the request would make that button
  // unreachable. So the offer is served and only lesson 5 is refused.
  const response = await page.goto(PROMPT_LESSON);
  expect(response.status()).toBe(200);
  expect(new URL(page.url()).pathname).toBe(PROMPT_LESSON);
  await expect(page.locator("#exercise-data")).toHaveCount(1);
});

test("a signed-in learner without a purchase is still refused, and a purchase opens the same URL", async ({
  page,
  request,
}) => {
  const email = address("paywall");
  made.push(email);

  await signUpThroughForm(page, email, "Paywall Learner");
  const userId = userIdOf(email);

  // Signed in, unpaid: the same wall. A session is not a payment.
  await page.goto(PAID_LESSON);
  await page.waitForURL((url) => url.pathname === "/pricing");

  // The webhook is the only thing that may say someone paid, and it answers the signature.
  const purchase = await deliver(request, lifetimeEvent(userId, "paywall"));
  expect(purchase.status).toBe(200);
  expect(purchase.body.applied).toBe(true);

  // No re-login, no token refresh: the next request asks the database.
  await page.goto(PAID_LESSON);
  expect(new URL(page.url()).pathname).toBe(PAID_LESSON);
  await expect(page.locator("#exercise-data")).toHaveCount(1);

  // And the account says the same thing the route says.
  await page.goto("/account");
  await expect(page.getByText("Paid", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Manage billing or cancel" })).toBeVisible();
});

test("a replayed delivery grants nothing twice", async ({ request }) => {
  const email = address("replay");
  made.push(email);

  const signup = await gotrue("signup", {
    body: { email, password: "password123", data: { display_name: "Replay" } },
  });
  expect(signup.status).toBe(200);
  const userId = userIdOf(email);

  const event = lifetimeEvent(userId, "replay");
  const first = await deliver(request, event);
  const again = await deliver(request, event);
  expect(first.body.applied).toBe(true);
  expect(again.status).toBe(200);
  expect(again.body.applied).toBe(false);
  expect(again.body.reason).toBe("duplicate");
});

test("a refund takes the entitlement away and the drill closes again", async ({ page, request }) => {
  const email = address("refund");
  made.push(email);

  await signUpThroughForm(page, email, "Refund Learner");
  const userId = userIdOf(email);

  await deliver(request, lifetimeEvent(userId, "purchase"));
  await page.goto(PAID_LESSON);
  expect(new URL(page.url()).pathname).toBe(PAID_LESSON);

  const refund = await deliver(request, refundEvent("refund"));
  expect(refund.status).toBe(200);

  await page.goto(PAID_LESSON);
  await page.waitForURL((url) => url.pathname === "/pricing");
});

test("a forged signature is refused and changes nothing", async ({ page, request }) => {
  const email = address("forged");
  made.push(email);
  await signUpThroughForm(page, email, "Forged Learner");
  const userId = userIdOf(email);

  const event = lifetimeEvent(userId, "forged");
  const body = JSON.stringify({ id: event.id, type: event.type, data: { object: event.object } });
  const response = await request.post("/api/stripe/webhook", {
    headers: { "content-type": "application/json", "stripe-signature": "t=1,v1=" + "0".repeat(64) },
    data: body,
  });
  expect(response.status()).toBe(400);

  await page.goto(PAID_LESSON);
  await page.waitForURL((url) => url.pathname === "/pricing");
});
