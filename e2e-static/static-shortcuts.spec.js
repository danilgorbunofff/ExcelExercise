/**
 * The shortcut silo on the static deployable.
 *
 * `node legacy/src/verify.mjs` crawls `legacy/dist/shortcuts/*` as HTML: it can see the four-column
 * table, the tabs and the script tag, but it never runs the script. This file loads the shipped bytes
 * in a browser, so "the static page's tabs and filter work" is a claim about the artefact rather than
 * about the template that produced it.
 */
import { expect, test } from "@playwright/test";

import { loadSite } from "../lib/site.js";

const FAMILIES = loadSite().shortcuts;
const NAVIGATION = FAMILIES.find((shortcut) => shortcut.slug === "navigation");

test("the static hub filters its own rows", async ({ page }) => {
  const response = await page.goto("/shortcuts/");
  expect(response.status()).toBe(200);
  for (const shortcut of FAMILIES) {
    await expect(page.locator(`a[href="/shortcuts/${shortcut.slug}"]`).first()).toBeVisible();
  }

  const box = page.locator("#shortcut-search");
  await expect(box).toBeVisible();
  await box.fill("freeze");
  await expect(page.locator(".shortcut-family:not([hidden])")).toHaveCount(1);
});

test("the static page keeps every column in the HTML and shows one", async ({ page }) => {
  const failures = [];
  page.on("console", (message) => {
    if (message.type() === "error") failures.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => failures.push(`pageerror: ${error.message}`));
  page.on("requestfailed", (request) => failures.push(`request: ${request.url()}`));

  await page.goto(`/shortcuts/${NAVIGATION.slug}/`);
  await expect(page.locator('td[data-platform="windows"]').first()).toBeVisible();
  await expect(page.locator('td[data-platform="macos"]').first()).toBeHidden();

  // Without a query string there is nothing to normalise, so the canonical is the page's own address.
  const canonical = await page.locator('link[rel="canonical"]').getAttribute("href");
  expect(new URL(canonical).pathname).toBe(`/shortcuts/${NAVIGATION.slug}`);
  expect(new URL(canonical).search).toBe("");

  expect(failures, `the static page failed to load: ${failures.join("; ")}`).toEqual([]);
});
