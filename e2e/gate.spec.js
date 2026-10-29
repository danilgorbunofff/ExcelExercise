/**
 * The order gate, in a browser. `tests/progress.test.js` covers the rule and `tests/client.test.js`
 * covers the flag; what only the browser can prove is that the two pages agree on it — the dashboard
 * says which drill is next, and the drill a learner clicked says the same number — and that the one
 * click out of the wall actually opens the drill under the cursor rather than reloading into it.
 */
import { expect, test } from "@playwright/test";

import { seedBefore } from "../lib/seed.js";
import { loadSite } from "../lib/site.js";

const { index } = loadSite();
const LAST = index[index.length - 1];

test("a drill ahead of the frontier names the one to finish first", async ({ page }) => {
  await page.goto(`/learn/excel/${LAST.slug}`);

  const card = page.locator("#paywall");
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute("data-gate", "order");
  await expect(card.locator(".paywall-title")).toHaveText(`Drill ${LAST.number} opens after drill 1`);
  await expect(card.locator(".paywall-body")).toContainText(index[0].exercise.title);

  // The way out is a link to that drill, not a dead end: the order is the instruction.
  const go = card.locator(".paywall-actions a");
  await expect(go).toHaveText("Go to drill 1");
  await expect(go).toHaveAttribute("href", index[0].path);

  // The drill is behind the wall rather than beside it, and the gate is in the funnel.
  await expect(page.locator("#formula")).toBeHidden();
  await expect(page.locator("#screens")).toBeHidden();
  const event = await page.evaluate(() =>
    (globalThis.__esEvents ?? []).find((entry) => entry.type === "gate_view"),
  );
  expect(event).toMatchObject({ reason: "order", after: index[0].exercise.id });
});

test("one click unlocks the whole track here, and it stays unlocked", async ({ page }) => {
  await page.goto(`/learn/excel/${LAST.slug}`);
  await expect(page.locator("#paywall")).toBeVisible();

  await page.click("#gate-unlock");

  // No reload: the drill is uncovered under the cursor, focused, and says what happened.
  await expect(page.locator("#paywall")).toHaveCount(0);
  await expect(page.locator("#formula")).toBeVisible();
  await expect(page.locator("#formula")).toBeFocused();
  await expect(page.locator("#feedback-head")).toHaveText("The track is open");
  const event = await page.evaluate(() =>
    (globalThis.__esEvents ?? []).find((entry) => entry.type === "track_unlock"),
  );
  expect(event).toMatchObject({ id: LAST.exercise.id });

  // A lesson past the free ones opens on the next visit without a second wall of either kind.
  await page.reload();
  await expect(page.locator("#formula")).toBeVisible();
  await expect(page.locator("#paywall")).toHaveCount(0);
});

test("the dashboard marks the drills the gate is holding", async ({ page }) => {
  await page.goto("/learn");

  // Every row stays a link — the lock is said, and the way through it is one click behind the link.
  const first = page.locator(`[data-lesson="${index[0].exercise.id}"]`);
  await expect(first).toHaveAttribute("data-locked", "false");
  await expect(first.locator(".row-locked")).toHaveCount(0);

  const last = page.locator(`[data-lesson="${LAST.exercise.id}"]`);
  await expect(last).toHaveAttribute("data-locked", "true");
  await expect(last.locator(".row-locked")).toHaveText("Opens after drill 1");
  await expect(last.locator(".lesson-link")).toHaveAttribute("href", LAST.path);

  // Finishing the first drill moves the frontier by one, and the row says so.
  await seedBefore(page, LAST.slug);
  await page.goto("/learn");
  await expect(last).toHaveAttribute("data-locked", "false");
  await expect(last.locator(".row-locked")).toHaveCount(0);
  await expect(page.locator(`[data-lesson="${index[1].exercise.id}"]`)).toHaveAttribute("data-locked", "false");
});
