/**
 * The index is the page a crawler and a first-time reader both land on: every drill in the corpus must
 * be in the server-rendered HTML, linked to routes that answer 200.
 */
import { expect, test } from "@playwright/test";

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

test("the client paints the track progress once it mounts", async ({ page }) => {
  await page.goto("/");

  // `#track-progress` ships hidden and is only unhidden by the client island, so this also proves
  // the module executed rather than 404ing.
  await expect(page.locator("#track-progress")).toBeVisible();
  await expect(page.locator("#track-progress-note")).toHaveText(`0 of ${SLUGS.length} drills complete.`);
});
