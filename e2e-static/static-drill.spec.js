/**
 * The static deployable, in a real browser.
 *
 * `legacy/src/verify.mjs` crawls `legacy/dist` as HTML: it can see that the markup, the inline
 * fixture and the script tags are present, but it never executes a line of JavaScript. Everything
 * that only happens once a browser loads those pages — the ES-module graph over HTTP, the graders,
 * the storage probe, persistence across a reload — went unproven on the static build while the Next
 * build was driven for real. These three tests close that gap against the exact bytes in
 * `legacy/dist`, served by `scripts/serve-static.mjs` on 4175.
 */
import { expect, test } from "@playwright/test";

const ANSWER_CELL = ".cell[data-cell='B5']";
const SENTENCE =
  "This browser blocks local storage, so nothing is saved. The drills still work, but this page cannot remember them.";

async function openStatic(page, slug) {
  await page.goto(`/excel/${slug}`);
  await expect(page.locator("#formula")).toBeVisible();
}

async function check(page, formula) {
  await page.fill("#formula", formula);
  await page.click("#check");
}

test("the static build loads its module graph and grades a formula", async ({ page }) => {
  const failures = [];
  page.on("console", (message) => {
    if (message.type() === "error") failures.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => failures.push(`pageerror: ${error.message}`));
  page.on("requestfailed", (request) => failures.push(`request: ${request.url()}`));

  await openStatic(page, "sum-basics");
  await check(page, "=SUM(B2:B4)");

  await expect(page.locator("#feedback")).toHaveClass(/is-correct/);
  await expect(page.locator("#feedback-body")).toHaveText("B5 holds 3580.");
  await expect(page.locator(ANSWER_CELL)).toHaveClass(/cell-correct/);
  // A module served with the wrong MIME type is a console error, not a visible failure, so the
  // empty list is the assertion that the static host serves `text/javascript`.
  expect(failures).toEqual([]);
});

test("the static build warns on blocked storage and still grades", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new DOMException("storage is blocked", "SecurityError");
      },
    });
  });

  await openStatic(page, "sum-basics");
  await expect(page.locator("#rail-blocked")).toHaveText(SENTENCE);
  await check(page, "=SUM(B2:B4)");
  await expect(page.locator("#feedback")).toHaveClass(/is-correct/);
});

test("the static build remembers a finished lesson across a reload", async ({ page }) => {
  await openStatic(page, "sum-basics");
  await check(page, "=SUM(B2:B4)");
  await expect(page.locator("#progress-count")).toHaveText("1 of 16");

  await page.reload();
  await expect(page.locator("#progress-count")).toHaveText("1 of 16");
  await expect(page.locator(".rail-item[data-lesson='01-sum-basics']")).toHaveClass(/is-done/);
});
