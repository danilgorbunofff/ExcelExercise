/**
 * The problem silo on the static deployable.
 *
 * `node legacy/src/verify.mjs` crawls `legacy/dist/formulas/*` as HTML: it can see the exercise island, the
 * inline fixture and the script tag, but it never runs them. The Next route is driven for real in
 * `e2e/formulas.spec.js`; this file is the same claim about the bytes in `legacy/dist`, which is the
 * other thing we deploy.
 */
import { expect, test } from "@playwright/test";

import { loadSite } from "../lib/site.js";

const FORMULAS = loadSite().formulas;
const COUNT = { slug: "count-only-the-numbers-with-count", answer: "=COUNT(B2:B7)" };

test("the static hub lists every problem page", async ({ page }) => {
  const response = await page.goto("/formulas/");
  expect(response.status()).toBe(200);

  for (const formula of FORMULAS) {
    await expect(page.locator(`a[href="/formulas/${formula.slug}"]`).first()).toBeVisible();
  }
});

test("the static page grades a formula with the module graph over plain HTTP", async ({ page }) => {
  const failures = [];
  page.on("console", (message) => {
    if (message.type() === "error") failures.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => failures.push(`pageerror: ${error.message}`));
  page.on("requestfailed", (request) => failures.push(`request: ${request.url()}`));

  await page.goto(`/formulas/${COUNT.slug}/`);
  const input = page.locator("#article-answer-1");
  await expect(input).toBeVisible();

  await page.fill("#article-answer-1", COUNT.answer);
  await page.locator('#article-drill-form-1 button[type="submit"]').click();
  await expect(page.locator("#article-feedback-1")).toHaveAttribute("data-tone", "ok");
  await expect(input).toHaveAttribute("readonly", "");

  expect(failures, `the static page failed to load: ${failures.join("; ")}`).toEqual([]);
});
