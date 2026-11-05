/**
 * One exercise, keyboard only. The grid's arrow keys have their own spec; this one is about the rest of the
 * page: whether a learner who never touches the mouse can reach the bar, hear where they are, read the
 * hint, take the reveal and finish — and whether the page says so by moving the focus rather than by
 * hoping the next thing is visible.
 */
import { expect, test } from "@playwright/test";

import { freeDrill } from "../lib/site.js";

const FREE = freeDrill();

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

/** The rail is server-rendered, but `data-full` is written by the client the first time it paints
 *  progress, so its presence is the honest "the module graph has run" signal. Pressing Tab into a
 *  document that is still being replaced loses the focus the walk had already earned.
 *
 *  The rail is not the whole handover, though. The client paints the rail and then points the bar at
 *  the answer cell, and only the second step leaves the input as the thing a keyboard user is meant
 *  to land on, so a walk that trusts the rail alone can start before the bar is answerable. */
async function waitForClient(page) {
  await expect(page.locator("#progress-fill")).toHaveAttribute("data-full", /^(true|false)$/);
  await expect(page.locator("#formula")).toBeEnabled();
}

/**
 * The key that walks the tab order on this engine.
 *
 * Safari does not put links or buttons in the Tab order unless the reader has turned on full keyboard
 * access, and Option+Tab is that convention's chord. A keyboard-only Safari user has the setting on,
 * so the walk presses the chord there rather than asserting an order Safari deliberately does not
 * have. WebKit with the chord visits the same elements in the same order as Chromium and Firefox,
 * which is what makes this suite meaningful on all three.
 */
async function tabKey(page) {
  const engine = page.context().browser()?.browserType().name();
  return engine === "webkit" ? "Alt+Tab" : "Tab";
}

/** Every node the engine will stop on, asked of the document rather than assumed. The exercise page
 *  carries more than thirty once the footer arrives — its link list alone is most of a pass — so a
 *  budget fixed by hand can expire before a walk that started mid-document comes back around to the
 *  control it began past. Hidden nodes are counted too, which only ever buys a walk spare presses. */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
  'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Walk the tab order until the named element has it.
 *
 * Both rules here were earned from a WebKit failure that read like a broken hint button. The budget
 * has to cover a whole cycle of the document, because the exercise page has more tab stops than the
 * thirty the walk used to allow. And the turn at the end of that cycle is not a lost focus: WebKit
 * hands focus to its own chrome and reports `body`, so one pass through `body` lets the walk carry on
 * into a second lap. Firefox instead leaves `activeElement` on the last control, which the budget
 * covers and which never produces a second `body` reading. A second one means the focus really was
 * dropped, and that stays an immediate failure — a node that steals focus from under a keyboard user
 * is exactly what this assertion is for.
 */
async function tabTo(page, wanted) {
  const key = await tabKey(page);
  const limit = (await page.locator(FOCUSABLE).count()) * 2 + 2;
  const trail = [];
  let started = false;
  let wraps = 0;
  for (let step = 0; step <= limit; step += 1) {
    const at = await focused(page);
    if (at === wanted) return;
    if (at === "body" && started) {
      wraps += 1;
      if (wraps > 1) throw new Error(`focus was dropped to body twice: ${trail.join(" -> ")}`);
    }
    if (at !== "body") started = true;
    trail.push(at);
    await page.keyboard.press(key);
  }
  throw new Error(`tab order never reached ${wanted} in ${limit} presses: ${trail.join(" -> ")}`);
}

test("a whole exercise is passable without a mouse", async ({ page }) => {
  await page.goto(FREE.path);
  await expect(page.locator("#formula")).toBeVisible();
  await waitForClient(page);

  await tabTo(page, "#formula");
  await expect(page.locator("#formula")).toBeFocused();
  // A focus ring is the only thing telling a keyboard user where they are, so it has to be drawn by
  // the keyboard rather than by the mouse. The client repaints the rail and the bar as progress
  // lands, and a repaint can take the focus with it; waiting for the input to still hold it keeps
  // the ring assertion meaningful instead of sampling a moment when nothing is focused.
  await expect(page.locator("#formula")).toBeFocused();
  const ring = await page.locator("#formula").evaluate((el) => {
    const { outlineStyle, outlineWidth } = getComputedStyle(el);
    return { outlineStyle, outlineWidth: parseFloat(outlineWidth) };
  });
  expect(ring.outlineStyle).not.toBe("none");
  expect(ring.outlineWidth).toBeGreaterThanOrEqual(2);

  await page.keyboard.type("=SUM(B2:B4)");
  await page.keyboard.press("Enter");
  await expect(page.locator("#feedback-head")).toHaveText("Correct");
  // Finishing the exercise hands the focus to its one way forward, so a keyboard user does not have to
  // tab back past the bar and the hint row to find it.
  await expect(page.locator("a.next-cta")).toBeFocused();

  // And it works: Enter on it leaves the exercise.
  await page.keyboard.press("Enter");
  await expect(page).not.toHaveURL(new RegExp(FREE.slug));
});

test("the hint and the reveal are reachable, and the reveal says what it will do", async ({ page }) => {
  await page.goto(FREE.path);
  await waitForClient(page);
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
  // Same reason as the ring above: Enter goes wherever the focus really is, so make the focus an
  // assertion that can retry rather than a single read.
  await expect(page.locator("#hint")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#hint")).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#hint-text")).toBeVisible();

  await tabTo(page, "#show-answer");
  await expect(page.locator("#show-answer")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#solution")).toBeVisible();
  await expect(page.locator("#solution-code")).toHaveText("=SUM(B2:B4)");
});
