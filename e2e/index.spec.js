/**
 * The index is the page a crawler and a first-time reader both land on: every drill in the corpus must
 * be in the server-rendered HTML, linked to routes that answer 200.
 */
import { expect, test } from "@playwright/test";

import { seedBefore } from "../lib/seed.js";
import { loadSite } from "../lib/site.js";

const SLUGS = loadSite().index.map(({ slug }) => slug);

test("the index lists every drill, each one reachable", async ({ page, request }) => {
  await page.goto("/");

  const links = page.locator(".lesson-row a.lesson-link");
  await expect(links).toHaveCount(SLUGS.length);

  const hrefs = await links.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("href")));
  expect(hrefs.sort()).toEqual([...SLUGS].sort().map((slug) => `/learn/excel/${slug}`));

  for (const href of hrefs) {
    const response = await request.get(href);
    expect(response.status(), `${href} should answer 200`).toBe(200);
  }
});

test("the levels are disclosures, so 88 links are not 88 rows", async ({ page }) => {
  await page.goto("/");

  const levels = page.locator(".curriculum details.level");
  await expect(levels).toHaveCount(3);
  await expect(page.locator(".curriculum details.level[open]")).toHaveCount(1);

  // A closed level still carries its drills — that is why the page can be short and still complete.
  const closed = levels.nth(1);
  const rows = closed.locator(".lesson-row a.lesson-link");
  await expect(rows.first()).toHaveCount(1);

  // And opening it is one click on its heading, with no reload.
  await expect(rows.first()).toBeHidden();
  await closed.locator("summary").click();
  await expect(closed).toHaveAttribute("open", "");
  await expect(rows.first()).toBeVisible();
});

test("the client marks the page ready once the island mounts", async ({ page }) => {
  await page.goto("/");

  // The island sets this on `<html>` when it runs, so it also proves the module executed rather than
  // 404ing. The progress line is no longer the proof: a first-time reader has nothing complete.
  await expect(page.locator("html")).toHaveAttribute("data-track", "ready");
  await expect(page.locator("#track-progress")).toBeHidden();
});

test("the progress rail appears once there is progress to report", async ({ page }) => {
  await seedBefore(page, SLUGS[1]);
  await page.goto("/");

  await expect(page.locator("#track-progress")).toBeVisible();
  await expect(page.locator("#track-progress-note")).toHaveText(
    `1 of ${SLUGS.length} drills complete in this browser.`,
  );

  const width = await page
    .locator("#track-fill")
    .evaluate((node) => node.getBoundingClientRect().width);
  expect(width, "an empty rail is chrome, so it should not be drawn").toBeGreaterThan(0);
});
