/**
 * The index is the page a crawler and a first-time reader both land on: all ten drills must be in
 * the server-rendered HTML, linked to routes that answer 200.
 */
import { expect, test } from "@playwright/test";

const SLUGS = [
  "average-scores",
  "capstone-margin",
  "countif-open-tickets",
  "if-pass-fail",
  "index-match",
  "left-find-prefix",
  "round-markup",
  "sum-basics",
  "sumif-region",
  "vlookup-exact",
];

test("the index lists all ten drills, each one reachable", async ({ page, request }) => {
  await page.goto("/");

  const links = page.locator(".lesson-row a.lesson-link");
  await expect(links).toHaveCount(10);

  const hrefs = await links.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("href")));
  expect(hrefs.sort()).toEqual(SLUGS.map((slug) => `/learn/excel/${slug}`).sort());

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
  await expect(page.locator("#track-progress-note")).toHaveText("0 of 10 drills complete.");
});
