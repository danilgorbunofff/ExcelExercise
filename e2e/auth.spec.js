/**
 * The account routes in the state CI runs them in: no Supabase project configured.
 *
 * That is not a degenerate case to skip past — it is the state a fresh clone and every CI run are in,
 * and it is the one that decides whether the drills keep working for someone who never signs up. The
 * configured path is proved against the real stack by `tests/db/auth.spec.js`; this file proves the
 * pages render, say what is wrong, and cannot be used as an open redirect.
 */
import { expect, test } from "@playwright/test";

test("the sign-in page explains that accounts are off and disables the form", async ({ page }) => {
  await page.goto("/login");
  await expect(page.locator(".auth-card h1")).toHaveText("Sign in");
  await expect(page.locator(".auth-notice")).toContainText("Accounts are not configured");
  await expect(page.locator("input[name=email]")).toBeDisabled();
  await expect(page.locator(".auth-submit")).toBeDisabled();
});

test("the sign-up and reset pages say the same thing", async ({ page }) => {
  for (const [path, heading] of [
    ["/signup", "Create an account"],
    ["/reset", "Reset your password"],
  ]) {
    await page.goto(path);
    await expect(page.locator(".auth-card h1")).toHaveText(heading);
    await expect(page.locator(".auth-notice")).toContainText("Accounts are not configured");
  }
});

test("the account page renders without a session instead of throwing", async ({ page }) => {
  const response = await page.goto("/account");
  expect(response.status()).toBe(200);
  await expect(page.locator(".auth-card h1")).toHaveText("Your account");
  await expect(page.locator(".auth-notice")).toContainText("Accounts are not configured");
});

test("the auth pages stay out of the index", async ({ page }) => {
  for (const path of ["/login", "/signup", "/account"]) {
    await page.goto(path);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  }
});

test("the callback route refuses to bounce anywhere it was told", async ({ request }) => {
  // Unconfigured, so no code exchange is attempted at all; the interesting part is that `next` never
  // reaches a Location header it could abuse.
  const response = await request.get("/auth/callback?next=//evil.com", { maxRedirects: 0 });
  expect(response.status()).toBe(307);

  // Next answers with an absolute Location built from the request's own Host header, so the assertion
  // is about where it lands, not how it is spelled: our origin, the login page, no query.
  const target = new URL(response.headers().location, "http://127.0.0.1:4174");
  expect(target.pathname).toBe("/login");
  expect(target.search).toBe("");
  expect(["127.0.0.1:4174", "localhost:4174"]).toContain(target.host);
});
