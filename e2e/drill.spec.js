/**
 * The drill loop, end to end, in a real browser: type a formula, check it, read the verdict. The
 * grader itself is covered by `tests/golden/`; this proves the shipped page wires the input, the
 * button and the verdict together without a build-time shortcut.
 */
import { expect, test } from "@playwright/test";

import { loadSite } from "../lib/site.js";

const LESSONS = loadSite().index.length;

const ANSWER_CELL = ".cell[data-cell='B5']";

async function openDrill(page, slug) {
  await page.goto(`/learn/excel/${slug}`);
  await expect(page.locator("#formula")).toBeVisible();
}

async function check(page, formula) {
  await page.fill("#formula", formula);
  await page.click("#check");
}

test("a correct formula is accepted and reported", async ({ page }) => {
  await openDrill(page, "sum-basics");

  await check(page, "=SUM(B2:B4)");
  await expect(page.locator("#feedback")).toHaveClass(/is-correct/);
  await expect(page.locator("#feedback-head")).toHaveText("Correct");
  await expect(page.locator("#feedback-body")).toHaveText("B5 holds 3580.");
  await expect(page.locator(ANSWER_CELL)).toHaveClass(/cell-correct/);
});

test("a wrong total keeps the SUM and names the value rule", async ({ page }) => {
  await openDrill(page, "sum-basics");

  await check(page, "=SUM(B2:B3)");
  await expect(page.locator("#feedback")).toHaveClass(/is-wrong/);
  await expect(page.locator("#feedback-head")).toHaveText("Not the answer");
  await expect(page.locator("#feedback-body")).toHaveText(
    "Your formula returns 2650, but this lesson expects 3580.",
  );
  await expect(page.locator(ANSWER_CELL)).toHaveClass(/cell-wrong/);
});

test("the missing function is rejected before the value is even considered", async ({ page }) => {
  await openDrill(page, "sum-basics");

  await check(page, "=B2+B3");
  await expect(page.locator("#feedback")).toHaveClass(/is-wrong/);
  await expect(page.locator("#feedback-body")).toContainText("This lesson is about SUM");
  await expect(page.locator("#feedback-head")).not.toHaveText("Correct");
});

test("a formula that cannot be read points at the character", async ({ page }) => {
  await openDrill(page, "sum-basics");

  await check(page, "=SUM(B2:B4");
  await expect(page.locator("#feedback")).toHaveClass(/is-wrong/);
  await expect(page.locator("#feedback-head")).toHaveText("The formula cannot be read");
  await expect(page.locator(".feedback-caret")).toBeVisible();
});

test("progress survives a reload on the same device", async ({ page }) => {
  await openDrill(page, "sum-basics");
  await check(page, "=SUM(B2:B4)");
  await expect(page.locator("#feedback")).toHaveClass(/is-correct/);

  await page.reload();
  await expect(page.locator(".rail-item[data-lesson='01-sum-basics']")).toHaveClass(/is-done/);
  await expect(page.locator("#progress-count")).toHaveText(`1 of ${LESSONS}`);
});
