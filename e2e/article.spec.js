/**
 * The function notes, end to end in a real browser: the hub lists them, a note reads as prose, and
 * the note's one-screen drill actually grades an answer. `tests/articles.test.js` proves the markup
 * and the gate; this file is the only place that can say the shipped pages work when you type in
 * them, at a phone width, with a keyboard.
 */
import { expect, test } from "@playwright/test";

import { loadSite } from "../lib/site.js";

const NOTES = loadSite().articles;
/** The SUM note borrows the opening SUM drill, whose accepted answer is hand-checkable against the
 *  grid it ships: 1200 + 1450 + 930. */
const SUM = { slug: "sum", answer: "=SUM(B2:B4)", wrong: "=SUM(B2:B3)" };

test("the hub lists every note and links to it", async ({ page }) => {
  const response = await page.goto("/excel-functions");
  expect(response.status()).toBe(200);

  await expect(page.locator("#main h1")).toContainText("Excel function");
  for (const note of NOTES) {
    await expect(page.locator(`a[href="/excel-functions/${note.slug}"]`).first()).toBeVisible();
  }
  // The hub is an index, not a sales page: no form asks for an email before a note opens.
  await expect(page.locator("#main form")).toHaveCount(0);
});

test("a note serves its prose, its syntax and its structured data", async ({ page }) => {
  const response = await page.goto(`/excel-functions/${SUM.slug}`);
  expect(response.status()).toBe(200);

  await expect(page.locator("#main h1")).toContainText("SUM");
  await expect(page.locator("pre.syntax code")).toHaveText(/^=SUM\(/);
  await expect(page.locator(".note h2").first()).toBeVisible();

  // Two nodes on the page, so `jsonLd()` wraps them in a `@graph`. Reading only the top level would
  // find no `@type` at all and pass every assertion below for the wrong reason.
  const types = await page.$$eval('script[type="application/ld+json"]', (nodes) =>
    nodes.flatMap((node) => {
      const value = JSON.parse(node.textContent);
      return (value["@graph"] ?? [value]).map((item) => item["@type"]);
    }),
  );
  expect(types).toContain("Article");
  expect(types).toContain("BreadcrumbList");
  // Google retired FAQ and HowTo results; marking a note as either would be a claim no result uses.
  expect(types).not.toContain("FAQPage");
  expect(types).not.toContain("HowTo");

  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/excel-functions\/sum$/);
});

test("the drill grades a wrong answer, reveals the hint, then accepts the answer", async ({ page }) => {
  await page.goto(`/excel-functions/${SUM.slug}`);
  const input = page.locator("#article-answer");
  const feedback = page.locator("#article-feedback");
  const hint = page.locator("#article-hint-text");

  await page.fill("#article-answer", SUM.wrong);
  await page.locator('#article-drill-form button[type="submit"]').click();
  await expect(feedback).toHaveAttribute("data-tone", "err");
  await expect(feedback).not.toHaveText("");
  await expect(hint).toBeHidden();

  // A second miss is what opens the hint: one wrong answer is a typo, two is a misunderstanding.
  await page.locator('#article-drill-form button[type="submit"]').click();
  await expect(hint).toBeVisible();
  await expect(page.locator("#article-hint")).toHaveAttribute("aria-expanded", "true");

  await page.fill("#article-answer", SUM.answer);
  await page.locator('#article-drill-form button[type="submit"]').click();
  await expect(feedback).toHaveAttribute("data-tone", "ok");
  await expect(input).toHaveAttribute("readonly", "");
  await expect(page.locator('#article-drill-form button[type="submit"]')).toBeDisabled();

  // The note never pretends to be the lesson: it points at the full drill, which is where progress
  // is recorded, and that link has to survive grading.
  const drillLink = page.locator(".article-drill-more a");
  await expect(drillLink).toBeVisible();
  await expect(drillLink).toHaveAttribute("href", new RegExp(`/excel/${NOTES.find((note) => note.slug === SUM.slug).exercise}$`));
});

test("the drill's controls are reachable and big enough", async ({ page }) => {
  await page.goto(`/excel-functions/${SUM.slug}`);

  for (const selector of ["#article-answer", '#article-drill-form button[type="submit"]', "#article-hint", ".article-toc-list a"]) {
    const box = await page.locator(selector).first().boundingBox();
    expect(box, `${selector} is not laid out`).not.toBeNull();
    expect(box.height, `${selector} is shorter than a thumb target`).toBeGreaterThanOrEqual(44);
  }

  await page.locator("#article-answer").focus();
  const outline = await page.locator("#article-answer").evaluate((node) => {
    const style = getComputedStyle(node);
    return { width: style.outlineWidth, style: style.outlineStyle };
  });
  expect(outline.style, "a focused field must draw a ring").not.toBe("none");
  expect(parseFloat(outline.width)).toBeGreaterThan(0);
});

test("a note fits a phone without side scroll", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/excel-functions/${SUM.slug}`);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
  // Long tables scroll inside their wrapper instead of pushing the page sideways.
  const wrapped = await page.locator(".table-wrap table").first().evaluate((node) => {
    const wrap = node.parentElement;
    return wrap.scrollWidth <= wrap.clientWidth + 1 || getComputedStyle(wrap).overflowX !== "visible";
  });
  expect(wrapped).toBe(true);
});
