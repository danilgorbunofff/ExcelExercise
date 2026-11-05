/**
 * Progress seeds for the browser. The order gate reads the published order, so a test that wants a
 * exercise past the frontier has to finish what comes before it — the same order the pages are built
 * from, read here rather than copied into the spec. A seed that copied the list would pass on the day
 * it was written and quietly gate the wrong exercise after the next lesson ships.
 */
import { join } from "node:path";

import { loadProjects } from "../legacy/src/site/projects.mjs";

import { loadSite } from "./site.js";

const AT = "2026-01-01T00:00:00.000Z";

/** The `es.progress` record a learner would have after finishing every exercise before `slug`. */
export function doneBefore(slug) {
  const { index } = loadSite();
  const at = index.findIndex((entry) => entry.slug === slug);
  if (at < 1) throw new Error(`${slug} is not a published exercise past the first, so nothing precedes it`);
  const done = {};
  for (const entry of index.slice(0, at)) done[entry.exercise.id] = { at: AT, tries: 0, helped: false };
  return { v: 1, done, tries: {}, unlocked: false };
}

/** Write that record before the page loads, so the island reads it on its first paint. */
export async function seedBefore(page, slug) {
  await page.addInitScript((seed) => {
    window.localStorage.setItem("es.progress", JSON.stringify(seed));
  }, doneBefore(slug));
}

/** The same record for the project shelf, which has its own loader and its own order. */
export function projectsBefore(slug) {
  const { index } = loadProjects(join(process.cwd(), "legacy/content"));
  const at = index.findIndex((entry) => entry.slug === slug);
  if (at < 1) throw new Error(`${slug} is not a project past the first, so nothing precedes it`);
  const done = {};
  for (const entry of index.slice(0, at)) done[entry.exercise.id] = { at: AT, tries: 0, helped: false };
  return { v: 1, done, tries: {}, unlocked: false };
}

/** Write that record before the page loads, so a project's gate reads the frontier it expects. */
export async function seedProjectsBefore(page, slug) {
  await page.addInitScript((seed) => {
    window.localStorage.setItem("es.progress", JSON.stringify(seed));
  }, projectsBefore(slug));
}

/**
 * The gate a paid lesson opens with, walked the way a visitor walks it: the nominated exercise offers one
 * free read (`#grace-pass`), every other paid one is a wall. Which of the two a slug gets is decided by
 * `track.json`, so the spec reads the page instead of assuming, and a catalog change that moves the
 * boundary keeps these tests honest rather than red.
 */
export async function passGate(page) {
  const gate = page.locator("#paywall");
  // Either the gate or the exercise itself shows up first: a lesson inside the free half is already open.
  await Promise.race([
    gate.waitFor({ state: "visible" }),
    page.locator("#formula").waitFor({ state: "visible" }),
  ]);
  if (!(await gate.isVisible())) return;

  const grace = page.locator("#grace-pass");
  if (await grace.isVisible()) {
    await grace.click();
    return;
  }
  // On a build with no store, the wall's own door is the browser-wide unlock. That is a real control a
  // visitor can press, not a test shortcut, and it only exists while nothing is for sale: with checkout
  // live this locator matches nothing and the spec fails loudly instead of pretending the wall opened.
  const unlock = page.locator("#gate-unlock");
  if (await unlock.isVisible()) {
    await unlock.click();
    return;
  }
  throw new Error("this exercise is behind the wall; seed progress up to a free or prompt exercise instead");
}
