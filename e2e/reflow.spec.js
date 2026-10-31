/**
 * Reflow (WCAG 2.2 AA 1.4.10): a page must not scroll sideways at 320px. The index used to, by 70px,
 * because `.btn` set `white-space: nowrap` on a 46-character call to action with no row to wrap into.
 * Both halves of that are measured here: the document must fit the viewport, and the call to action
 * must be the thing that gave, rather than a clipped edge somewhere else on the page.
 */
import { expect, test } from "@playwright/test";

import { freeDrill } from "../lib/site.js";

const PAGES = [
  ["the index", "/"],
  ["the offer page", "/pricing"],
  ["the track list", "/learn"],
  ["the project shelf", "/projects"],
  ["a project", "/learn/projects/ufo-dashboard"],
  ["a drill", `/learn/excel/${freeDrill().slug}`],
  ["the dashboard", "/dashboard"],
  ["the sign-in form", "/login"],
  // The app surfaces below are only reachable from the dashboard's "Your tools" menu, which is exactly
  // why they had no reflow coverage: `/flashcards` pushed the document 2px wide at 320px because its
  // header carries a third nowrap item, the badge.
  ["the flashcard review", "/flashcards"],
  ["the daily run", "/daily"],
  ["the leaderboard", "/leaderboard"],
  ["the certificate page", "/certificate"],
  ["a certificate that does not exist", "/verify/nope"],
  ["the account page", "/account"],
  ["the sign-up form", "/signup"],
  ["the reset form", "/reset"],
  ["a group page", "/learn/groups/lookup"],
  ["the privacy page", "/privacy"],
  ["the terms page", "/terms"],
];

const WIDTHS = [320, 390];

for (const width of WIDTHS) {
  test(`nothing scrolls sideways at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 720 });
    const wide = [];
    for (const [label, path] of PAGES) {
      await page.goto(path);
      const overflow = await page.evaluate(() => {
        const viewport = document.documentElement.clientWidth;
        const past = [...document.querySelectorAll("main *, footer *")]
          .filter((element) => !element.closest(".visually-hidden"))
          .filter((element) => element.getBoundingClientRect().right > viewport + 1)
          .map((element) => `${element.tagName.toLowerCase()}.${String(element.className)}`);
        return { scrollWidth: document.documentElement.scrollWidth, viewport, past: past.slice(0, 3) };
      });
      if (overflow.scrollWidth > overflow.viewport) {
        wide.push(`${label}: ${overflow.scrollWidth}px in ${overflow.viewport}px (${overflow.past})`);
      }
    }
    expect(wide).toEqual([]);
  });
}

test("the call to action fits a phone instead of running off the page", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const cta = page.locator(".cta-row .btn-primary").first();
  const box = await cta.evaluate((element) => {
    const own = element.getBoundingClientRect();
    return {
      left: Math.round(own.left),
      right: Math.round(own.right),
      clipped: element.scrollWidth > element.clientWidth + 1,
      label: element.textContent.trim(),
    };
  });

  // The label itself is allowed to change; the failure this test exists for is a button that pushes
  // the page sideways or eats its own text on the narrowest screen we support.
  expect(box.left).toBeGreaterThanOrEqual(0);
  expect(box.right).toBeLessThanOrEqual(390);
  expect(box.clipped, `${box.label} is clipped by its own button`).toBe(false);
});
