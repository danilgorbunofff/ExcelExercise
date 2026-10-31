/**
 * The project shelf in a browser: the page that lists four spreadsheets, one project opened and worked,
 * the download that makes it a real spreadsheet, and the fourth project's wall.
 *
 * `tests/projects.test.js` proves the loader and the bytes; what only a browser can say is that the
 * shelf links what it names, that a project page is the drill player wearing a project's noun, that the
 * dataset link downloads a file the server serves with the spreadsheet MIME type, and that the gate
 * under a project offers to open a project.
 */
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import { seedProjectsBefore } from "../lib/seed.js";
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

  // The gate is on the shelf, not a surprise one click later.
  await expect(cards.nth(index.length - 1)).toHaveAttribute("data-gated", "true");
  await expect(cards.nth(index.length - 1).locator(".chip-trial")).toHaveText("Trial");
  await expect(page.locator(".project-card .chip-trial")).toHaveCount(1);

  // The shelf is reachable from the home page's menu, or nobody finds it.
  await page.goto("/");
  await expect(page.locator("nav.ways")).toContainText("Guided projects");
  await page.click("nav.ways a[href='/projects']");
  await expect(page.locator("#main h1")).toHaveText("Guided projects");
});

test("a project opens without a wall and grades its first task", async ({ page }) => {
  await page.goto(FIRST.path);

  await expect(page.locator("#paywall")).toBeHidden();
  await expect(page.locator("#formula")).toBeVisible();
  // The brief is on the page before the first task: eight tasks over one file make no sense without it.
  await expect(page.locator("#brief-title")).toBeVisible();
  await expect(page.locator("#main .project-brief")).toContainText(FIRST.brief[0].heading);
  // The counter names the shelf, and the rail climbs it.
  await expect(page.locator("header.site .drill-count")).toContainText("Project 1 of 4");

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

test("the fourth project is behind the wall every other project's order put it behind", async ({ page }) => {
  // Nothing finished: the order gate, wearing the shelf's noun rather than a drill's.
  await page.goto(LAST.path);
  const gate = page.locator("#paywall");
  await expect(gate).toBeVisible();
  await expect(gate).toHaveAttribute("data-gate", "order");
  // The frontier, not the one before it: an empty record means the first project is the one to finish.
  await expect(gate.locator(".paywall-title")).toHaveText(`Project ${LAST.number} opens after project ${FIRST.number}`);
  const go = gate.locator(".paywall-actions a");
  await expect(go).toHaveText(`Go to project ${FIRST.number}`);
  await expect(go).toHaveAttribute("href", FIRST.path);

  // The three before it finished: the boundary itself, which is the paid half of the shelf.
  await seedProjectsBefore(page, LAST.slug);
  await page.goto(LAST.path);
  await expect(gate).toHaveAttribute("data-gate", "prompt");
  await expect(gate.locator(".paywall-title")).toHaveText("The last project before the paid half");
  await expect(gate.locator(".paywall-body")).toContainText("Projects 1–3 are free and stay free");
  await page.click("#grace-pass");
  await expect(page.locator("#formula")).toBeVisible();
  await expect(page.locator("#paywall")).toHaveCount(0);
});
