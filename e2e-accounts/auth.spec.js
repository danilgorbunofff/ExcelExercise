// The session lifecycle, through the forms a learner actually uses.
//
// Phase 7's claim is that a deployment with accounts configured lets someone create an account, get
// back into it, and leave — and that the gate holds while signed out. Every test here drives the
// rendered form; none of them posts to GoTrue directly, because a silent API path would prove the
// server works while proving nothing about the surface it is supposed to be reachable from.

import { expect, test } from "@playwright/test";

import { address, forget, reset } from "./fixtures.js";

test.describe.configure({ mode: "serial" });

const made = [];

test.beforeAll(async () => {
  await reset();
});

test.afterAll(async () => {
  forget(...made);
});

test("signing up with a display name lands the learner in the drills, signed in", async ({ page }) => {
  const email = address("signup");
  made.push(email);

  await page.goto("/signup");
  const form = page.locator("form").filter({ has: page.locator('input[name="password"]') }).first();
  await form.locator('input[name="email"]').fill(email);
  await form.locator('input[name="password"]').fill("password123");
  await form.locator('input[name="display_name"]').fill("Signup Learner");
  await form.locator('button[type="submit"]').click();

  await page.waitForURL((url) => !url.pathname.startsWith("/signup"));
  expect(new URL(page.url()).pathname).toBe("/learn");

  // The session is a real cookie the server accepts, not a client-side illusion: /account renders it.
  await page.goto("/account");
  await expect(page.getByText(`Signed in as Signup Learner.`)).toBeVisible();
  await expect(page.getByText(email, { exact: false }).first()).toBeVisible();
});

test("a display name left empty routes the new account to onboarding first", async ({ page }) => {
  const email = address("onboarding");
  made.push(email);

  await page.goto("/signup");
  const form = page.locator("form").filter({ has: page.locator('input[name="password"]') }).first();
  await form.locator('input[name="email"]').fill(email);
  await form.locator('input[name="password"]').fill("password123");
  await form.locator('button[type="submit"]').click();

  await page.waitForURL((url) => !url.pathname.startsWith("/signup"));
  expect(new URL(page.url()).pathname).toBe("/account/profile");
});

test("a wrong password is refused with a sentence, not a redirect", async ({ page }) => {
  const email = address("wrong");
  made.push(email);

  await page.goto("/signup");
  const signup = page.locator("form").filter({ has: page.locator('input[name="password"]') }).first();
  await signup.locator('input[name="email"]').fill(email);
  await signup.locator('input[name="password"]').fill("password123");
  await signup.locator('input[name="display_name"]').fill("Wrong Password");
  await signup.locator('button[type="submit"]').click();
  await page.waitForURL((url) => url.pathname === "/learn");

  // A different browser: the account exists, the password this one types does not match.
  await page.context().clearCookies();
  await page.goto("/login");
  const login = page.locator("form").filter({ has: page.locator('input[name="password"]') }).first();
  await login.locator('input[name="email"]').fill(email);
  await login.locator('input[name="password"]').fill("not-the-password");
  await login.locator('button[type="submit"]').click();

  await expect(page.locator('[role="alert"]').first()).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/login");
});

test("a gated page sends a signed-out visitor to sign in and then honours where they were going", async ({
  page,
}) => {
  const email = address("next");
  made.push(email);

  await page.goto("/signup");
  const form = page.locator("form").filter({ has: page.locator('input[name="password"]') }).first();
  await form.locator('input[name="email"]').fill(email);
  await form.locator('input[name="password"]').fill("password123");
  await form.locator('input[name="display_name"]').fill("Deep Link");
  await form.locator('button[type="submit"]').click();
  await page.waitForURL((url) => url.pathname === "/learn");
  await page.context().clearCookies();

  // /account is one of the routes the proxy refuses without a session.
  await page.goto("/account");
  await page.waitForURL((url) => url.pathname === "/login");
  expect(new URL(page.url()).searchParams.get("next")).toBe("/account");

  const login = page.locator("form").filter({ has: page.locator('input[name="password"]') }).first();
  await login.locator('input[name="email"]').fill(email);
  await login.locator('input[name="password"]').fill("password123");
  await login.locator('button[type="submit"]').click();
  await page.waitForURL((url) => url.pathname === "/account");
  await expect(page.getByText("Signed in as Deep Link.")).toBeVisible();
});

test("signing out ends the session and the gate holds again", async ({ page }) => {
  const email = address("signout");
  made.push(email);

  await page.goto("/signup");
  const form = page.locator("form").filter({ has: page.locator('input[name="password"]') }).first();
  await form.locator('input[name="email"]').fill(email);
  await form.locator('input[name="password"]').fill("password123");
  await form.locator('input[name="display_name"]').fill("Sign Out");
  await form.locator('button[type="submit"]').click();
  await page.waitForURL((url) => url.pathname === "/learn");

  await page.goto("/account");
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL((url) => url.pathname === "/");

  await page.goto("/account");
  await page.waitForURL((url) => url.pathname === "/login");
});
