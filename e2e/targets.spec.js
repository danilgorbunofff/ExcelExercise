/**
 * Target sizes, measured rather than assumed. WCAG 2.2 AA (2.5.8) asks for 24 by 24 CSS pixels; the
 * phone branch asks 44 of the controls a thumb has to find. Both are properties of the laid-out box,
 * so no build-time test can see them: the footer links and the drill rail were 17px tall in source and
 * only a browser could say so.
 */
import { expect, test } from "@playwright/test";

import { freeDrill } from "../lib/site.js";

const MIN = 24;

/** Every control the visitor can hit, with the box it actually paints, below the floor. */
async function undersized(page, floor) {
  return page.evaluate((floor) => {
    const selector =
      'a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"]';
    const found = [];
    for (const element of document.querySelectorAll(selector)) {
      const style = getComputedStyle(element);
      if (style.visibility === "hidden" || style.display === "none") continue;
      // A closed dialog, a hidden gate and a screen-reader label are on the page but not on screen.
      if (element.closest("[hidden], dialog:not([open]), .visually-hidden, [aria-hidden='true']")) {
        continue;
      }
      const box = element.getBoundingClientRect();
      if (!box.width || !box.height) continue;
      if (box.width >= floor && box.height >= floor) continue;
      const name =
        element.getAttribute("aria-label") ||
        element.textContent.trim() ||
        element.getAttribute("name") ||
        element.type ||
        "";
      found.push(
        `${element.tagName.toLowerCase()} "${name.slice(0, 30)}" ${Math.round(box.width)}x${Math.round(box.height)}`,
      );
    }
    return found;
  }, floor);
}

const PAGES = [
  ["the index", "/"],
  ["the offer page", "/pricing"],
  ["a drill", `/learn/excel/${freeDrill().slug}`],
  ["the sign-in form", "/login"],
];

for (const [label, path] of PAGES) {
  test(`every control on ${label} clears 24 by 24`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    expect(await undersized(page, MIN)).toEqual([]);
  });
}

test("the smallest controls grow to a thumb target on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const footer = await page.evaluate(() =>
    [...document.querySelectorAll(".foot a, .foot-feedback")].map((element) => ({
      name: element.textContent.trim().slice(0, 24),
      height: Math.round(element.getBoundingClientRect().height),
    })),
  );
  expect(footer.length).toBeGreaterThan(3);
  expect(footer.filter((link) => link.height < 44)).toEqual([]);

  // The rail is the exception the phone branch made on purpose: 85 chips cannot each be 44px tall, so
  // they are 30px boxes covering their row rather than 1px boxes covering nothing.
  await page.goto(`/learn/excel/${freeDrill().slug}`);
  const rail = await page.evaluate(() =>
    [...document.querySelectorAll("a.rail-link")].map((element) => {
      const box = element.getBoundingClientRect();
      return Math.round(Math.min(box.width, box.height));
    }),
  );
  expect(rail.length).toBeGreaterThan(10);
  expect(rail.filter((side) => side < MIN)).toEqual([]);

  await page.goto("/login");
  // The auth shell renders its forms hidden until it has asked whether someone is already signed in.
  await page.locator(".auth-submit").first().waitFor({ state: "visible" });
  const form = await page.evaluate(() =>
    [...document.querySelectorAll(".auth-field input, .auth-submit")].map((element) =>
      Math.round(element.getBoundingClientRect().height),
    ),
  );
  expect(form.length).toBeGreaterThan(1);
  expect(form.filter((height) => height < 44)).toEqual([]);
});
