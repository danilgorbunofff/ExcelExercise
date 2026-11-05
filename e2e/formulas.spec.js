/**
 * The problem pages, end to end in a real browser: the hub lists them by family, a page opens with the
 * question a reader typed, and the exercise at the bottom grades what they type. `tests/formulas.test.js`
 * proves the markup and the gate; this file is the only place that can say the shipped pages work.
 */
import { expect, test } from "@playwright/test";

import { loadSite } from "../lib/site.js";

const FORMULAS = loadSite().formulas;
/** The COUNT page borrows the one-screen COUNT drill: three of the six readings are numbers. */
const COUNT = { slug: "count-only-the-numbers-with-count", answer: "=COUNT(B2:B7)", drill: "count-numbers-only-and-what-it-skips" };
/** SUMIF does have a note, so this is the page that proves a problem links out to its function. */
const SUMIF = { slug: "sum-one-regions-rows-with-sumif", note: "/excel-functions/sumif" };

test("the hub lists every problem page, on its own shelf", async ({ page }) => {
  const response = await page.goto("/formulas");
  expect(response.status()).toBe(200);

  await expect(page.locator("#main h1")).toContainText("Excel problems");
  for (const formula of FORMULAS) {
    await expect(page.locator(`a[href="/formulas/${formula.slug}"]`).first()).toBeVisible();
  }
  // A shelf per family, so a reader scanning for "lookup" is not walking 12 unrelated questions.
  const families = await page.$$eval("#main section h2[id^='family-']", (nodes) => nodes.map((node) => node.id));
  expect(families.length).toBeGreaterThanOrEqual(3);

  // An index, not a sales page: nothing asks for an email before a question opens.
  await expect(page.locator("#main form")).toHaveCount(0);
});

test("a page serves the question, the answer and its structured data", async ({ page }) => {
  const response = await page.goto(`/formulas/${COUNT.slug}`);
  expect(response.status()).toBe(200);

  const formula = FORMULAS.find((candidate) => candidate.slug === COUNT.slug);
  await expect(page.locator("#main h1")).toBeVisible();
  // The question the reader searched for is the lede, and it is what the result shows.
  await expect(page.locator(".page-head .lede")).toHaveText(formula.question);
  await expect(page.locator(".note h2").first()).toBeVisible();
  // The answer comes before the explanation: this is a reference page, not an essay. `>` because the
  // "On this page" nav lives inside the article and would otherwise be the first heading found.
  const headings = await page.$$eval("article.note > h2", (nodes) => nodes.map((node) => node.textContent.trim().toLowerCase()));
  expect(headings[0]).toBe("answer");

  const types = await page.$$eval('script[type="application/ld+json"]', (nodes) =>
    nodes.flatMap((node) => {
      const value = JSON.parse(node.textContent);
      return (value["@graph"] ?? [value]).map((item) => item["@type"]);
    }),
  );
  expect(types).toContain("Article");
  expect(types).toContain("BreadcrumbList");
  expect(types).not.toContain("FAQPage");
  expect(types).not.toContain("HowTo");

  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", new RegExp(`/formulas/${COUNT.slug}$`));
});

test("the exercise grades a wrong answer, reveals the hint, then accepts the answer", async ({ page }) => {
  await page.goto(`/formulas/${COUNT.slug}`);
  const input = page.locator("#article-answer-1");
  const feedback = page.locator("#article-feedback-1");
  const hint = page.locator("#article-hint-text-1");

  await page.fill("#article-answer-1", "=NOPE()");
  await page.locator('#article-drill-form-1 button[type="submit"]').click();
  await expect(feedback).toHaveAttribute("data-tone", "err");
  await expect(feedback).not.toHaveText("");
  await expect(hint).toBeHidden();

  // One miss is a typo, two is a misunderstanding — the second is what opens the hint.
  await page.locator('#article-drill-form-1 button[type="submit"]').click();
  await expect(hint).toBeVisible();

  await page.fill("#article-answer-1", COUNT.answer);
  await page.locator('#article-drill-form-1 button[type="submit"]').click();
  await expect(feedback).toHaveAttribute("data-tone", "ok");
  await expect(input).toHaveAttribute("readonly", "");

  // The page never pretends to be the lesson: the exercise links to the screen where progress is recorded.
  await expect(page.locator(".article-drill-more a").first()).toHaveAttribute("href", new RegExp(`/excel/${COUNT.drill}$`));
});

test("a page ends with the sibling problems and the note for its function", async ({ page }) => {
  await page.goto(`/formulas/${COUNT.slug}`);
  const ways = page.locator("nav.ways");
  await expect(ways).toBeVisible();

  const links = await ways.locator("a").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("href")));
  // The nearest problem pages, so a reader whose question was almost this one can walk the silo;
  // the hub link at the end of the list is what reaches all twelve.
  const siblings = links.filter((href) => href?.startsWith("/formulas/") && !href.endsWith(COUNT.slug));
  expect(siblings.length).toBeGreaterThanOrEqual(2);
  expect(links).toContain("/formulas");

  // A page whose function has a note leads with it. COUNT has no note yet, so it is not the fixture
  // for this: the page's own prose says so and points at the COUNTIF note instead.
  await page.goto(`/formulas/${SUMIF.slug}`);
  const withNote = await page.locator("nav.ways a").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("href")));
  expect(withNote).toContain(SUMIF.note);
});

test("a problem page fits a phone without side scroll", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/formulas/${COUNT.slug}`);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);

  for (const selector of ["#article-answer-1", '#article-drill-form-1 button[type="submit"]']) {
    const box = await page.locator(selector).first().boundingBox();
    expect(box, `${selector} is not laid out`).not.toBeNull();
    expect(box.height, `${selector} is shorter than a thumb target`).toBeGreaterThanOrEqual(44);
  }
});
