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

import { seedBefore } from "../lib/seed.js";

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
  // `done` is keyed by exercise id, not slug: a seed the page cannot match paints nothing and passes.
  await page.addInitScript(() => {
    const at = new Date().toISOString();
    window.localStorage.setItem(
      "es.progress",
      JSON.stringify({
        v: 1,
        done: {
          "01-sum-basics": { at, tries: 1, helped: false },
          "04-if-pass-fail": { at, tries: 3, helped: false },
        },
        tries: {},
      }),
    );
  });
  await page.goto("/learn");
  await expect(page.locator("[data-badge='complete']").first()).toBeVisible();
  await scan(page, "the dashboard with progress");
});

test("a group page passes with progress in it", async ({ page }) => {
  // The same island on a page with one section instead of sixteen, and a heading that is a link.
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "es.progress",
      JSON.stringify({
        v: 1,
        done: { "01-sum-basics": { at: new Date().toISOString(), tries: 1, helped: false } },
        tries: {},
      }),
    );
  });
  await page.goto("/learn/groups/sum");
  await expect(page.locator("[data-group-count='sum']")).toHaveText("1 of 2");
  await scan(page, "a group page with progress");
});

test("a drill behind the order gate passes with nothing to fix", async ({ page }) => {
  await page.goto("/learn/excel/xlookup-search-from-the-bottom");
  await expect(page.locator("#paywall[data-gate='order']")).toBeVisible();
  await scan(page, "the order gate");
});

test("the picture screen of a multi-screen drill passes", async ({ page }) => {
  await seedBefore(page, "xlookup-search-from-the-bottom");
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

test("the shortcut panels of a shipped lesson pass", async ({ page }) => {
  await seedBefore(page, "countif-open-tickets");
  await page.goto("/learn/excel/countif-open-tickets");
  await page.fill("#formula", '=COUNTIF(B2:B9,"Open")');
  await page.click("#check");

  // Both panels are focusable groups with a name; only a browser that has laid them out can say
  // whether the keycaps inside them are readable, so both are scanned where a visitor reaches them.
  await expect(page.locator("[data-screen='2'] .keys-panel")).toBeVisible();
  await scan(page, "a lesson's chord screen");

  await page.keyboard.press("Control+Shift+L");
  await expect(page.locator("[data-screen='3'] .keys-panel")).toBeVisible();
  await scan(page, "a lesson's sequence screen");
});

test("the workbook panel of a shipped lesson passes", async ({ page }) => {
  await seedBefore(page, "capstone-margin");
  await page.goto("/learn/excel/capstone-margin");
  await page.fill("#paywall-email", "learner@example.com");
  await page.click("#paywall-form button[type='submit']");
  await expect(page.locator("#formula")).toBeVisible();
  await page.fill(
    "#formula",
    '=IFERROR(ROUND((SUMIF(A2:A5,"North",B2:B5)-SUMIF(A2:A5,"North",C2:C5))/SUMIF(A2:A5,"North",B2:B5)*100,1),"")',
  );
  await page.click("#check");

  // A workbook screen puts a download, a collapsible preview and a read-only grid on the page at once,
  // which is the most crowded screen the drill has: the preview's head has to name the sheet it opens.
  await expect(page.locator("[data-screen='2'] .workbook")).toBeVisible();
  await scan(page, "a lesson's workbook screen");

  await page.locator(".workbook-preview > summary").click();
  await scan(page, "a lesson's workbook screen with the preview collapsed");
});

test("the feedback dialog passes while it is open", async ({ page }) => {
  await page.goto("/");
  await page.click("#feedback-open");
  await expect(page.locator("#feedback-dialog")).toBeVisible();
  // The error line is part of the form a learner meets, so it is scanned with a message in it.
  await page.click("#feedback-form button[type='submit']");
  await expect(page.locator("#feedback-error")).not.toBeEmpty();
  await scan(page, "the feedback dialog");

  // And so is the confirmation, which replaces the form and so has to stand on its own.
  await page.check("input[name='mood'][value='stuck']");
  await page.fill("#feedback-text", "scanned");
  await page.click("#feedback-form button[type='submit']");
  await expect(page.locator("#feedback-done")).toBeVisible();
  await scan(page, "the feedback confirmation");
});

// The auth pages are the only forms on the site. Labels that point at nothing and disabled controls
// with no explanation are exactly what axe is good at, and both were live risks here: the forms are
// hand-written rather than generated from the templates the rest of the site uses.
test("the sign-in form passes with nothing to fix", async ({ page }) => {
  await page.goto("/login");
  await expect(page.locator(".auth-card h1")).toHaveText("Sign in");
  await scan(page, "the sign-in page");
});

test("the sign-up form passes with nothing to fix", async ({ page }) => {
  await page.goto("/signup");
  await expect(page.locator(".auth-card h1")).toHaveText("Create an account");
  await scan(page, "the sign-up page");
});

test("the account page passes with nothing to fix", async ({ page }) => {
  await page.goto("/account");
  await scan(page, "the account page with accounts unconfigured");
});
