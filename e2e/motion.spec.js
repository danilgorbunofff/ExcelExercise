/**
 * Things that open, close and change move for 180ms, and only for readers who have not asked for less.
 *
 * The other specs prove the states are right; this one proves the movement is there when it should be
 * and absent when it should not. It reads computed style rather than screenshots, because a frame
 * grabbed mid-transition is a test that fails one run in ten.
 */
import { expect, test } from "@playwright/test";

const seconds = (value) => Number.parseFloat(value.split(",")[0]);

test.describe("with no preference", () => {
  test.use({ reducedMotion: "no-preference" });

  test("the drawer slides in and is fully gone once it has left", async ({ page }) => {
    await page.goto("/pricing");
    const drawer = page.locator("#site-menu");
    await expect(drawer).toBeHidden();
    await page.locator("#menu-open").click();
    await expect(drawer).toBeVisible();
    // The sheet ends at its resting place, and the menu button has become a cross.
    await expect.poll(() => drawer.evaluate((node) => getComputedStyle(node).translate)).toMatch(/^(0px|0%|none|0px 0px)$/);
    await expect
      .poll(() => page.locator("#menu-open .menu-bars").evaluate((node) => getComputedStyle(node, "::before").rotate))
      .toBe("45deg");
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
    await expect(page.locator("#menu-open")).toHaveAttribute("aria-expanded", "false");
  });

  test("the drawer declares a transition, so the slide is real", async ({ page }) => {
    await page.goto("/pricing");
    const duration = await page.locator("#site-menu").evaluate((node) => getComputedStyle(node).transitionDuration);
    expect(seconds(duration)).toBeGreaterThan(0);
    expect(seconds(duration)).toBeLessThanOrEqual(0.2);
  });

  test("a fold opens to its full height and closes to nothing", async ({ page }) => {
    await page.goto("/pricing");
    const fold = page.locator("details.faq").first();
    const body = () => fold.evaluate((node) => getComputedStyle(node, "::details-content").blockSize);
    const supported = await page.evaluate(() => CSS.supports("selector(::details-content)"));
    test.skip(!supported, "this browser opens a fold instantly, which is the fallback");
    await fold.locator("summary").click();
    await expect.poll(async () => Number.parseFloat(await body())).toBeGreaterThan(10);
    await fold.locator("summary").click();
    await expect.poll(async () => Number.parseFloat(await body())).toBe(0);
    await expect(fold).not.toHaveAttribute("open", "");
  });

  test("the pricing switch moves its pill to the chosen term", async ({ page }) => {
    await page.goto("/pricing");
    const track = page.locator(".term-track");
    const shift = () => track.evaluate((node) => getComputedStyle(node, "::before").translate);
    const before = await shift();
    await page.locator('label[for="term-annual"]').click();
    await expect.poll(shift).not.toBe(before);
    await expect(page.locator('[data-plan="annual"]')).toBeVisible();
  });
});

test.describe("when the reader asks for less", () => {
  test.use({ reducedMotion: "reduce" });

  test("nothing slides, fades or rises", async ({ page }) => {
    await page.goto("/pricing");
    const drawerDuration = await page.locator("#site-menu").evaluate((node) => getComputedStyle(node).transitionDuration);
    expect(seconds(drawerDuration)).toBe(0);
    // The pill exists only inside the opt-in block, so there is nothing to slide.
    const pill = await page
      .locator(".term-track")
      .evaluate((node) => getComputedStyle(node, "::before").content);
    expect(["none", "normal"]).toContain(pill);
    const foldDuration = await page
      .locator("details.faq")
      .first()
      .evaluate((node) => getComputedStyle(node, "::details-content").transitionDuration);
    expect(seconds(foldDuration)).toBe(0);
    // The states still change: the drawer opens and the term panel swaps.
    await page.locator("#menu-open").click();
    await expect(page.locator("#site-menu")).toBeVisible();
    await page.keyboard.press("Escape");
    await page.locator('label[for="term-semiannual"]').click();
    await expect(page.locator('[data-plan="semiannual"]')).toBeVisible();
  });
});
