/**
 * The drill loop, end to end, in a real browser: type a formula, check it, read the verdict. The
 * grader itself is covered by `tests/golden/`; this proves the shipped page wires the input, the
 * button and the verdict together without a build-time shortcut.
 */
import { expect, test } from "@playwright/test";

import { passGate, seedBefore } from "../lib/seed.js";
import { freeDrill, loadSite } from "../lib/site.js";

const LESSONS = loadSite().index.length;
/** The opening intro drill: the free half is the three intro lessons, so this one has no gate in
 *  front of it and the literals below are hand-computed against `what-a-formula-actually-does`. */
const FREE = freeDrill();

const ANSWER_CELL = ".cell[data-cell='B5']";

async function openDrill(page, slug) {
  await page.goto(`/learn/excel/${slug}`);
  await expect(page.locator("#formula")).toBeVisible();
}

/** A drill past the free ones: the paywall opens the first time an email is entered, and the trial
 *  is remembered in this browser, so this is the real path to a later lesson. The drills before it are
 *  finished first, because the order gate is asked before the trial form and would otherwise be the
 *  only wall this test ever sees. */
async function openGatedDrill(page, slug) {
  await seedBefore(page, slug);
  await page.goto(`/learn/excel/${slug}`);
  await passGate(page);
  await expect(page.locator("#formula")).toBeVisible();
}

async function check(page, formula) {
  await page.fill("#formula", formula);
  await page.click("#check");
}

test("a correct formula is accepted and reported", async ({ page }) => {
  await openDrill(page, FREE.slug);

  await check(page, "=SUM(B2:B4)");
  await expect(page.locator("#feedback")).toHaveClass(/is-correct/);
  await expect(page.locator("#feedback-head")).toHaveText("Correct");
  await expect(page.locator("#feedback-body")).toHaveText("B5 holds 35.");
  await expect(page.locator(ANSWER_CELL)).toHaveClass(/cell-correct/);
  // Only a rejection marks the bar; a verdict that is not one leaves it out of the invalid state.
  await expect(page.locator("#formula")).not.toHaveAttribute("aria-invalid", "true");
});

test("a wrong total keeps the SUM and names the value rule", async ({ page }) => {
  await openDrill(page, FREE.slug);

  await check(page, "=SUM(B2:B3)");
  await expect(page.locator("#feedback")).toHaveClass(/is-wrong/);
  await expect(page.locator("#feedback-head")).toHaveText("Not the answer");
  await expect(page.locator("#feedback-body")).toHaveText(
    "Your formula returns 21, but this lesson expects 35.",
  );
  await expect(page.locator(ANSWER_CELL)).toHaveClass(/cell-wrong/);
  // The verdict is a live region, so it is announced once; the flag is what is still there when a
  // screen reader user comes back to the bar and asks what it holds.
  await expect(page.locator("#formula")).toHaveAttribute("aria-invalid", "true");

  // And the retry clears it — the old verdict no longer describes what is in the bar.
  await check(page, "=SUM(B2:B4)");
  await expect(page.locator("#feedback")).toHaveClass(/is-correct/);
  await expect(page.locator("#formula")).not.toHaveAttribute("aria-invalid", "true");

  // Time on task is reported twice: for the drill and for the screen that spent it. The second cannot
  // exceed the first, and neither can be negative.
  const event = await page.evaluate(() =>
    [...(window.__esEvents ?? [])].reverse().find((entry) => entry.type === "check_wrong"),
  );
  expect(event.elapsed).toBeGreaterThanOrEqual(event.screen_elapsed);
  expect(event.screen_elapsed).toBeGreaterThanOrEqual(0);
});

test("the missing function is rejected before the value is even considered", async ({ page }) => {
  await openDrill(page, FREE.slug);

  await check(page, "=B2+B3+B4");
  await expect(page.locator("#feedback")).toHaveClass(/is-wrong/);
  await expect(page.locator("#feedback-body")).toContainText("This lesson is about SUM");
  await expect(page.locator("#feedback-head")).not.toHaveText("Correct");
});

test("a formula that cannot be read points at the character", async ({ page }) => {
  await openDrill(page, FREE.slug);

  await check(page, "=SUM(B2:B4");
  await expect(page.locator("#feedback")).toHaveClass(/is-wrong/);
  await expect(page.locator("#feedback-head")).toHaveText("The formula cannot be read");
  await expect(page.locator(".feedback-caret")).toBeVisible();
});

test("a lesson the record already holds reads as a revisit, not as a first attempt", async ({ page }) => {
  // The completed record is what makes this lesson done; arriving with it is the whole test. The page
  // must say so instead of greeting a second visit with a first attempt's congratulations.
  await page.addInitScript((lessonId) => {
    window.localStorage.setItem(
      "es.progress",
      JSON.stringify({
        v: 1,
        done: { [lessonId]: { at: "2026-01-01T00:00:00.000Z", tries: 1, helped: false } },
        tries: {},
        unlocked: false,
      }),
    );
  }, FREE.exercise.id);

  await openDrill(page, FREE.slug);
  const feedback = page.locator("#feedback");
  await expect(feedback).toHaveClass(/is-revisit/);
  // A revisit is not a verdict, so it is not dressed as one.
  await expect(feedback).not.toHaveClass(/is-correct|is-wrong/);
  await expect(page.locator("#feedback-head")).toHaveText("Already solved");
  await expect(page.locator("#feedback-body")).toContainText(
    "The answer is in the bar and in the cell — edit either one to practise it again.",
  );
  await expect(page.locator("#feedback .feedback-meta")).toContainText("On your record since");
  // The answer is handed back rather than asked for again.
  await expect(page.locator("#formula")).toHaveValue("=SUM(B2:B4)");
  await expect(page.locator(ANSWER_CELL)).toHaveClass(/cell-correct/);

  // Answering again is still graded, and says what it is: a second solve, not a first one.
  await check(page, "=SUM(B2:B4)");
  await expect(feedback).toHaveClass(/is-correct/);
  await expect(page.locator("#feedback .feedback-meta")).toHaveText(
    "Solved again — this lesson was already on your record.",
  );
});

test("the award the server reports lands in the finished verdict, above the way out", async ({ page }) => {
  // The sender is the only thing that knows the page's origin, so the event it dispatches is faked
  // here — what is under test is the drill's half: that the line appears, where, and for whom.
  const reward = (lessonId) =>
    page.evaluate(
      ([id]) =>
        document.dispatchEvent(
          new CustomEvent("es:reward", { detail: { lessonId: id, points: { awarded: 12 }, streak: { current: 3 } } }),
        ),
      [lessonId],
    );

  await openDrill(page, FREE.slug);

  // Nothing is paid for a miss, and there is no verdict to decorate before one is given.
  await reward(FREE.exercise.id);
  await expect(page.locator(".feedback-reward")).toHaveCount(0);

  await check(page, "=SUM(B2:B3)");
  await expect(page.locator("#feedback")).toHaveClass(/is-wrong/);
  await reward(FREE.exercise.id);
  await expect(page.locator(".feedback-reward")).toHaveCount(0);

  await check(page, "=SUM(B2:B4)");
  await expect(page.locator("#feedback")).toHaveClass(/is-correct/);
  // A batch for another lesson is another page's award.
  await reward(FREE.next.id);
  await expect(page.locator(".feedback-reward")).toHaveCount(0);

  await reward(FREE.exercise.id);
  const line = page.locator("#feedback .feedback-reward");
  await expect(line).toHaveText("+12 points · 3-day streak");
  // The next drill is what the panel ends on, so the award goes above it — and the reward does not
  // take the focus the next link was given.
  const order = await page.evaluate(() => {
    const panel = document.getElementById("feedback");
    return [...panel.children].map((child) => child.className);
  });
  expect(order.indexOf("feedback-reward")).toBeLessThan(order.findIndex((name) => name.includes("next-cta")));
  await expect(page.locator("#feedback .next-cta")).toBeFocused();

  // Replacing the verdict clears the award with it: it described the lesson that just ended.
  await page.fill("#formula", "=SUM(B2:B3)");
  await page.click("#check");
  await expect(page.locator(".feedback-reward")).toHaveCount(0);
});

test("a multi-screen lesson walks to its picture screen and completes on typed text", async ({ page }) => {
  await openGatedDrill(page, "xlookup-search-from-the-bottom");

  // The later screens exist in the markup from the first paint, so they are hidden rather than
  // absent: the panel is what a real browser has to switch, not something a script has to build.
  await expect(page.locator("#screen-position")).toHaveText("screen 1 of 3 · ");
  await expect(page.locator("#screen-answer-cell")).toHaveText("B7");
  await expect(page.locator("[data-screen='1']")).toBeVisible();
  await expect(page.locator("[data-screen='2']")).toBeHidden();

  await check(page, "=XLOOKUP(A7,A2:A6,B2:B6,,0,-1)");
  await expect(page.locator("#feedback")).toHaveClass(/is-correct/);
  await expect(page.locator("#feedback .feedback-meta")).toHaveText("Right first time. Screen 2 of 3.");
  // The trial opened the drill, so the first screen view has to come from the paywall's exit.
  const firstView = await page.evaluate(() =>
    (globalThis.__esEvents ?? []).find((event) => event.type === "screen_view"),
  );
  expect(firstView.gated).toBe(true);
  await expect(page.locator("[data-screen='1']")).toBeHidden();
  await expect(page.locator("[data-screen='2']")).toBeVisible();
  await expect(page.locator("#screen-answer-cell")).toHaveText("B8");

  await check(page, "=XLOOKUP(A8,A2:A6,B2:B6,,0,-1)");
  await expect(page.locator("#feedback .feedback-meta")).toHaveText("Right first time. Screen 3 of 3.");

  // A picture screen has no target cell, so the chip goes dark, the note names the bar instead,
  // and the bar takes typed text rather than a formula.
  await expect(page.locator("[data-screen='3']")).toBeVisible();
  const picture = page.locator("[data-screen='3'] .picture-img");
  await expect(picture).toBeVisible();
  // The panel is hidden until this screen, so the image is fetched now: a 404 would still paint a
  // box, and only a decoded width proves the SVG the build copied is the one the screen asked for.
  await expect.poll(() => picture.evaluate((img) => img.naturalWidth)).toBeGreaterThan(0);
  await expect(page.locator("#ref-chip")).toBeHidden();
  await expect(page.locator("#screen-answer-cell")).toHaveText("the bar");
  await expect(page.locator("#formula")).toHaveAttribute("aria-label", "Your answer");

  // A phone card is about 290 px wide and the shipped SVG is 524 units, so fitting it shrinks the
  // figure's own text under 8 px. The figure keeps its scale instead and the card scrolls sideways,
  // which only helps if the box is reachable and the arrows are not swallowed by the grid handler.
  const desktop = page.viewportSize();
  await page.setViewportSize({ width: 375, height: 800 });
  const figure = page.locator("[data-screen='3'] .picture-scroll");
  await expect(figure).toBeVisible();
  await expect(figure).toHaveAttribute("tabindex", "0");
  const [scrollWidth, clientWidth] = await figure.evaluate((node) => [node.scrollWidth, node.clientWidth]);
  expect(scrollWidth).toBeGreaterThan(clientWidth);
  expect(await picture.evaluate((img) => Math.round(img.getBoundingClientRect().width))).toBeGreaterThanOrEqual(
    await picture.evaluate((img) => img.naturalWidth),
  );
  await figure.focus();
  // `html` scrolls smoothly, so the focus jump can still be moving when the first press lands: press
  // until the box moves instead of assuming which press is the one that counts.
  for (let step = 0; step < 6 && (await figure.evaluate((node) => node.scrollLeft)) === 0; step += 1) {
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(150);
  }
  await expect.poll(() => figure.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
  await page.setViewportSize(desktop);

  // A near miss is graded as text and nothing echoes the answer it wanted.
  await check(page, "C2:C6");
  await expect(page.locator("#feedback")).toHaveClass(/is-wrong/);
  await expect(page.locator("#feedback-head")).toHaveText("Not the answer");
  await expect(page.locator("#feedback-body")).toHaveText("That is not what the image shows.");
  await expect(page.locator("#formula")).toHaveValue("C2:C6");

  // `$B$2:$B$6` names the same range as the accepted spelling, and `=` is the prefix every lesson
  // in the track teaches, so neither is a trap on the one screen that grades typed text.
  await check(page, "=$B$2:$B$6");
  await expect(page.locator("#feedback-head")).toHaveText("Correct");
  await expect(page.locator("#feedback-body")).toHaveText("The answer is B2:B6.");
  await expect(page.locator(".rail-item[data-lesson='16-xlookup-search-from-the-bottom']")).toHaveClass(/is-done/);
});

/** The funnel buffer the drill fills, newest last. */
function lastElapsed(page, type) {
  return page.evaluate((wanted) => {
    const all = globalThis.__esEvents ?? [];
    const found = [...all].reverse().find((event) => event.type === wanted);
    return found ? found.elapsed : null;
  }, type);
}

/** Playwright keeps the page foregrounded, so the tab is hidden by hand and the event a real
 *  background tab fires is dispatched: the clock has to agree without the browser playing along. */
function setHidden(page, hidden) {
  return page.evaluate((value) => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => value });
    document.dispatchEvent(new Event("visibilitychange"));
  }, hidden);
}

test("the session clock stops while the tab is hidden", async ({ page }) => {
  await openDrill(page, FREE.slug);
  const opened = await lastElapsed(page, "screen_view");
  expect(typeof opened).toBe("number");

  // Four seconds hidden, then one in front of the learner. The gap between "the hidden time was not
  // counted" and "it was" is four seconds wide, so a loaded parallel runner that stalls the tab for an
  // extra second cannot turn an honest clock into a failure: counting the hidden time would report at
  // least five, and the assertion refuses anything above three.
  await setHidden(page, true);
  await page.waitForTimeout(4000);
  await setHidden(page, false);
  await page.waitForTimeout(1000);
  await check(page, "=SUM(B2:B4)");

  const answered = await lastElapsed(page, "check_correct");
  expect(answered - opened).toBeGreaterThanOrEqual(1);
  expect(answered - opened).toBeLessThanOrEqual(3);
});

test("progress survives a reload on the same device", async ({ page }) => {
  await openDrill(page, FREE.slug);
  await check(page, "=SUM(B2:B4)");
  await expect(page.locator("#feedback")).toHaveClass(/is-correct/);

  await page.reload();
  await expect(page.locator(`.rail-item[data-lesson='${FREE.exercise.id}']`)).toHaveClass(/is-done/);
  await expect(page.locator("#progress-count")).toHaveText(`1 of ${LESSONS}`);
});

test("a drill in a browser that refuses storage warns before the work evaporates", async ({ page }) => {
  // The failure mode this closes: `createStore().write` swallows the throw by design, so a finished
  // lesson vanishes on reload with no explanation. The dashboard already owned the honest sentence;
  // the drill repeats it where the save happens.
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new DOMException("storage is blocked", "SecurityError");
      },
    });
  });
  await openDrill(page, FREE.slug);

  await expect(page.locator("#rail-blocked")).toBeVisible();
  await expect(page.locator("#rail-blocked")).toHaveText(
    "This browser blocks local storage, so nothing is saved. The drills still work, but this page cannot remember them.",
  );
  // Only the memory is gone; the drill still grades.
  await check(page, "=SUM(B2:B4)");
  await expect(page.locator("#feedback")).toHaveClass(/is-correct/);
});

test("arrow keys move the selection and stop at the edge of the block", async ({ page }) => {
  await openDrill(page, FREE.slug);
  const cell = (key) => page.locator(`.cell[data-cell='${key}']`);
  const selected = (key) => expect(cell(key)).toHaveAttribute("aria-selected", "true");
  /** Press a key on the cell that holds the selection, the way a learner's focus does. */
  const press = async (key, on) => {
    await cell(on).press(key);
    return page.locator(".cell[aria-selected='true']").getAttribute("data-cell");
  };

  await cell("B2").click();
  await selected("B2");

  // Movement comes from the sheet model, so it walks the cells the page drew, not the DOM order.
  expect(await press("ArrowDown", "B2")).toBe("B3");
  expect(await press("ArrowLeft", "B3")).toBe("A3");
  expect(await press("ArrowUp", "A3")).toBe("A2");
  expect(await press("ArrowRight", "A2")).toBe("B2");

  // The block is A1:B5, so the selection stops at each edge instead of wrapping to the far side.
  expect(await press("ArrowRight", "B2")).toBe("B2");
  expect(await press("ArrowUp", "B2")).toBe("B1");
  expect(await press("ArrowUp", "B1")).toBe("B1");
  expect(await press("ArrowLeft", "B1")).toBe("A1");
  expect(await press("ArrowLeft", "A1")).toBe("A1");
  expect(await press("End", "A1")).toBe("B1");
  expect(await press("Home", "B1")).toBe("A1");
  for (let step = 0; step < 4; step += 1) await press("ArrowDown", "A1");
  expect(await press("ArrowDown", "A5")).toBe("A5");

  // A key that is not navigation is not swallowed, and selecting the answer cell hands the bar back.
  expect(await press("Enter", "A5")).toBe("A5");
  await expect(page.locator("#formula")).toBeDisabled();
  expect(await press("ArrowRight", "A5")).toBe("B5");
  await expect(page.locator("#formula")).toBeEnabled();
  await check(page, "=SUM(B2:B4)");
  await expect(page.locator("#feedback")).toHaveClass(/is-correct/);
});

test("a shortcut lesson grades the keys it asks for, and keeps its steps in order", async ({ page }) => {
  // This drill carries the chord and sequence screens, and the catalog now puts it past the free
  // three, so the trial form is part of reaching it.
  await openGatedDrill(page, "countif-open-tickets");

  await check(page, '=COUNTIF(B2:B9,"Open")');
  await expect(page.locator("#feedback")).toHaveClass(/is-correct/);

  // A chord screen has no cell to answer in: the panel of keycaps takes the sheet's place, the chip
  // goes dark to "the keys", the bar says what to type, and the panel holds the focus because the
  // keys only reach the page while it does.
  await expect(page.locator("[data-screen='2']")).toBeVisible();
  const chordPanel = page.locator("[data-screen='2'] .keys-panel");
  await expect(chordPanel).toBeVisible();
  await expect(page.locator("#ref-chip")).toBeHidden();
  await expect(page.locator("#screen-answer-cell")).toHaveText("the keys");
  await expect(page.locator("#formula")).toHaveAttribute("aria-label", "Type the shortcut");
  expect(await chordPanel.evaluate((el) => el.contains(document.activeElement))).toBe(true);

  // A press that is close but wrong costs an attempt. A press is graded as a press, so the line is
  // the press's own rather than the typed fallback's spelling lesson — and nothing here names the key
  // it wanted, which only the reveal may do.
  await page.keyboard.press("Control+Alt+L");
  await expect(page.locator("#feedback")).toHaveClass(/is-wrong/);
  await expect(page.locator("#feedback-body")).toHaveText("That is not the shortcut this task wants.");

  // The real shortcut, pressed on the keyboard, completes the screen — and the line that reports it
  // names the keys rather than the formula the lesson opened with.
  await page.keyboard.press("Control+Shift+L");
  await expect(page.locator("#feedback")).toHaveClass(/is-correct/);
  await expect(page.locator("#feedback-body")).toHaveText(/^The shortcut is .*L\.$/);

  // A sequence is a procedure, so its steps stack down the panel instead of wrapping into one row.
  await expect(page.locator("[data-screen='3']")).toBeVisible();
  await expect(page.locator("[data-screen='3'] .keys-panel")).toHaveClass(/keys-panel-sequence/);
  expect(
    await page
      .locator("[data-screen='3'] .keys-steps")
      .evaluate((el) => getComputedStyle(el).flexDirection),
  ).toBe("column");
  await expect(page.locator("#formula")).toHaveAttribute("aria-label", "Type the keys in order");

  // Spelling the run in the bar is the path a browser that eats the keys has to take, and it is
  // graded on the order: the same four presses out of sequence are refused.
  await check(page, "Alt, H, I, O");
  await expect(page.locator("#feedback")).toHaveClass(/is-wrong/);
  await expect(page.locator("#feedback-body")).toHaveText(
    "That is not the sequence. Type every press in order, separated by commas, like Alt, H, O.",
  );

  await check(page, "Alt, H, O, I");
  await expect(page.locator("#feedback")).toHaveClass(/is-correct/);
  await expect(page.locator("#feedback-body")).toHaveText(/^The keys are .*I\.$/);
});

test("a workbook lesson hands over the file and grades the answer it asks for", async ({ page }) => {
  // The fifth screen type ships on the capstone: a real .xlsx plus a preview built from the same rows,
  // because a screen that graded a file the page never showed would not be answerable.
  await openGatedDrill(page, "capstone-margin");

  await check(
    page,
    '=IFERROR(ROUND((SUMIF(A2:A5,"North",B2:B5)-SUMIF(A2:A5,"North",C2:C5))/SUMIF(A2:A5,"North",B2:B5)*100,1),"")',
  );
  await expect(page.locator("#feedback")).toHaveClass(/is-correct/);

  await expect(page.locator("[data-screen='2']")).toBeVisible();
  const panel = page.locator("[data-screen='2'] .workbook");
  await expect(panel).toBeVisible();

  // The download is a real file, not a decorative link: the server answers with a ZIP, which is what
  // an .xlsx is.
  const href = await panel.locator("a.workbook-link").getAttribute("href");
  expect(href).toBe("/assets/files/capstone-margin-book-1.xlsx");
  const file = await page.request.get(href);
  expect(file.status()).toBe(200);
  expect((await file.body()).subarray(0, 2).toString("latin1")).toBe("PK");

  // The preview carries the same rows, including the B7 the prompt names, so the question is fair
  // without Excel.
  const grid = page.locator("#workbook-grid-1");
  await expect(grid).toBeVisible();
  await expect(grid).toHaveAttribute("aria-label", "Margin, preview of the workbook");
  await expect(grid.locator(".cell[data-cell='A7']")).toHaveText("North gross margin %");

  // A workbook screen answers in words, so the target chip goes dark and the note sends the learner to
  // the bar rather than to a cell they cannot edit.
  await expect(page.locator("#ref-chip")).toBeHidden();
  await expect(page.locator("#screen-answer-cell")).toHaveText("the bar");
  await expect(page.locator("#formula")).toHaveAttribute("aria-label", "Your answer");

  await check(page, "44");
  await expect(page.locator("#feedback")).toHaveClass(/is-wrong/);

  await check(page, "44.8");
  await expect(page.locator("#feedback")).toHaveClass(/is-correct/);
  await expect(page.locator("#feedback-body")).toHaveText("The answer is 44.8.");
});
