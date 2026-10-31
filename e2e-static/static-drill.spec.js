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

import { freeDrill, loadSite } from "../lib/site.js";

const ANSWER_CELL = ".cell[data-cell='B5']";
// The count the rail prints is how many lessons the build shipped, so it moves with the catalog.
const LESSONS = loadSite().index.length;
/** The free half is the intro drills, so the static drill the specs open is the first of those. */
const FREE = freeDrill();
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

  await openStatic(page, FREE.slug);
  await check(page, "=SUM(B2:B4)");

  await expect(page.locator("#feedback")).toHaveClass(/is-correct/);
  await expect(page.locator("#feedback-body")).toHaveText("B5 holds 35.");
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

  await openStatic(page, FREE.slug);
  await expect(page.locator("#rail-blocked")).toHaveText(SENTENCE);
  await check(page, "=SUM(B2:B4)");
  await expect(page.locator("#feedback")).toHaveClass(/is-correct/);
});

test("the static build remembers a finished lesson across a reload", async ({ page }) => {
  await openStatic(page, FREE.slug);
  await check(page, "=SUM(B2:B4)");
  await expect(page.locator("#progress-count")).toHaveText(`1 of ${LESSONS}`);

  await page.reload();
  await expect(page.locator("#progress-count")).toHaveText(`1 of ${LESSONS}`);
  await expect(page.locator(`.rail-item[data-lesson='${FREE.exercise.id}']`)).toHaveClass(/is-done/);
});

// Phase 9A §7. The static deployable serves one concatenated stylesheet, and dark mode lives entirely
// in it — so a build that lost the media block would ship a site that silently ignores the reader's
// preference on this host while the Next host kept working. Checked against the served bytes, not the
// source, because that is the file the deployable actually has.
test.describe("with the OS asking for dark", () => {
  test.use({ colorScheme: "dark" });

  test("the static stylesheet paints the dark palette", async ({ page }) => {
    await page.goto("/");
    const read = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      return {
        media: matchMedia("(prefers-color-scheme: dark)").matches,
        meta: document.querySelector('meta[name="color-scheme"]')?.content,
        bg: style.getPropertyValue("--bg").trim(),
        text: style.getPropertyValue("--text").trim(),
      };
    });
    expect(read.media, "the harness is emulating dark").toBe(true);
    expect(read.meta).toBe("light dark");
    // `--bg` is Radix sand-2: #191918 dark, #f9f9f8 light.
    expect(read.bg).toBe("#191918");
    expect(read.text).toBe("#eeeeec");
  });

  test("the static head matches the bar colour to the palette", async ({ page }) => {
    await page.goto("/");
    const metas = await page.evaluate(() =>
      [...document.querySelectorAll('meta[name="theme-color"]')].map((meta) => [meta.media, meta.content]),
    );
    expect(metas).toEqual([
      ["(prefers-color-scheme: light)", "#f9f9f8"],
      ["(prefers-color-scheme: dark)", "#191918"],
    ]);
  });
});

test("the static build serves a note and grades its drill", async ({ page }) => {
  const failures = [];
  page.on("pageerror", (error) => failures.push(`pageerror: ${error.message}`));
  page.on("requestfailed", (request) => failures.push(`request: ${request.url()}`));

  await page.goto("/excel-functions/sum");
  await expect(page.locator("#main h1")).toContainText("SUM");
  await expect(page.locator("#article-answer")).toBeEditable();

  await page.fill("#article-answer", "=SUM(B2:B3)");
  await page.locator('#article-drill-form button[type="submit"]').click();
  await expect(page.locator("#article-feedback")).toHaveAttribute("data-tone", "err");

  await page.fill("#article-answer", "=SUM(B2:B4)");
  await page.locator('#article-drill-form button[type="submit"]').click();
  await expect(page.locator("#article-feedback")).toHaveAttribute("data-tone", "ok");
  // The island is a separate module on both builds; a 404 for it is silent on the page and loud here.
  expect(failures).toEqual([]);
});
