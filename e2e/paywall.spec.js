/**
 * The paywall as a learner meets it. `tests/paywall.test.js` proves the server rule (`paywallDecision`)
 * and `tests/client.test.js` probes the client wiring; neither can say whether the nominated exercise
 * actually opens on a click and the next paid one actually stops. That is what this file is for: the
 * shipped build, a real browser, the three boundaries the plan names (prompt at `track.promptAt`, wall
 * on every other paid exercise, offer page reachable from both).
 *
 * Which exercises are free comes from the built catalog, not from a number copied here. The free set is
 * curated and scattered through the track on purpose, so a spec that assumed "the first ten" would pass
 * on the day it was written and read the wrong exercises after `track.json` moved.
 */
import { expect, test } from "@playwright/test";

import { seedBefore } from "../lib/seed.js";
import { loadSite } from "../lib/site.js";

const { index, track } = loadSite();
const promptEntry = index.find((entry) => entry.number === track.promptAt);
const wallEntry = index.filter((entry) => !entry.free && entry.number !== track.promptAt).at(-1);
const freeEntries = index.filter((entry) => entry.free);
const startOrder = track.freeLessons.map((id) => index.find((entry) => entry.exercise.id === id).path);

test("the offer page asks one question and shows one price", async ({ page }) => {
  const response = await page.goto("/pricing");
  expect(response.status()).toBe(200);

  await expect(page.locator("#main h1")).toHaveText("10 exercises free. The rest from $9.99/month");

  // One card, and the term is a switch inside it rather than three cards beside it: the track is one
  // product sold at three commitments, and three columns asked a reader to compare before deciding.
  const card = page.locator("fieldset.term-switch");
  await expect(card).toHaveCount(1);
  await expect(card.locator("legend")).toHaveText("How long to pay for");
  await expect(card.locator(".term-radio")).toHaveCount(3);
  await expect(card.locator("#term-monthly")).toBeChecked();
  await expect(card.locator(".term-track label")).toHaveText(["One month", "Six months", "One year"]);

  // Exactly one panel is visible, and it is the term the switch says is chosen. Three stacked prices, or
  // none, would mean the CSS-only reveal broke in this build.
  const panels = card.locator(".term-panel");
  await expect(panels).toHaveCount(3);
  await expect(card.locator('[data-plan="monthly"]')).toBeVisible();
  await expect(card.locator('[data-plan="semiannual"]')).toBeHidden();
  await expect(card.locator('[data-plan="annual"]')).toBeHidden();
  await expect(card.locator('[data-plan="monthly"] .term-amount')).toHaveText("$9.99");
  await expect(card.locator('[data-plan="monthly"] .term-per-month')).toHaveText(/Renews every month/);

  // The switch is a control, so clicking a segment changes what is on the card, in place and with no
  // navigation: the page is one URL, and the term is a choice on it.
  await card.locator('label[for="term-annual"]').click();
  await expect(card.locator("#term-annual")).toBeChecked();
  await expect(card.locator('[data-plan="annual"]')).toBeVisible();
  await expect(card.locator('[data-plan="monthly"]')).toBeHidden();
  await expect(card.locator('[data-plan="annual"] .term-amount')).toHaveText("$59.99");
  await expect(card.locator('[data-plan="annual"] .term-per-month')).toHaveText("$5.00 a month");
  await expect(card.locator('[data-plan="annual"] .term-save')).toHaveText("save 50%");

  // The inclusions belong to the card, not to a panel: what the money buys does not change with the term.
  await expect(card.locator(".term-includes p")).toHaveCount(3);
  await expect(card.locator(".term-guarantee")).toContainText("100% refund guarantee");
  await expect(card.locator(".term-guarantee")).toContainText("cancel anytime");

  // It is a page for an offer that is not on sale in this build, and it says so rather than pretending.
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await expect(page.locator(".gate-note")).toContainText("Checkout is not open on this copy");
});

test("the offer page is one card, not a catalogue", async ({ page }) => {
  await page.goto("/pricing");

  // The two shapes this page is not allowed to grow back: three cards side by side, and the roster of
  // every exercise folded under the price. Both are how it used to argue for the offer by printing it.
  await expect(page.locator(".plan-grid")).toHaveCount(0);
  await expect(page.locator(".track-list")).toHaveCount(0);
  await expect(page.locator(".free-list")).toHaveCount(0);

  // The page has to fit in a screen or two. The catalogue alone was the height of a scroll marathon, and
  // a height ceiling is the only assertion that notices a section being added back a paragraph at a time.
  const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  expect(pageHeight).toBeLessThan(2_000);

  // No sideways scroll: the card is the widest thing on the page, and a fieldset left at its default
  // `min-inline-size: min-content` is exactly how a two-column card overflows a phone.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await page.setViewportSize({ width: 390, height: 780 });
  const narrow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(narrow).toBeLessThanOrEqual(0);
});

test("the nominated paid exercise opens on one click, and only once", async ({ page }) => {
  // No seeding: the prompt is the door into the paid half, so it cannot stand behind the free set's
  // order. A reader who has finished nothing is the reader it was written for.
  await page.goto(promptEntry.path);

  const prompt = page.locator("#paywall");
  await expect(prompt).toHaveAttribute("data-gate", "prompt");
  await expect(prompt.locator("h2")).toHaveText("One exercise from the paid half, open");
  // Two links lead to the offer page and both mean something: the card's own "see what the rest costs"
  // beside the pass, and the closing note that names every plan. The exercise's one button is the pass.
  await expect(prompt.locator("a[href='/pricing']", { hasText: "See what the rest costs" })).toHaveCount(1);
  await expect(prompt.locator("button")).toHaveCount(1);

  await page.click("#grace-pass");
  await expect(page.locator("#formula")).toBeVisible();
  await expect(prompt).toHaveCount(0);

  // The pass is remembered in this browser, so the second visit is the wall and not the question. A
  // prompt that reappeared every reload would be a soft prompt in name only.
  await page.reload();
  await expect(page.locator("#paywall")).toHaveAttribute("data-gate", "paywall");
  // The wall hides the exercise rather than removing it, so "gated" is the input being unreachable.
  await expect(page.locator("#formula")).toBeHidden();
});

test("every other paid exercise is behind the wall from the first visit", async ({ page }) => {
  await seedBefore(page, wallEntry.slug);
  await page.goto(wallEntry.path);

  const card = page.locator("#paywall");
  await expect(card).toHaveAttribute("data-gate", "paywall");
  await expect(page.locator("#formula")).toBeHidden();

  // Which door hangs under the card depends on the build, and the card has to be honest about it: a
  // price with no term is a trick, and "free while the store is closed" must not read as a purchase.
  if (await card.locator("form.paywall-form").count()) {
    await expect(card).toContainText("$9.99 a month");
    await expect(card).toContainText(/renews|cancel/i);
  } else {
    await expect(card.locator("#gate-unlock")).toBeVisible();
    await expect(card).toContainText("Free while the store is closed");
  }

  // There is no trial any more, so no field in the card may be the way through.
  await expect(card.locator("input")).toHaveCount(0);
});

test("the offer page is reachable from the wall without losing the exercise", async ({ page }) => {
  // A reader who follows "/pricing" from the wall has to be able to come back: the browser's back
  // button, not a bespoke "return" link, is the contract here.
  await seedBefore(page, wallEntry.slug);
  await page.goto(wallEntry.path);
  await page.click("#paywall a[href='/pricing']");
  await expect(page.locator("#main h1")).toHaveText("10 exercises free. The rest from $9.99/month");
  await page.goBack();
  await expect(page.locator("#paywall")).toHaveAttribute("data-gate", "paywall");
});

test("every exercise the catalog calls free is served with no wall", async ({ page }) => {
  // The free half is a promise, and the page a learner promised it on is the one to check. Reading the
  // catalog means this covers an exercise added tomorrow. No seeding: a free exercise opens to a reader
  // who has finished nothing, because the free set is not the first stretch of a countdown.
  for (const entry of freeEntries) {
    await page.goto(entry.path);
    await expect(page.locator("#formula"), `${entry.slug} is free and should not be gated`).toBeVisible();
    await expect(page.locator("#paywall")).toHaveCount(0);
  }
});

test("the start page lists the free ten in the order they are meant to be worked", async ({ page }) => {
  await page.goto("/start");
  await expect(page.locator("#main h1")).toHaveText("Start with these ten");

  const rows = page.locator("#free-heading ~ ol a");
  await expect(rows).toHaveCount(freeEntries.length);
  // The tour order is `track.freeLessons`, which is not the catalog order — that is the point of the page.
  const hrefs = await rows.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("href")));
  expect(hrefs).toEqual(startOrder);

  // And it is a door, not a brochure: the first row opens the exercise with no wall behind it.
  await page.goto(hrefs[0]);
  await expect(page.locator("#formula")).toBeVisible();
  await expect(page.locator("#paywall")).toHaveCount(0);
});
