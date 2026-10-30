/**
 * The rail, on the device most learners actually use it on.
 *
 * Below the two-column breakpoint the rail becomes a strip of number chips and the lesson title moves
 * into the accessible name. That is the right shape for a phone — but the anchor used to be clipped to
 * a 1x1 box, so the number chip was a decorative span and the link underneath was not tappable: the
 * 85-lesson navigator could not be used at all on a phone or tablet. These tests measure the tap target
 * the browser actually resolves, not the markup's intent.
 *
 * Desktop is asserted in the same file because the fix lives inside the mobile media query, and the one
 * way to break the desktop rail is to let that branch leak.
 */
import { expect, test } from "@playwright/test";

import { freeDrill } from "../lib/site.js";

const FREE = freeDrill();

/** What the browser resolves at the centre of each rail anchor, and how big that anchor is.
 *  `elementFromPoint` only answers for the viewport, so each chip is scrolled to before it is asked. */
function railTargets(page) {
  return page.evaluate(() => {
    document.documentElement.style.scrollBehavior = "auto";
    const links = Array.from(document.querySelectorAll("a.rail-link"));
    return links.map((link) => {
      link.scrollIntoView({ block: "center", inline: "center" });
      const box = link.getBoundingClientRect();
      const hit = document
        .elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
        ?.closest("a");
      return {
        name: link.getAttribute("aria-label") || link.textContent.trim(),
        width: Math.round(box.width),
        height: Math.round(box.height),
        reachable: hit === link,
      };
    });
  });
}

test.describe("rail on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("every number chip is a tappable link, not a decorative span", async ({ page }) => {
    await page.goto(FREE.path);
    const targets = await railTargets(page);

    expect(targets.length).toBeGreaterThan(60);
    const unreachable = targets.filter((target) => !target.reachable);
    expect(unreachable, `chips the browser cannot resolve to their own link: ${JSON.stringify(unreachable.slice(0, 5))}`).toHaveLength(0);
  });

  test("every chip clears the 24x24 target-size floor", async ({ page }) => {
    await page.goto(FREE.path);
    const targets = await railTargets(page);

    const undersized = targets.filter((target) => target.width < 24 || target.height < 24);
    expect(undersized, `targets under 24x24: ${JSON.stringify(undersized.slice(0, 5))}`).toHaveLength(0);
  });
});

test.describe("rail on a desktop", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("the lesson title is still visible, as text", async ({ page }) => {
    await page.goto(FREE.path);
    const first = page.locator("a.rail-link").first();

    await expect(first).toBeVisible();
    await expect(first).toHaveCSS("text-indent", "0px");
    await expect(first).toHaveText(/\w/);
  });
});
