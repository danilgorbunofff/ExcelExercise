/**
 * The search box, in a browser.
 *
 * `tests/search.test.js` proves the ranking and the markup. What only the running app can prove is the
 * part a learner actually touches: that the inline index survives Next's prerender, that the copied
 * engine loads from `/assets/search/`, and that the keyboard a combobox promises — arrows, Enter,
 * Escape — really moves focus and navigation.
 */
import { expect, test } from "@playwright/test";

test("a learner types a job and the exercise that teaches it comes up", async ({ page }) => {
  await page.goto("/search");

  const box = page.getByRole("combobox", { name: "Search the exercises" });
  await box.fill("count blanks");

  const first = page.getByRole("option").first();
  await expect(first).toBeVisible();
  await expect(first).toContainText("COUNTA");
  await expect(page.locator("#search-status")).toContainText('results for "count blanks"');
});

test("arrows move through the answers and Enter opens one", async ({ page }) => {
  await page.goto("/search");

  const box = page.getByRole("combobox", { name: "Search the exercises" });
  await box.fill("lookup");

  await expect(page.getByRole("option").first()).toBeVisible();
  await box.press("ArrowDown");
  const selected = page.getByRole("option", { selected: true });
  await expect(selected).toHaveCount(1);
  await expect(box).toHaveAttribute("aria-expanded", "true");

  const href = await selected.locator("a").getAttribute("href");
  await box.press("Enter");
  await expect(page).toHaveURL(new RegExp(`${href.replace(/[/\\^$*+?.()|[\]{}]/g, "\\$&")}$`));
});

test("Escape clears the box and the list closes", async ({ page }) => {
  await page.goto("/search");

  const box = page.getByRole("combobox", { name: "Search the exercises" });
  await box.fill("remove duplicates");
  await expect(page.getByRole("option").first()).toBeVisible();

  await box.press("Escape");
  await expect(box).toHaveValue("");
  await expect(page.getByRole("option")).toHaveCount(0);
  await expect(box).toHaveAttribute("aria-expanded", "false");
});

test("a query with no exercise says so instead of guessing", async ({ page }) => {
  await page.goto("/search");
  await page.getByRole("combobox", { name: "Search the exercises" }).fill("regression solver");

  await expect(page.locator("#search-status")).toContainText('No exercise covers "regression solver"');
  await expect(page.getByRole("option")).toHaveCount(0);
});

test("a link to a search opens on its answers", async ({ page }) => {
  await page.goto("/search?q=days%20between%20dates");

  await expect(page.getByRole("combobox", { name: "Search the exercises" })).toHaveValue("days between dates");
  await expect(page.getByRole("option").first()).toContainText("DATEDIF");
});

test("the header has a way in from every page, and the page lists the whole track beneath the box", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Search", exact: true }).click();
  await expect(page).toHaveURL(/\/search$/);

  // With no script run at all, the page is still an index: every exercise is a link on it.
  const listed = page.locator("#search-all a[href^='/learn/excel/']");
  expect(await listed.count()).toBeGreaterThanOrEqual(80);
});

/**
 * A row without an exercise number still starts at the title column.
 *
 * The result grid reserves 2.5rem for the number, and only catalogue entries have one — function notes,
 * problem pages, shortcut families and skill groups do not. With the title auto-placed, it landed in
 * that 2.5rem column and wrapped at every word, which is what a reader searching `sum` saw.
 */
test("a result with no number keeps its title in the title column", async ({ page }) => {
  await page.goto("/search");
  await page.getByRole("combobox", { name: "Search the exercises" }).fill("sum");

  const note = page.getByRole("option").filter({ hasText: "Function note" }).first();
  await expect(note).toBeVisible();
  await expect(note.locator(".search-num")).toHaveCount(0);

  const title = note.locator(".search-title");
  const box = await title.boundingBox();
  expect(box.width, "the title is squeezed into the number column").toBeGreaterThan(150);

  const start = await title.evaluate((node) => getComputedStyle(node).gridColumnStart);
  expect(start).toBe("2");
  // One line, not one word per line: the widest word still fits inside the box it was given.
  const lines = await title.evaluate((node) => {
    const range = document.createRange();
    range.selectNodeContents(node);
    return new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size;
  });
  expect(lines).toBe(1);
});
