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

  // Time on task is reported twice: for the drill and for the screen that spent it. The second cannot
  // exceed the first, and neither can be negative.
  const event = await page.evaluate(() =>
    [...(window.__esEvents ?? [])].reverse().find((entry) => entry.type === "check_wrong"),
  );
  expect(event.elapsed).toBeGreaterThanOrEqual(event.screen_elapsed);
  expect(event.screen_elapsed).toBeGreaterThanOrEqual(0);
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

test("a multi-screen lesson walks to its picture screen and completes on typed text", async ({ page }) => {
  await openGatedDrill(page, "xlookup-search-from-the-bottom");

  // The later screens exist in the markup from the first paint, so they are hidden rather than
  // absent: the panel is what a real browser has to switch, not something a script has to build.
  await expect(page.locator("#screen-position")).toHaveText("screen 1 of 3 · ");
  await expect(page.locator("#screen-answer-cell")).toHaveText("B7");
  await expect(page.locator("[data-screen='1']")).toBeVisible();
  await expect(page.locator("[data-screen='2']")).toBeHidden();

  await check(page, "=XLOOKUP(A7,A2:A6,B2:B6,,0,-1)");
  await expect(page.locator("#feedback")).toHaveClass(/is-correct/);
  await expect(page.locator("#feedback .feedback-meta")).toHaveText("Right first time. Screen 2 of 3.");
  // The trial opened the drill, so the first screen view has to come from the paywall's exit.
  const firstView = await page.evaluate(() =>
    (globalThis.__esEvents ?? []).find((event) => event.type === "screen_view"),
  );
  expect(firstView.gated).toBe(true);
  await expect(page.locator("[data-screen='1']")).toBeHidden();
  await expect(page.locator("[data-screen='2']")).toBeVisible();
  await expect(page.locator("#screen-answer-cell")).toHaveText("B8");

  await check(page, "=XLOOKUP(A8,A2:A6,B2:B6,,0,-1)");
  await expect(page.locator("#feedback .feedback-meta")).toHaveText("Right first time. Screen 3 of 3.");

  // A picture screen has no target cell, so the chip goes dark, the note names the bar instead,
  // and the bar takes typed text rather than a formula.
  await expect(page.locator("[data-screen='3']")).toBeVisible();
  const picture = page.locator("[data-screen='3'] .picture-img");
  await expect(picture).toBeVisible();
  // The panel is hidden until this screen, so the image is fetched now: a 404 would still paint a
  // box, and only a decoded width proves the SVG the build copied is the one the screen asked for.
  await expect.poll(() => picture.evaluate((img) => img.naturalWidth)).toBeGreaterThan(0);
  await expect(page.locator("#ref-chip")).toBeHidden();
  await expect(page.locator("#screen-answer-cell")).toHaveText("the bar");
  await expect(page.locator("#formula")).toHaveAttribute("aria-label", "Your answer");

  // A near miss is graded as text and nothing echoes the answer it wanted.
  await check(page, "C2:C6");
  await expect(page.locator("#feedback")).toHaveClass(/is-wrong/);
  await expect(page.locator("#feedback-head")).toHaveText("Not the answer");
  await expect(page.locator("#feedback-body")).toHaveText("That is not what the image shows.");
  await expect(page.locator("#formula")).toHaveValue("C2:C6");

  // `$B$2:$B$6` names the same range as the accepted spelling, and `=` is the prefix every lesson
  // in the track teaches, so neither is a trap on the one screen that grades typed text.
  await check(page, "=$B$2:$B$6");
  await expect(page.locator("#feedback-head")).toHaveText("Correct");
  await expect(page.locator("#feedback-body")).toHaveText("The answer is B2:B6.");
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

test("arrow keys move the selection and stop at the edge of the block", async ({ page }) => {
  await openDrill(page, "sum-basics");
  const cell = (key) => page.locator(`.cell[data-cell='${key}']`);
  const selected = (key) => expect(cell(key)).toHaveAttribute("aria-selected", "true");
  /** Press a key on the cell that holds the selection, the way a learner's focus does. */
  const press = async (key, on) => {
    await cell(on).press(key);
    return page.locator(".cell[aria-selected='true']").getAttribute("data-cell");
  };

  await cell("B2").click();
  await selected("B2");

  // Movement comes from the sheet model, so it walks the cells the page drew, not the DOM order.
  expect(await press("ArrowRight", "B2")).toBe("C2");
  expect(await press("ArrowDown", "C2")).toBe("C3");
  expect(await press("ArrowLeft", "C3")).toBe("B3");
  expect(await press("ArrowUp", "B3")).toBe("B2");

  // The block is A1:C5, so the selection stops at each edge instead of wrapping to the far side.
  expect(await press("ArrowUp", "B2")).toBe("B1");
  expect(await press("ArrowUp", "B1")).toBe("B1");
  expect(await press("ArrowLeft", "B1")).toBe("A1");
  expect(await press("ArrowLeft", "A1")).toBe("A1");
  expect(await press("End", "A1")).toBe("C1");
  expect(await press("Home", "C1")).toBe("A1");
  for (let step = 0; step < 4; step += 1) await press("ArrowDown", "A1");
  expect(await press("ArrowDown", "A5")).toBe("A5");

  // A key that is not navigation is not swallowed, and selecting the answer cell hands the bar back.
  expect(await press("Enter", "A5")).toBe("A5");
  await expect(page.locator("#formula")).toBeDisabled();
  expect(await press("ArrowRight", "A5")).toBe("B5");
  await expect(page.locator("#formula")).toBeEnabled();
  await check(page, "=SUM(B2:B4)");
  await expect(page.locator("#feedback")).toHaveClass(/is-correct/);
});
