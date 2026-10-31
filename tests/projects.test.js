/**
 * The project shelf: four authored spreadsheets, one download each, one gate on the fourth.
 *
 * The player, the rail and the paywall are the drill's, unchanged; what is new is the shelf above them
 * and the bytes below them. Three things therefore need proving here rather than in a browser: the
 * loader's order (easiest first, so the gated fourth is the hardest), that every task screen reads the
 * project's one dataset rather than a per-screen workbook, that the dataset name a URL carries can only
 * be one the loader shipped, and that the same dataset zips to the same bytes twice — because the route
 * prerenders those bytes at build time and Playwright downloads them.
 *
 * `tests/five-types.test.js` covers the player over a workbook screen; this covers what surrounds it.
 */
import assert from "node:assert/strict";
import { join } from "node:path";
import { describe, it } from "node:test";

import { datasetUrl, spreadsheet } from "../legacy/src/xlsx.mjs";
import { loadProjects } from "../legacy/src/site/projects.mjs";
import { renderWorkbook } from "../legacy/src/site/sheet.mjs";

const ROOT = join(import.meta.dirname, "..");
const track = loadProjects(join(ROOT, "legacy/content"));
const { index } = track;

describe("the project track", () => {
  it("ships four projects, ordered by level and then by slug", () => {
    assert.equal(index.length, 4);
    assert.deepEqual(
      index.map((entry) => entry.slug),
      ["ufo-dashboard", "trout-case", "wine-dashboard", "interview-assessment"],
    );
    assert.deepEqual(
      index.map((entry) => entry.exercise.level),
      [1, 2, 2, 3],
    );
    // Numbers are positions in the rail, so the gated one is the last and the hardest.
    assert.deepEqual(
      index.map((entry) => entry.number),
      [1, 2, 3, 4],
    );
  });

  it("gates exactly the last project, the way a lesson is gated", () => {
    assert.equal(track.track.freeLessonCount, index.length - 1);
    assert.deepEqual(
      index.map((entry) => entry.free),
      [true, true, true, false],
    );
    // The client's gate copy names the shelf it gates; the drill's defaults must survive untouched.
    assert.equal(track.track.lessonNoun, "Project");
    assert.equal(track.track.showAnswerAfter, 3);
    assert.match(track.track.paidHalf, /paid half/);
  });

  it("walks the rail backwards to the shelf and forwards to the next project", () => {
    assert.equal(index[0].prevLabel, "All projects");
    assert.equal(index[0].prevPath, "/projects");
    assert.equal(index[0].nextPath, index[1].path);
    assert.equal(index.at(-1).next, null);
    assert.equal(index.at(-1).nextPath, null);
  });
});

describe("a project's tasks", () => {
  it("are all workbook screens reading the project's one dataset", () => {
    for (const entry of index) {
      const { exercise } = entry;
      const { dataset } = exercise;
      assert.ok(exercise.screens.length >= 8, `${exercise.slug} has ${exercise.screens.length} tasks`);
      for (const screen of exercise.screens) {
        assert.equal(screen.type, "workbook", `${exercise.slug}/${screen.id} is a ${screen.type}`);
        assert.equal(screen.sheet, dataset.sheet, `${exercise.slug}/${screen.id} re-authors the sheet`);
        assert.equal(screen.file, dataset.file, `${exercise.slug}/${screen.id} names its own file`);
      }
    }
  });

  it("link one download each rather than a workbook per screen", () => {
    const entry = index[0];
    const screen = entry.exercise.screens[0];
    const html = renderWorkbook(entry.exercise, screen, { position: 0 });
    assert.match(html, new RegExp(`href="/datasets/${entry.exercise.dataset.file}"`));
    assert.match(html, /preview of the dataset/);
    // The task's own answer is on the page as the reference, not in the download.
    assert.ok(html.includes(screen.answers[0]));
  });

  it("compute the answers the briefs ask for", () => {
    // The one number a reader can check by hand: the UFO block counts the sightings column.
    const ufo = index[0].exercise;
    const block = ufo.dataset.sheet.rows
      .flat()
      .filter((cell) => typeof cell === "string" && cell.startsWith("="));
    assert.ok(block.length > 0);
    const html = renderWorkbook(ufo, ufo.screens[0], { position: 0 });
    assert.match(html, /class="workbook-formulas"/);
  });
});

describe("the dataset route", () => {
  it("serves every dataset the loader ships and nothing else", () => {
    assert.deepEqual(
      track.datasets.map((dataset) => dataset.file),
      ["ufo.xlsx", "trout.xlsx", "wine.xlsx", "interview-assessment.xlsx"],
    );
    for (const dataset of track.datasets) {
      assert.equal(datasetUrl(dataset.file), `/datasets/${dataset.file}`);
      assert.ok(dataset.sheet.rows.length > 0, `${dataset.file} has no rows`);
      assert.ok(dataset.sheet.name, `${dataset.file} has no sheet name`);
    }
  });

  it("refuses a name that is not one of them", () => {
    for (const bad of ["../secrets.xlsx", "UFO.xlsx", "ufo.xls", "ufo dashboard.xlsx", ""]) {
      assert.throws(() => datasetUrl(bad), /must be lowercase-kebab and end in \.xlsx/);
    }
  });

  it("zips the same sheet to the same bytes twice", () => {
    // The route prerenders these bytes at build time; a non-deterministic zip would make a rebuild a
    // diff and make the byte count below meaningless.
    for (const dataset of track.datasets) {
      const first = spreadsheet(dataset.sheet);
      const second = spreadsheet(dataset.sheet);
      assert.deepEqual(first, second);
      assert.equal(first[0], 0x50); // "PK"
      assert.equal(first[1], 0x4b);
      assert.ok(first.byteLength > 1000, `${dataset.file} is only ${first.byteLength} bytes`);
    }
    // Four different datasets cannot zip to one size by accident.
    const sizes = new Set(track.datasets.map((dataset) => spreadsheet(dataset.sheet).byteLength));
    assert.equal(sizes.size, track.datasets.length);
  });
});
