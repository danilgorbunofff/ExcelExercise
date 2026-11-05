/**
 * The shortcut silo in a browser: the hub filter, the platform tabs, and the touch banner.
 *
 * `tests/shortcuts.test.js` proves the markup and the content gate; `node legacy/src/verify.mjs` proves
 * the bytes in `legacy/dist`. What none of them can answer is whether the script does what the page
 * promises — that a column hides, a canonical follows the tab, and a dismissal is still remembered
 * after a reload — which is the whole reason this file exists.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { loadSite } from "../lib/site.js";

const FAMILIES = loadSite().shortcuts;
const NAVIGATION = FAMILIES.find((shortcut) => shortcut.slug === "navigation");
const WINDOW_ONLY = FAMILIES.find((shortcut) => !shortcut.platforms.includes("sheets"));

test("the hub lists six families and filters them as you type", async ({ page }) => {
  const response = await page.goto("/shortcuts");
  expect(response.status()).toBe(200);

  for (const shortcut of FAMILIES) {
    await expect(page.locator(`#family-${shortcut.slug}`)).toBeVisible();
  }

  // The box is rendered hidden and revealed by the script, because a filter that does nothing is
  // worse than no filter. That it is visible here is the proof the script ran.
  const box = page.locator("#shortcut-search");
  await expect(box).toBeVisible();

  await box.fill("freeze");
  // Rows fall away, and a family whose rows all fell away goes with them: a heading over an empty
  // list is a page that looks broken.
  await expect(page.locator(".shortcut-family:not([hidden])")).toHaveCount(1);
  const visible = await page.locator(".shortcut-row:not([hidden])").allTextContents();
  expect(visible.length).toBeGreaterThan(0);
  for (const action of visible) expect(action.toLowerCase()).toContain("freeze");
  await expect(page.locator("#shortcut-filter-status")).toContainText("shortcut");

  await box.fill("");
  await expect(page.locator(".shortcut-row:not([hidden])")).toHaveCount(
    FAMILIES.reduce((total, shortcut) => total + shortcut.rows.length, 0),
  );
  await expect(page.locator("#shortcut-filter-status")).toHaveText("");
});

test("a family page shows one platform's column and links the others", async ({ page }) => {
  await page.goto(`/shortcuts/${NAVIGATION.slug}`);

  // Windows is the default tab, so its column is what a reader arrives at.
  await expect(page.locator('.platform-tab[aria-current="page"]')).toHaveText("Windows");
  await expect(page.locator('td[data-platform="windows"]').first()).toBeVisible();
  await expect(page.locator('td[data-platform="macos"]').first()).toBeHidden();

  // The tab is a link, not a widget: following it is the whole interaction, and it arrives at a
  // column of its own.
  await page.locator('.platform-tab[href$="?platform=macos"]').click();
  await expect(page).toHaveURL(new RegExp(`/shortcuts/${NAVIGATION.slug}\\?platform=macos$`));
  await expect(page.locator('td[data-platform="macos"]').first()).toBeVisible();
  await expect(page.locator('td[data-platform="windows"]').first()).toBeHidden();
  await expect(page.locator('.platform-tab[aria-current="page"]')).toHaveText("macOS");

  // Each tabbed state is its own address in the head as well, or the three states compete for one
  // search result. One canonical, not two: the app hydrates its own copy of the tag in after the
  // script has rewritten the first, and two canonicals that disagree are worse than none.
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
  const canonical = await page.locator('link[rel="canonical"]').getAttribute("href");
  expect(canonical).toMatch(new RegExp(`/shortcuts/${NAVIGATION.slug}\\?platform=macos$`));
  // The framework may leave its own `og:url` beside ours; what matters is that none of them tells a
  // scraper a different address than the canonical does.
  const ogUrls = await page.locator('meta[property="og:url"]').evaluateAll((metas) =>
    metas.map((meta) => meta.getAttribute("content")),
  );
  expect(ogUrls.length).toBeGreaterThan(0);
  expect([...new Set(ogUrls)]).toEqual([canonical]);
});

test("the tabs can be reached and followed from the keyboard", async ({ page }) => {
  await page.goto(`/shortcuts/${NAVIGATION.slug}`);
  const sheetless = page.locator('.platform-tab[href$="?platform=sheets"]');
  await expect(sheetless).toBeVisible();

  // Tab to the current tab, then walk one link further: the tabs come before the
  // table, so a keyboard reaches the choice before the content it changes.
  await page.locator('.platform-tab[href$="?platform=macos"]').focus();
  await expect(page.locator('.platform-tab[aria-current="page"]')).toHaveText("Windows");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp("\\?platform=macos$"));
  await expect(page.locator('td[data-platform="macos"]').first()).toBeVisible();
});

test("a family that offers no Sheets column does not grow one", async ({ page }) => {
  await page.goto(`/shortcuts/${WINDOW_ONLY.slug}`);
  await expect(page.locator(".platform-tab")).toHaveCount(WINDOW_ONLY.platforms.length);
  await expect(page.locator('.platform-tab[href$="?platform=sheets"]')).toHaveCount(0);
  await expect(page.locator('td[data-platform="sheets"]')).toHaveCount(0);
});

test("a cell with no default says so instead of inventing a chord", async ({ page }) => {
  // Windows always has a chord, so the cells that carry a note instead are on the other two tabs.
  const family = FAMILIES.find((shortcut) => shortcut.rows.some((row) => row.cells.macos?.none));
  await page.goto(`/shortcuts/${family.slug}?platform=macos`);
  const none = page.locator('td[data-platform="macos"] .keys-none').first();
  await expect(none).toBeVisible();
  await expect(none).toHaveText(/No default/);
});

test("the practice button opens the exercise on this build's address", async ({ page }) => {
  await page.goto(`/shortcuts/${NAVIGATION.slug}`);
  const cta = page.locator(".practice-cta a");
  await expect(cta).toBeVisible();
  // The app serves exercises at `/learn/excel/...`; the static edition at `/excel/...`. The button has to
  // name the one this build serves rather than lean on the redirect.
  await expect(cta).toHaveAttribute("href", `/learn/excel/${NAVIGATION.practice}`);
  await cta.click();
  await expect(page.locator("#main h1")).toBeVisible();
  expect(new URL(page.url()).pathname).toBe(`/learn/excel/${NAVIGATION.practice}`);
});

test("the shortcut pages pass an axe scan", async ({ page }) => {
  for (const path of ["/shortcuts", `/shortcuts/${NAVIGATION.slug}`, `/shortcuts/${NAVIGATION.slug}?platform=macos`]) {
    await page.goto(path);
    const { violations } = await new AxeBuilder({ page }).analyze();
    const blocking = violations.filter((violation) => ["critical", "serious"].includes(violation.impact));
    expect(blocking, `${path} has ${blocking.length} critical/serious finding(s)`).toEqual([]);
  }
});

test("every control on a shortcut page clears 24 by 24", async ({ page }) => {
  await page.goto(`/shortcuts/${NAVIGATION.slug}`);
  const small = await page.evaluate(() => {
    const found = [];
    for (const element of document.querySelectorAll("a[href], button, input, summary, [role='button']")) {
      const style = getComputedStyle(element);
      if (style.visibility === "hidden" || style.display === "none") continue;
      if (element.closest("[hidden], [aria-hidden='true'], .visually-hidden")) continue;
      // WCAG 2.5.8 exempts a link inside a sentence: it is sized by the line it sits on, and padding
      // it out would break the paragraph the author wrote.
      if (element.tagName === "A" && style.display === "inline") continue;
      const box = element.getBoundingClientRect();
      if (!box.width || !box.height) continue;
      if (box.width >= 24 && box.height >= 24) continue;
      found.push(`${element.tagName.toLowerCase()} "${element.textContent.trim().slice(0, 24)}" ${Math.round(box.width)}x${Math.round(box.height)}`);
    }
    return found;
  });
  expect(small).toEqual([]);
});

test.describe("a touch screen", () => {
  // `hasTouch` is what makes Chromium answer `(pointer: coarse)`, the query the banner asks.
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

  test("is told the exercise is the better path, once, and can dismiss it", async ({ page }) => {
    await page.goto(`/shortcuts/${NAVIGATION.slug}`);
    const banner = page.locator("#shortcuts-banner");
    await expect(banner).toBeVisible();
    await expect(banner.locator("a.btn-primary")).toHaveAttribute("href", "/excel-exercises");

    await banner.getByRole("button", { name: "Dismiss" }).click();
    await expect(banner).toBeHidden();

    // Remembered, or it is the first thing a returning reader meets every time.
    await page.reload();
    await expect(banner).toBeHidden();
  });
});

test("a fine pointer is never shown the banner", async ({ page }) => {
  await page.goto(`/shortcuts/${NAVIGATION.slug}`);
  await expect(page.locator("#shortcuts-banner")).toBeHidden();
});
