/**
 * The WCAG 2.2 additions, the ones axe does not decide on its own.
 *
 * `a11y.spec.js` runs axe and fails on critical and serious findings, which covers names, roles,
 * labels and contrast. It cannot cover the criteria that depend on where things end up when the page
 * is laid out, or on how a form is filled:
 *
 *   2.4.11  Focus Not Obscured (Minimum) — the focused control must be visible, not under a sticky bar
 *   3.2.6   Consistent Help — the same help in the same relative place on every page
 *   3.3.8   Accessible Authentication — a password manager can fill the form, with no transcription test
 *
 * Each test below is one criterion, measured in a browser rather than promised in a doc. 3.3.7
 * (Redundant Entry) is proven where it is built: the sign-up form asks for a name once.
 */
import { expect, test } from "@playwright/test";

import { freeDrill } from "../lib/site.js";

// Tab and let the browser scroll the control into view before measuring. Smooth scrolling is behind
// `prefers-reduced-motion: no-preference` in this stylesheet, so asking for less motion is also what
// keeps the measurement from racing a scroll animation — and it is the path a visitor who asked for
// less motion actually gets.
test.use({ reducedMotion: "reduce" });

/**
 * Tab forward and report any control whose middle is covered by something else.
 *
 * `elementFromPoint` at the focused control's centre is the honest question a sighted keyboard user
 * asks: is the thing I am on actually the thing on top? A sticky header, a floating bar or an overlay
 * answers "no", and a focus ring nobody can see is the failure 2.4.11 describes.
 */
async function obscuredFindings(page, presses) {
  const findings = [];
  let visited = 0;
  for (let step = 0; step < presses; step += 1) {
    await page.keyboard.press("Tab");
    // Two frames: one for the scroll the focus caused, one for the paint it triggers.
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
    const seen = await page.evaluate(() => {
      const skip = () => ({ visited: false, finding: null });
      const miss = (finding) => ({ visited: true, finding });

      const element = document.activeElement;
      if (!element || element === document.body || element === document.documentElement) return skip();
      // A closed dialog's controls are focusable in the DOM but not on screen; they are not this test.
      if (element.closest("[hidden], dialog:not([open]), .visually-hidden")) return skip();
      if (getComputedStyle(element).pointerEvents === "none") return skip();
      const box = element.getBoundingClientRect();
      if (box.width < 2 || box.height < 2) return skip();

      const left = Math.max(box.left, 0);
      const right = Math.min(box.right, innerWidth);
      const top = Math.max(box.top, 0);
      const bottom = Math.min(box.bottom, innerHeight);
      const name =
        element.getAttribute("aria-label") ||
        element.textContent.trim().slice(0, 40) ||
        element.tagName.toLowerCase();

      if (right - left < 2 || bottom - top < 2) {
        return miss(`${name} — entirely outside the viewport at ${Math.round(box.left)},${Math.round(box.top)}`);
      }

      const hit = document.elementFromPoint((left + right) / 2, (top + bottom) / 2);
      if (!hit) return miss(`${name} — nothing is painted where it sits`);
      if (hit === element || element.contains(hit) || hit.contains(element)) return miss(null);
      const cover = hit.closest("header, footer, nav, dialog, [role='dialog'], [data-cover]");
      const coverName = cover
        ? cover.tagName.toLowerCase() + (cover.className ? `.${String(cover.className).split(" ")[0]}` : "")
        : hit.tagName.toLowerCase();
      return miss(`${name} — covered by ${coverName}`);
    });
    if (seen.visited) visited += 1;
    if (seen.finding) findings.push(seen.finding);
  }
  return { findings, visited };
}

test("a keyboard user can see every control they tab to, on the front door", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  // Counted, so a page that stops rendering controls fails this test instead of passing it vacuously.
  const { findings, visited } = await obscuredFindings(page, 40);
  expect(visited).toBeGreaterThan(20);
  expect(findings).toEqual([]);
});

test("a keyboard user can see every control they tab to, in a drill", async ({ page }) => {
  await page.goto(`/learn/excel/${freeDrill().slug}`);
  await page.waitForLoadState("networkidle");
  // The formula bar, the rail, the hint button and the sheet are all in this count; the sheet's sticky
  // header row is the one thing that could sit over a control, and this is what says it does not.
  const { findings, visited } = await obscuredFindings(page, 60);
  expect(visited).toBeGreaterThan(20);
  expect(findings).toEqual([]);
});

test("a keyboard user can see every control they tab to, on the offer page", async ({ page }) => {
  await page.goto("/pricing");
  await page.waitForLoadState("networkidle");
  const { findings, visited } = await obscuredFindings(page, 30);
  expect(visited).toBeGreaterThan(10);
  expect(findings).toEqual([]);
});

test("the drill's verdict is announced, not only painted", async ({ page }) => {
  await page.goto(`/learn/excel/${freeDrill().slug}`);
  // The verdict is the whole point of a drill: green for accepted, red for missed. 4.1.3 asks that the
  // change reaches assistive technology without moving focus, which is exactly what `role="status"`
  // declares; `aria-live` is the same promise in the form older screen readers still read.
  const verdict = page.locator("#feedback");
  await expect(verdict).toHaveAttribute("role", "status");
  await expect(verdict).toHaveAttribute("aria-live", "polite");
});

test("the help route is the same three things in the same order on every page", async ({ page }) => {
  const PAGES = ["/", "/pricing", "/learn", "/excel-exercises", "/privacy", "/excel-functions"];
  const shape = [];
  for (const path of PAGES) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const footer = await page.evaluate(() =>
      [...document.querySelectorAll("footer a, footer button")]
        // The feedback dialog lives inside the footer, so its own Send/Cancel/Close are not the
        // support line this test is comparing.
        .filter((element) => element.closest("dialog") === null)
        .map((element) => (element.getAttribute("aria-label") || element.textContent).trim()),
    );
    shape.push([path, footer]);
  }
  // 3.2.6 does not ask for a help page; it asks that whatever help exists sits in the same relative
  // order wherever a visitor lands. The feedback dialog is that mechanism, and it is the last item of
  // the same footer on all six pages.
  const expected = ["Privacy", "Terms", "Send feedback"];
  for (const [path, footer] of shape) {
    expect(footer, `${path} does not end with the same support line`).toEqual(expected);
  }
});

test("the sign-in form can be filled by a password manager, not by memory", async ({ page }) => {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  // The page also carries the footer's feedback form, which has no password field; the criterion is
  // about the sign-in form, so ask that form specifically.
  const fields = await page.evaluate(() => {
    const form = document.querySelector("main form");
    return [...(form?.querySelectorAll("input") ?? [])]
      .filter((input) => input.type !== "hidden")
      .map((input) => ({ type: input.type, autocomplete: input.getAttribute("autocomplete") }));
  });
  // 3.3.8 (Minimum): the purpose of each field is machine-readable, so a manager can fill it. A form
  // that says `autocomplete="off"` on a password field fails this, and so does one that hides the
  // field behind a puzzle.
  expect(fields).toEqual([
    { type: "email", autocomplete: "email" },
    { type: "password", autocomplete: "current-password" },
  ]);
  expect(await page.locator("iframe[src*='captcha'], iframe[title*='captcha']").count()).toBe(0);
});

test("the sign-up form asks for a new password, not an existing one", async ({ page }) => {
  await page.goto("/signup");
  await page.waitForLoadState("networkidle");
  const password = await page.evaluate(() => {
    const input = document.querySelector('input[type="password"]');
    return input ? input.getAttribute("autocomplete") : null;
  });
  expect(password).toBe("new-password");
});

test("nothing the visitor must type is behind a text-transcription test", async ({ page }) => {
  for (const path of ["/login", "/signup", "/reset"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const traps = await page.evaluate(() =>
      [...document.querySelectorAll("input[autocomplete='off'], [class*='captcha'], [id*='captcha']")].map(
        (element) => `${element.tagName.toLowerCase()}#${element.id || ""}.${element.className || ""}`,
      ),
    );
    expect(traps, `${path} blocks autofill or asks for a transcription`).toEqual([]);
  }
});
