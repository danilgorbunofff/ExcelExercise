/**
 * One drill, keyboard only. The grid's arrow keys have their own spec; this one is about the rest of the
 * page: whether a learner who never touches the mouse can reach the bar, hear where they are, read the
 * hint, take the reveal and finish — and whether the page says so by moving the focus rather than by
 * hoping the next thing is visible.
 */
import { expect, test } from "@playwright/test";

test.use({ reducedMotion: "reduce" });

/** Where the document's focus is, as a selector-ish label a failure can print. */
function focused(page) {
  return page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return "body";
    if (el.id) return `#${el.id}`;
    if (el.dataset.cell) return `cell ${el.dataset.cell}`;
    return el.tagName.toLowerCase();
  });
}

/** Walk the tab order until the named element has it. A bounded walk, so a page that cannot reach the
 *  control fails with the step it stopped at instead of hanging. */
async function tabTo(page, wanted, limit = 30) {
  for (let step = 0; step <= limit; step += 1) {
    if ((await focused(page)) === wanted) return;
    await page.keyboard.press("Tab");
  }
  throw new Error(`tab order never reached ${wanted}; it stopped at ${await focused(page)}`);
}

test("a whole drill is passable without a mouse", async ({ page }) => {
  await page.goto("/learn/excel/sum-basics");
  await expect(page.locator("#formula")).toBeVisible();

  await tabTo(page, "#formula");
  await expect(page.locator("#formula")).toBeFocused();
  // A focus ring is the only thing telling a keyboard user where they are, so it has to be drawn by
  // the keyboard rather than by the mouse.
  const ring = await page.locator("#formula").evaluate((el) => {
    const { outlineStyle, outlineWidth } = getComputedStyle(el);
    return { outlineStyle, outlineWidth: parseFloat(outlineWidth) };
  });
  expect(ring.outlineStyle).not.toBe("none");
  expect(ring.outlineWidth).toBeGreaterThanOrEqual(2);

  await page.keyboard.type("=SUM(B2:B4)");
  await page.keyboard.press("Enter");
  await expect(page.locator("#feedback-head")).toHaveText("Correct");
  // Finishing the drill hands the focus to its one way forward, so a keyboard user does not have to
  // tab back past the bar and the hint row to find it.
  await expect(page.locator("a.next-cta")).toBeFocused();

  // And it works: Enter on it leaves the drill.
  await page.keyboard.press("Enter");
  await expect(page).not.toHaveURL(/sum-basics/);
});

test("the hint and the reveal are reachable, and the reveal says what it will do", async ({ page }) => {
  await page.goto("/learn/excel/sum-basics");
  await tabTo(page, "#formula");

  // The reveal is offered only after a screen's misses, so it is not in the tab order before that.
  await expect(page.locator("#show-answer")).toBeHidden();

  for (const wrong of ["=SUM(B1:B2)", "=SUM(B2)", "=SUM(B2:B3)"]) {
    await page.locator("#formula").fill(wrong);
    await page.keyboard.press("Enter");
    await expect(page.locator("#feedback")).toHaveClass(/is-wrong/);
  }
  await expect(page.locator("#show-answer")).toBeVisible();

  await tabTo(page, "#hint");
  await page.keyboard.press("Enter");
  await expect(page.locator("#hint")).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#hint-text")).toBeVisible();

  await tabTo(page, "#show-answer");
  await page.keyboard.press("Enter");
  await expect(page.locator("#solution")).toBeVisible();
  await expect(page.locator("#solution-code")).toHaveText("=SUM(B2:B4)");
});
