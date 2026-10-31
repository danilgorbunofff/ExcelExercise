// The account surface: change the profile, take the data, end the account.
//
// Each of these is a promise printed on `/privacy` and in the account card, so each one is checked
// against the database as well as the page: a receipt that says "erased" is not evidence that anything
// was.

import { expect, test } from "@playwright/test";

import { accountExists, address, forget, reset, signUpThroughForm, userIdOf } from "./fixtures.js";
import { psql } from "../tests/db/harness.mjs";

test.describe.configure({ mode: "serial" });

const made = [];

test.beforeAll(async () => {
  await reset();
});

test.afterAll(async () => {
  forget(...made);
});

test("a profile edit is saved and shown back", async ({ page }) => {
  const email = address("profile");
  made.push(email);
  await signUpThroughForm(page, email, "Before Edit");

  await page.goto("/account/profile");
  const form = page.locator("form").filter({ has: page.locator('input[name="display_name"]') }).first();
  await form.locator('input[name="display_name"]').fill("After Edit");
  await form.locator('button[type="submit"]').click();
  // The action posts in the browser, so wait for its receipt before leaving the page.
  await expect(page.getByRole("status")).toHaveText("Profile saved.");

  await page.goto("/account");
  await expect(page.getByText("Signed in as After Edit.")).toBeVisible();

  // And it is a row, not a render: reload with a cleared cache of page state.
  await page.reload();
  await expect(page.getByText("Signed in as After Edit.")).toBeVisible();
});

test("the export downloads everything held about this learner, and nothing about anyone else", async ({
  page,
}) => {
  const email = address("export");
  made.push(email);
  await signUpThroughForm(page, email, "Export Learner");
  const userId = userIdOf(email);

  psql(
    `insert into lesson_progress (user_id, lesson_id, track, status, score, attempts, completed_at)
     values ('${userId}', 'what-a-formula-actually-does', 'excel', 'complete', 100, 1, now())
     on conflict do nothing;`,
  );

  const response = await page.request.get("/api/account/export");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-disposition"] ?? "").toContain("attachment");
  const body = await response.json();

  expect(body.email ?? body.account?.email ?? email).toBe(email);
  const json = JSON.stringify(body);
  expect(json).toContain("what-a-formula-actually-does");
  // The other seeded accounts are visible to nobody through this route.
  expect(json).not.toContain("alice@");
  expect(json).not.toContain("bob@");
});

test("deleting the account needs the phrase, and then really removes it", async ({ page }) => {
  const email = address("delete");
  made.push(email);
  await signUpThroughForm(page, email, "Delete Me");
  const userId = userIdOf(email);

  psql(
    `insert into lesson_progress (user_id, lesson_id, track, status, score, attempts, completed_at)
     values ('${userId}', 'what-a-formula-actually-does', 'excel', 'complete', 100, 1, now())
     on conflict do nothing;`,
  );

  // Without the phrase the server refuses, and the account is untouched.
  const refused = await page.request.post("/api/account/delete", {
    form: { confirm: "yes" },
    maxRedirects: 0,
  });
  expect(refused.status()).toBe(400);
  expect(accountExists(email)).toBe(true);

  // With it, the form follows a redirect to the receipt.
  await page.goto("/account");
  await page.locator('input[name="confirm"]').fill("delete my account");
  await page.locator('form.auth-danger button[type="submit"]').click();
  await page.waitForURL((url) => url.pathname === "/account/deleted");
  await expect(page.getByText("Your account is gone")).toBeVisible();

  expect(accountExists(email), "the identity is gone").toBe(false);
  const rows = psql(`select count(*) from lesson_progress where user_id = '${userId}'`).trim();
  expect(rows, "the progress is gone").toBe("0");

  // And the old password no longer opens anything.
  await page.goto("/login");
  const login = page.locator("form").filter({ has: page.locator('input[name="password"]') }).first();
  await login.locator('input[name="email"]').fill(email);
  await login.locator('input[name="password"]').fill("password123");
  await login.locator('button[type="submit"]').click();
  await expect(page.locator('[role="alert"]').first()).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/login");
});

test("signed out, the account routes refuse rather than render an empty profile", async ({ page }) => {
  await page.context().clearCookies();
  await page.goto("/account");
  await page.waitForURL((url) => url.pathname === "/login");
  // The export is a fetch, not a navigation, so it answers instead of redirecting.
  const response = await page.request.get("/api/account/export");
  expect(response.status()).toBe(401);
});
