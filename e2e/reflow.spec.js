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
  ["a drill", `/learn/excel/${freeDrill().slug}`],
  ["the dashboard", "/dashboard"],
  ["the sign-in form", "/login"],
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

test("the call to action wraps on a phone instead of running off the page", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const cta = page.locator(".cta-row .btn-primary").first();
  const box = await cta.evaluate((element) => {
    const own = element.getBoundingClientRect();
    return {
      right: Math.round(own.right),
      width: Math.round(own.width),
      height: Math.round(own.height),
      line: parseFloat(getComputedStyle(element).lineHeight),
      label: element.textContent.trim(),
    };
  });

  expect(box.right).toBeLessThanOrEqual(390);
  expect(box.label.startsWith("Do drill 1")).toBe(true);
  // Two lines, not one long one: the label is longer than the phone is wide.
  expect(box.height).toBeGreaterThan(box.line * 1.5);
});
