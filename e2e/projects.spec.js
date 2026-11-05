/**
 * The project shelf in a browser: the page that lists four spreadsheets, one project opened and worked,
 * the download that makes it a real spreadsheet, and the fourth project's wall.
 *
 * `tests/projects.test.js` proves the loader and the bytes; what only a browser can say is that the
 * shelf links what it names, that a project page is the exercise player wearing a project's noun, that the
 * dataset link downloads a file the server serves with the spreadsheet MIME type, and that the gate
 * under a project offers to open a project.
 */
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import { loadProjects } from "../legacy/src/site/projects.mjs";

const { index } = loadProjects(join(process.cwd(), "legacy/content"));
const FIRST = index[0];
const LAST = index.at(-1);
/** The first task a reader meets, and the answer the project itself carries for it. */
const SCREEN = FIRST.exercise.screens[0];
const ANSWER = SCREEN.answers[0];

test("the shelf lists every project, marks the gated one, and links each", async ({ page }) => {
  await page.goto("/projects");

  await expect(page.locator("#main h1")).toHaveText("Guided projects");
  const cards = page.locator(".project-card");
  await expect(cards).toHaveCount(index.length);

  for (const [position, entry] of index.entries()) {
    const card = cards.nth(position);
    await expect(card.locator(".project-link")).toHaveText(entry.exercise.title);
    await expect(card.locator(".project-link")).toHaveAttribute("href", entry.path);
    await expect(card.locator(".project-meta .rail-num")).toHaveText(String(entry.number).padStart(2, "0"));
  }

  // The gate is on the shelf, not a surprise one click later, and it says "Paid" rather than promising
  // a trial this site does not sell.
  const paid = index.filter((entry) => !entry.free);
  await expect(cards.nth(index.length - 1)).toHaveAttribute("data-gated", "true");
  await expect(cards.nth(index.length - 1).locator(".chip-paid")).toHaveText("Paid");
  await expect(page.locator(".project-card .chip-paid")).toHaveCount(paid.length);

  // The shelf is reachable from the home page's drawer — the only navigation the chrome has — or
  // nobody finds it.
  await page.goto("/");
  await page.click("#menu-open");
  await expect(page.locator("#site-menu a[href='/projects']")).toHaveText("Projects");
  await page.click("#site-menu a[href='/projects']");
  await expect(page.locator("#main h1")).toHaveText("Guided projects");
});

test("a project opens without a wall and grades its first task", async ({ page }) => {
  await page.goto(FIRST.path);

  await expect(page.locator("#paywall")).toBeHidden();
  await expect(page.locator("#formula")).toBeVisible();
  // The brief is on the page before the first task: eight tasks over one file make no sense without it.
  await expect(page.locator("#brief-title")).toBeVisible();
  await expect(page.locator("#main .project-brief")).toContainText(FIRST.brief[0].heading);
  // The header carries no fact, so the page says where it is itself: the rail marks the project the
  // reader is on, and every other row stays a plain link.
  await expect(page.locator(".rail-item[aria-current='page']")).toHaveCount(1);
  await expect(page.locator(".rail-item[aria-current='page']")).toContainText(FIRST.exercise.title);
  await expect(page.locator(".rail-item")).toHaveCount(index.length);

  const panel = page.locator("[data-screen='1'] .workbook");
  await expect(panel).toBeVisible();
  await expect(panel.locator("a.workbook-link")).toHaveAttribute("href", `/datasets/${FIRST.exercise.dataset.file}`);
  await expect(page.locator("#workbook-grid-0")).toHaveAttribute(
    "aria-label",
    `${FIRST.exercise.dataset.sheet.name}, preview of the dataset`,
  );

  await page.fill("#formula", ANSWER);
  await page.click("#check");
  await expect(page.locator("#feedback")).toHaveClass(/is-correct/);
  await expect(page.locator("#feedback-head")).toHaveText("Correct");
  // Eight tasks in order: the answer moves the project to task 2 rather than ending it.
  await expect(page.locator("#screen-position")).toContainText(`screen 2 of ${FIRST.exercise.screens.length} · `);
});

test("the dataset downloads as a spreadsheet with its own name", async ({ page }) => {
  const href = `/datasets/${FIRST.exercise.dataset.file}`;
  const response = await page.request.get(href);

  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toBe(
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  expect(response.headers()["content-disposition"]).toBe(`attachment; filename="${FIRST.exercise.dataset.file}"`);
  const bytes = await response.body();
  expect(bytes.subarray(0, 2).toString("latin1")).toBe("PK");
  expect(Number(response.headers()["content-length"])).toBe(bytes.byteLength);
  expect(bytes.byteLength).toBeGreaterThan(1000);

  // The route answers from the loader's whitelist, so a name it does not ship is a 404 and not a file.
  expect((await page.request.get("/datasets/nope.xlsx")).status()).toBe(404);
  expect((await page.request.get("/datasets/../package.json")).status()).toBe(404);
});

test("the fourth project is the shelf's one door into the paid half", async ({ page }) => {
  // Cold, with nothing finished: no order prerequisite. The prompt is the door into the paid half, so it is
  // exempt from the order gate exactly as lesson 49 is — a door that asks "finish project 1 first" is a wall.
  await page.goto(LAST.path);
  const gate = page.locator("#paywall");
  await expect(gate).toBeVisible();
  await expect(gate).toHaveAttribute("data-gate", "prompt");
  await expect(gate.locator(".paywall-title")).toHaveText("One project from the paid half, open");
  await expect(gate.locator(".paywall-body")).toContainText("The 3 free projects stay free for good");
  // One door on the card: the pass. The plan comparison is the link beside it, not a second button.
  await expect(gate.locator("button")).toHaveCount(1);
  await expect(page.locator("#formula")).toBeHidden();

  await page.click("#grace-pass");
  await expect(page.locator("#formula")).toBeVisible();
  await expect(page.locator("#paywall")).toHaveCount(0);

  // Once only, remembered in this browser: the second visit is the wall rather than the question.
  await page.reload();
  await expect(page.locator("#paywall")).toHaveAttribute("data-gate", "paywall");
  await expect(page.locator("#formula")).toBeHidden();
});

test("the projects shelf is free up to the last card, and says so", async ({ page }) => {
  // The three free projects are not order-gated either: a reader can start with the case they came for.
  for (const entry of index.filter((candidate) => candidate.free)) {
    await page.goto(entry.path);
    await expect(page.locator("#formula"), `${entry.slug} is free and should not be gated`).toBeVisible();
    await expect(page.locator("#paywall")).toHaveCount(0);
  }
});