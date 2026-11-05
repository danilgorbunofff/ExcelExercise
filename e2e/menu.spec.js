/**
 * The drawer is the site's only navigation, so it is the one control that has to work on every page:
 * open from the header, close three ways, put focus back where it came from, and mark the page the
 * reader is already on. None of that is visible to a build-time test — the markup and the labels are
 * proven in `tests/chrome.test.js`; this file is the behaviour.
 */
import { expect, test } from "@playwright/test";

const PAGES = ["/", "/pricing", "/learn", "/learn/groups/lookup", "/privacy"];

test("the header opens the drawer on every kind of page", async ({ page }) => {
  for (const path of PAGES) {
    await page.goto(path);
    const toggle = page.locator("#menu-open");
    await expect(toggle, `${path} has no menu button`).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");

    await toggle.click();
    const drawer = page.locator("#site-menu");
    await expect(drawer, `${path} did not open its drawer`).toBeVisible();
    await expect(drawer).toHaveAttribute("open", "");
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(drawer.getByRole("link", { name: "Pricing" })).toBeVisible();

    // Escape is the browser's, not ours, which is the reason this is a `<dialog>`.
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
  }
});

test("the close button and the backdrop both close it", async ({ page }) => {
  await page.goto("/");
  const drawer = page.locator("#site-menu");

  await page.click("#menu-open");
  await expect(drawer).toBeVisible();
  await drawer.getByRole("button", { name: "Close" }).click();
  await expect(drawer).toBeHidden();

  // A click on the scrim lands on the dialog itself; the sheet stops its own.
  await page.click("#menu-open");
  await expect(drawer).toBeVisible();
  const sheet = await drawer.locator(".menu-sheet").boundingBox();
  await page.mouse.click(sheet.x + sheet.width + 40, sheet.y + sheet.height / 2);
  await expect(drawer).toBeHidden();
});

test("focus goes into the drawer and comes back to the button", async ({ page }) => {
  await page.goto("/");
  await page.click("#menu-open");
  await expect(page.locator("#site-menu .menu-close")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.locator("#menu-open")).toBeFocused();
});

test("the page the reader is on is the row that says so", async ({ page }) => {
  await page.goto("/pricing");
  await page.click("#menu-open");
  const current = page.locator("#site-menu a[aria-current='page']");
  await expect(current).toHaveCount(1);
  await expect(current).toHaveAttribute("href", "/pricing");

  // A lesson is not one of the drawer's own pages, so nothing claims to be the current row.
  await page.goto("/learn/excel/sum-basics");
  await page.click("#menu-open");
  await expect(page.locator("#site-menu a[aria-current='page']")).toHaveCount(0);
});

test("the drawer fits a phone without side scroll", async ({ page }) => {
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 720 });
    await page.goto("/");
    await page.click("#menu-open");
    await expect(page.locator("#site-menu")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `the open drawer pushes the document ${width}px wide`).toBeLessThanOrEqual(0);
    // Every row stays a target a thumb can find, on the narrowest phone the site supports.
    const small = await page.evaluate(() =>
      [...document.querySelectorAll("#site-menu .menu-row")].filter((row) => {
        const box = row.getBoundingClientRect();
        return box.width > 0 && box.height < 44;
      }).length,
    );
    expect(small, "a drawer row is under 44px tall").toBe(0);
  }
});
