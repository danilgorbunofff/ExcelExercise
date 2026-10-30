/**
 * The paywall as a learner meets it. `tests/paywall.test.js` proves the server rule (`paywallDecision`)
 * and `tests/client.test.js` probes the client wiring; neither can say whether drill 4 actually opens on
 * a click and drill 5 actually stops. That is what this file is for: the shipped build, a real browser,
 * the three boundaries the plan names (prompt at 4, wall from 5, offer page reachable from both).
 *
 * The counts come from the built pages, not from a number copied here — a spec that hardcoded "drill 4"
 * would pass on the day it was written and quietly read the wrong drill after `track.json` moved.
 */
import { expect, test } from "@playwright/test";

import { seedBefore } from "../lib/seed.js";
import { loadSite } from "../lib/site.js";

const { index, track } = loadSite();
const promptAt = index[track.freeLessonCount]; // the first drill past the free ones
const wallAt = index[track.freeLessonCount + 1]; // the first one behind the wall

test("the offer page names the price and the split", async ({ page }) => {
  const response = await page.goto("/pricing");
  expect(response.status()).toBe(200);

  await expect(page.locator("#main h1")).toHaveText("The free half, and the paid half");
  await expect(page.locator("#price-heading")).toBeVisible();
  await expect(page.locator("#main")).toContainText("$59.99/year");

  // The free half is linked because it is open; the paid half is named and not linked, because a link
  // there would be a door painted on a wall.
  const free = page.locator("#free-heading + .how-steps a");
  await expect(free).toHaveCount(track.freeLessonCount);
  await expect(free.first()).toHaveAttribute("href", index[0].path);
  await expect(page.locator("#paid-heading + .how-steps a")).toHaveCount(0);
  await expect(page.locator("#paid-heading + .how-steps li").first()).toContainText(
    index[track.freeLessonCount].exercise.title,
  );

  // It is a page for an offer that is not on sale yet, and it says so rather than pretending.
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await expect(page.locator(".gate-note")).toContainText("Checkout is not open yet");
});

test("the first paid drill opens on one click, and only once", async ({ page }) => {
  await seedBefore(page, promptAt.slug);
  await page.goto(promptAt.path);

  const prompt = page.locator("#paywall");
  await expect(prompt).toHaveAttribute("data-gate", "prompt");
  await expect(prompt.locator("h2")).toHaveText("The last drill before the paid half");
  await expect(prompt.locator("a[href='/pricing']")).toHaveCount(1);

  await page.click("#grace-pass");
  await expect(page.locator("#formula")).toBeVisible();
  await expect(prompt).toHaveCount(0);

  // The pass is remembered in this browser, so the second visit is the wall and not the question. A
  // prompt that reappeared every reload would be a soft prompt in name only.
  await page.reload();
  await expect(page.locator("#paywall")).toHaveAttribute("data-gate", "paywall");
  // The wall hides the drill rather than removing it, so "gated" is the input being unreachable.
  await expect(page.locator("#formula")).toBeHidden();
});

test("the drill after it is behind the wall from the first visit", async ({ page }) => {
  await seedBefore(page, wallAt.slug);
  await page.goto(wallAt.path);

  await expect(page.locator("#paywall")).toHaveAttribute("data-gate", "paywall");
  // The wall hides the drill rather than removing it, so "gated" is the input being unreachable.
  await expect(page.locator("#formula")).toBeHidden();
  await expect(page.locator("#paywall a[href='/pricing']")).toHaveText("what it costs");
  // The trial is still the way through in this build: billing is not wired, so the wall must not be a
  // dead end. This is the behaviour the plan's "hard gate" becomes once checkout lands.
  await page.fill("#paywall-email", "learner@example.com");
  await page.click("#paywall-form button[type='submit']");
  await expect(page.locator("#formula")).toBeVisible();
});

test("the offer page is reachable from the wall without losing the drill", async ({ page }) => {
  // A reader who follows "/pricing" from the wall has to be able to come back: the browser's back
  // button, not a bespoke "return" link, is the contract here.
  await seedBefore(page, wallAt.slug);
  await page.goto(wallAt.path);
  await page.click("#paywall a[href='/pricing']");
  await expect(page.locator("#main h1")).toHaveText("The free half, and the paid half");
  await page.goBack();
  await expect(page.locator("#paywall")).toHaveAttribute("data-gate", "paywall");
});

test("every drill the catalog calls free is served with no wall", async ({ page }) => {
  // The free half is a promise, and the page a learner promised it on is the one to check. Reading the
  // catalog means this covers a drill added tomorrow, not the three that exist today. The seed is one
  // script for every visit — it finishes whatever precedes the drill in the address bar — because
  // registering one init script per drill would leave the last one to win rather than the right one.
  const before = {};
  index.forEach((entry, position) => {
    before[entry.slug] = index.slice(0, position).map((prior) => prior.exercise.id);
  });
  await page.addInitScript((map) => {
    const last = location.pathname.split("/").filter(Boolean).pop() ?? "";
    const slug = decodeURIComponent(last).replace(/\.html$/, "");
    const done = {};
    for (const id of map[slug] ?? []) done[id] = { at: "2026-01-01T00:00:00.000Z", tries: 0, helped: false };
    window.localStorage.setItem("es.progress", JSON.stringify({ v: 1, done, tries: {}, unlocked: false }));
  }, before);

  for (const entry of index.filter((item) => item.free)) {
    await page.goto(entry.path);
    await expect(page.locator("#formula"), `${entry.slug} is free and should not be gated`).toBeVisible();
    await expect(page.locator("#paywall")).toHaveCount(0);
  }
});
