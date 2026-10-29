/**
 * Accessibility, scanned rather than promised. `tests/build.test.js` can prove a page has an `aria-live`
 * region and a labelled button; only a browser that has laid the page out can say whether a control is
 * unreachable, a label points at nothing, or a badge sits on a colour a screen reader cannot use.
 *
 * The bar is critical and serious findings, not every note axe makes: a "colour-contrast" hit at AA on
 * decorative chrome is a different conversation from a button with no accessible name, and a suite that
 * fails on the first would be switched off rather than fixed.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const SEVERITIES = ["critical", "serious"];

// The player fades its verdict in over 120 ms, and axe measures the colour it can see: a scan fired
// mid-fade reads the verdict's tint at partial opacity and calls a passing pair a contrast failure.
// Emulating reduced motion settles the page before it is measured, which is also the path a learner who
// asked their OS for less motion gets — so this asserts that path renders rather than only avoiding it.
test.use({ reducedMotion: "reduce" });

/** The page as it is when the learner arrives — plus a label that says which page failed. */
async function scan(page, label) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  const blocking = violations.filter((violation) => SEVERITIES.includes(violation.impact));
  const report = blocking
    .map((violation) => {
      const nodes = violation.nodes.map((node) => `      ${node.target.join(" ")}`).join("\n");
      return `  ${violation.impact} · ${violation.id} — ${violation.help}\n${nodes}`;
    })
    .join("\n");
  expect(blocking, `${label} has ${blocking.length} critical/serious finding(s):\n${report}`).toEqual([]);
}

test("the index passes with nothing to fix", async ({ page }) => {
  await page.goto("/");
  await scan(page, "the index");
});

test("the dashboard passes with nothing to fix", async ({ page }) => {
  await page.goto("/learn");
  await scan(page, "the dashboard");
});

test("a formula drill passes before and after a miss", async ({ page }) => {
  await page.goto("/learn/excel/sum-basics");
  await expect(page.locator("#formula")).toBeVisible();
  await scan(page, "a fresh formula drill");

  // A wrong answer is the state a learner spends the most time in, and it is the one that adds a
  // verdict, a hint and a highlighted cell to the page.
  await page.fill("#formula", "=SUM(B1:B2)");
  await page.click("#check");
  await expect(page.locator("#feedback")).toHaveClass(/is-wrong/);
  await page.click("#hint");
  await expect(page.locator("#hint-text")).toBeVisible();
  await scan(page, "a formula drill after a miss, with its hint open");
});

test("the dashboard passes with progress in it", async ({ page }) => {
  // The empty dashboard is one shape; a dashboard with rows, badges and a bar is the one learners see.
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "es.progress",
      JSON.stringify({ v: 1, done: ["sum-basics", "if-pass-fail"], tries: { "average-scores": 3 } }),
    );
  });
  await page.goto("/learn");
  await expect(page.locator(".lesson-row").first()).toBeVisible();
  await scan(page, "the dashboard with progress");
});

test("the picture screen of a multi-screen drill passes", async ({ page }) => {
  await page.goto("/learn/excel/xlookup-search-from-the-bottom");
  await page.fill("#paywall-email", "learner@example.com");
  await page.click("#paywall-form button[type='submit']");
  await expect(page.locator("#formula")).toBeVisible();
  await page.fill("#formula", "=XLOOKUP(A7,A2:A6,B2:B6,,0,-1)");
  await page.click("#check");
  await expect(page.locator("[data-screen='2']")).toBeVisible();
  await scan(page, "a lesson's second screen");

  await page.fill("#formula", "=XLOOKUP(A8,A2:A6,B2:B6,,0,-1)");
  await page.click("#check");
  await expect(page.locator("[data-screen='3'] img")).toBeVisible();
  await scan(page, "a lesson's picture screen");
});
