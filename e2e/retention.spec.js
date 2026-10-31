/**
 * The daily challenge in the state CI runs it in: no Supabase project configured.
 *
 * The pages have to answer without a session — that is the state of a fresh clone and every CI run —
 * and the API has to say why it cannot run rather than 500 or, worse, hand back a challenge it could
 * not grade. The configured path is proved against the real stack by `tests/db/challenge.spec.js`; the
 * draw, the payload and the grading are proved by `tests/retention-challenge.test.js`.
 */
import { expect, test } from "@playwright/test";

test("the challenge page explains that accounts are off", async ({ page }) => {
  const response = await page.goto("/daily");
  expect(response.status()).toBe(200);
  await expect(page.locator(".auth-card h1")).toHaveText("Daily challenge");
  await expect(page.locator(".auth-notice")).toContainText("Accounts are not configured");
  await expect(page.locator("table")).toHaveCount(0);
});

test("the run page does not start a clock it cannot score", async ({ page }) => {
  const response = await page.goto("/daily/run");
  expect(response.status()).toBe(200);
  await expect(page.locator(".auth-card h1")).toHaveText("Today's run");
  await expect(page.locator(".auth-notice")).toContainText("Accounts are not configured");
  await expect(page.locator(".auth-submit")).toHaveCount(0);
});

test("both pages stay out of the index", async ({ page }) => {
  for (const path of ["/daily", "/daily/run"]) {
    await page.goto(path);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  }
});

test("the challenge API refuses rather than guessing", async ({ request }) => {
  const response = await request.post("/api/daily", { data: { action: "start" } });
  expect(response.status()).toBe(503);
  expect(await response.json()).toEqual({ ok: false, error: "daily_unconfigured" });
});
