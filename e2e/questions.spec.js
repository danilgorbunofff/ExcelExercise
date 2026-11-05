/**
 * The questions fold. `tests/questions.test.js` proves the markup every page ships — one `<details>`
 * per question, the question as an `<h3>` in the summary, no `name` grouping, the answer in the HTML —
 * and none of that can say whether the fold actually opens, whether two can be open at once, or
 * whether the keyboard can reach it. This file is the behaviour, in the shipped build.
 *
 * The pages are the two shapes the block has: the hub, where it sits in the prose measure, and
 * `/pricing`, where it is the last band of a page that is one long argument for the price.
 */
import { expect, test } from "@playwright/test";

const PAGES = ["/excel-exercises", "/pricing"];

test("every question starts folded, with the answer already in the page", async ({ page }) => {
  for (const path of PAGES) {
    await page.goto(path);
    const folds = page.locator(".qa-block details.faq");
    const count = await folds.count();
    expect(count, `${path} answers no questions`).toBeGreaterThanOrEqual(2);

    for (let at = 0; at < count; at += 1) {
      const fold = folds.nth(at);
      await expect(fold, `${path} fold ${at} starts open`).not.toHaveAttribute("open", "");
      // The answer is in the document while the fold is closed: that is the whole reason this is a
      // `<details>` and not a button that fetches a panel.
      await expect(fold.locator("p").first(), `${path} fold ${at} has no answer`).toHaveText(/\S/);
      await expect(fold.locator("p").first()).toBeHidden();
    }
  }
});

test("a click opens one, and opening a second leaves the first open", async ({ page }) => {
  await page.goto("/pricing");
  const folds = page.locator(".qa-block details.faq");
  const first = folds.nth(0);
  const second = folds.nth(1);

  await first.locator("summary").click();
  await expect(first).toHaveAttribute("open", "");
  await expect(first.locator("p").first()).toBeVisible();

  // No `name` attribute ties these together on purpose: a reader comparing two answers must not lose
  // the one they were reading. This is the assertion that fails if someone adds it for tidiness.
  await second.locator("summary").click();
  await expect(second).toHaveAttribute("open", "");
  await expect(first).toHaveAttribute("open", "");
});

test("the question is the row's heading, and the row is its accessible name", async ({ page }) => {
  await page.goto("/excel-exercises");
  const folds = page.locator(".qa-block details.faq");
  const headings = page.locator(".qa-block details.faq summary h3");
  expect(await headings.count()).toBe(await folds.count());

  const question = (await headings.first().textContent())?.trim() ?? "";
  expect(question.endsWith("?")).toBe(true);
  // The caret is drawn in CSS, so it contributes nothing to the name and a screen reader announces the
  // question and not "question greater than".
  await expect(folds.first().locator("summary")).toHaveAccessibleName(question);
  await expect(folds.first().getByRole("heading", { level: 3, name: question })).toHaveCount(1);
});

test("the keyboard opens and closes the fold without a script", async ({ page }) => {
  await page.goto("/excel-exercises");
  const fold = page.locator(".qa-block details.faq").first();
  const summary = fold.locator("summary");

  await summary.focus();
  await expect(summary).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(fold).toHaveAttribute("open", "");

  await page.keyboard.press("Space");
  await expect(fold).not.toHaveAttribute("open", "");
});
