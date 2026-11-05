// The feedback dialog with somewhere to send it: the delivered path the default suite cannot reach.
//
// In every other build `POST /api/feedback` answers 503 and the note stays in the browser — that is
// `e2e/feedback.spec.js` and `e2e-static/static-drill.spec.js`. Here the server has a service-role key,
// so the dialog's promise ("a person reads these") becomes a row, and the only honest proof is to read
// that row back with the service role after the browser has filed it.
//
// `tests/db/feedback.spec.js` proves the table's rules; this proves the wiring — the route, the address
// header, the session cookie for the account, and the copy the learner reads on success.

import { expect, test } from "@playwright/test";

import { address, forget, gotrue, reset, signIn } from "./fixtures.js";
import { rest } from "../tests/db/harness.mjs";

test.describe.configure({ mode: "serial" });

const made = [];

test.beforeAll(async () => {
  await reset();
});

test.afterAll(async () => {
  forget(...made);
});

const rows = async (route) => {
  const { body } = await rest(`feedback?select=user_id,page,body&page=eq.${encodeURIComponent(route)}`, {
    as: "service",
  });
  return body;
};

const file = async (page, { mood = "stuck", text, at = "/learn" }) => {
  await page.goto(at);
  await page.click("#feedback-open");
  await page.check(`input[name='mood'][value='${mood}']`);
  await page.fill("#feedback-text", text);
  await page.click("#feedback-form button[type='submit']");
};

test("a signed-out note reaches a person, and the dialog says it was sent", async ({ page }) => {
  // The front door, because a signed-out visitor here is one: the accounts build has PAYWALL on, so a
  // lesson URL would redirect before the dialog was reachable.
  const route = "/";
  const text = "signed out, and the second step lost me";
  await file(page, { text, at: route });

  await expect(page.locator("#feedback-done-note")).toContainText("Sent.");
  // Case-folded: the promise opens a sentence in the dialog, and the probe does not need its capital.
  await expect(page.locator("#feedback-done-note")).toContainText(/a person reads these/i);

  // No queue: the local copy only exists when the post failed, and this one did not.
  const queue = await page.evaluate(() => JSON.parse(localStorage.getItem("es.feedback") ?? "[]"));
  expect(queue).toEqual([]);

  const saved = await rows(route);
  expect(saved).toHaveLength(1);
  expect(saved[0]).toMatchObject({ user_id: null, page: route, body: text });
});

test("a signed-in note carries the account it came from", async ({ page }) => {
  const email = address("feedback");
  made.push(email);
  await gotrue("signup", { body: { email, password: "password123" } });
  await signIn(page, email);

  const text = "signed in, and the copy on the pricing page is unclear";
  await file(page, { mood: "clicked", text, at: "/" });
  await expect(page.locator("#feedback-done-note")).toContainText("Sent.");

  const saved = await rows("/");
  const mine = saved.find((row) => row.body === text);
  expect(mine).toBeTruthy();
  expect(mine.user_id).toEqual(expect.any(String));
});

test("thirteen notes in ten minutes is a refusal, not a silent drop", async ({ request }) => {
  const body = { mood: "stuck", text: "rate limit probe", page: "/" };
  let last;
  for (let i = 0; i < 13; i += 1) {
    last = await request.post("/api/feedback", { data: body });
  }
  expect(last.status()).toBe(429);
  expect(last.headers()["retry-after"]).toMatch(/^\d+$/);
  expect((await last.json()).error).toBe("too_many_notes");
});
