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

/** A drill past the free ones: the paywall opens the first time an email is entered, and the trial
 *  is remembered in this browser, so this is the real path to a later lesson. */
async function openGatedDrill(page, slug) {
  await page.goto(`/learn/excel/${slug}`);
  await page.fill("#paywall-email", "learner@example.com");
  await page.click("#paywall-form button[type='submit']");
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

test("a two-screen lesson advances to screen 2 and completes on the last answer", async ({ page }) => {
  await openGatedDrill(page, "xlookup-search-from-the-bottom");

  // Screen 2 exists in the markup from the first paint, so it is hidden rather than absent: the
  // panel is what a real browser has to switch, not something a script has to build.
  await expect(page.locator("#screen-position")).toHaveText("screen 1 of 2 · ");
  await expect(page.locator("#screen-answer-cell")).toHaveText("B7");
  await expect(page.locator("[data-screen='1']")).toBeVisible();
  await expect(page.locator("[data-screen='2']")).toBeHidden();

  await check(page, "=XLOOKUP(A7,A2:A6,B2:B6,,0,-1)");
  await expect(page.locator("#feedback")).toHaveClass(/is-correct/);
  await expect(page.locator("#feedback .feedback-meta")).toHaveText("Right first time. Screen 2 of 2.");
  await expect(page.locator("[data-screen='1']")).toBeHidden();
  await expect(page.locator("[data-screen='2']")).toBeVisible();
  await expect(page.locator("#screen-answer-cell")).toHaveText("B8");

  await check(page, "=XLOOKUP(A8,A2:A6,B2:B6,,0,-1)");
  await expect(page.locator("#feedback-head")).toHaveText("Correct");
  await expect(page.locator("#feedback-body")).toHaveText("B8 holds 16.25.");
  await expect(page.locator(".rail-item[data-lesson='16-xlookup-search-from-the-bottom']")).toHaveClass(/is-done/);
});

/** The funnel buffer the drill fills, newest last. */
function lastElapsed(page, type) {
  return page.evaluate((wanted) => {
    const all = globalThis.__esEvents ?? [];
    const found = [...all].reverse().find((event) => event.type === wanted);
    return found ? found.elapsed : null;
  }, type);
}

/** Playwright keeps the page foregrounded, so the tab is hidden by hand and the event a real
 *  background tab fires is dispatched: the clock has to agree without the browser playing along. */
function setHidden(page, hidden) {
  return page.evaluate((value) => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => value });
    document.dispatchEvent(new Event("visibilitychange"));
  }, hidden);
}

test("the session clock stops while the tab is hidden", async ({ page }) => {
  await openDrill(page, "sum-basics");
  const opened = await lastElapsed(page, "screen_view");
  expect(typeof opened).toBe("number");

  // 1.3 s hidden, then 1.3 s in front of the learner: only one of those seconds is time on task.
  await setHidden(page, true);
  await page.waitForTimeout(1300);
  await setHidden(page, false);
  await page.waitForTimeout(1300);
  await check(page, "=SUM(B2:B4)");

  const answered = await lastElapsed(page, "check_correct");
  expect(answered - opened).toBeGreaterThanOrEqual(1);
  expect(answered - opened).toBeLessThan(2);
});

test("progress survives a reload on the same device", async ({ page }) => {
  await openDrill(page, "sum-basics");
  await check(page, "=SUM(B2:B4)");
  await expect(page.locator("#feedback")).toHaveClass(/is-correct/);

  await page.reload();
  await expect(page.locator(".rail-item[data-lesson='01-sum-basics']")).toHaveClass(/is-done/);
  await expect(page.locator("#progress-count")).toHaveText(`1 of ${LESSONS}`);
});
