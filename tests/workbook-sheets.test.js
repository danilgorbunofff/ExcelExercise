/**
 * What a screen's `.xlsx` holds.
 *
 * The writer is tested on its own (`tests/xlsx.test.js`); this pins the decision above it — which tabs
 * a screen ships, and which formula goes in the answer cell on the second one. The first tab has to be
 * the grid the page draws, cell for cell, or the download answers a different question than the lesson.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { exerciseSheet, screenSheets, solutionFormula } from "../legacy/src/site/workbook-sheets.mjs";
import { LESSONS } from "./lessons.js";

/** A screen with a grid and a target cell, in the shape the schema validates. */
function screen(overrides = {}) {
  return {
    id: "formula-1",
    type: "formula",
    prompt: "Total the units.",
    grid: { startCell: "A1", rows: [["Item", "Units"], ["Widget", 3], ["Total", null]] },
    answerCell: "B3",
    expect: { value: "3" },
    ...overrides,
  };
}

describe("the tabs a screen ships", () => {
  it("puts the grid on the first tab, cell for cell", () => {
    const [exercise] = screenSheets(screen());
    assert.equal(exercise.name, "Exercise");
    assert.deepEqual(exercise.rows, screen().grid.rows);
    assert.equal(exercise.startCell, "A1");
  });

  it("writes the answer formula into the answer cell on the second tab", () => {
    const [, solution] = screenSheets(screen({ fixtures: { accept: ["=SUM(B2:B3)"], reject: [] } }));
    assert.equal(solution.name, "Solution");
    assert.equal(solution.rows[2][1], "=SUM(B2:B3)");
    // Everything the first tab holds is still there, so the two tabs read as one sheet.
    assert.deepEqual(solution.rows[0], ["Item", "Units"]);
    assert.equal(solution.rows[1][1], 3);
  });

  it("leaves the grid it was given alone", () => {
    const source = screen({ fixtures: { accept: ["=SUM(B2:B3)"], reject: [] } });
    screenSheets(source);
    assert.equal(source.grid.rows[2][1], null, "the solution tab wrote back into the exercise grid");
  });

  it("ships the authored sheet alone when the answer is written in prose", () => {
    const sheet = { name: "Orders", startCell: "A1", rows: [["Total", "=SUM(B2:B3)"]] };
    const sheets = screenSheets({ id: "book-1", type: "workbook", sheet, reference: "Orders, A1" });
    assert.deepEqual(sheets, [sheet], "a workbook screen grew a tab it cannot fill");
  });

  it("has nothing to write for a screen with neither a grid nor a sheet", () => {
    assert.equal(screenSheets({ id: "chord-1", type: "chord", keys: ["ctrl+s"] }), null);
    assert.equal(screenSheets({ id: "picture-1", type: "picture", image: "images/x.png" }), null);
  });

  it("renames the solution tab rather than repeating a name Excel refuses", () => {
    const sheet = { name: "Solution", startCell: "A1", rows: [["a"]] };
    const sheets = screenSheets({ id: "s", sheet, answerCell: "A1", fixtures: { accept: ["=1+1"] } });
    assert.deepEqual(
      sheets.map((tab) => tab.name),
      ["Solution", "Answers"],
    );
  });

  it("refuses an answer cell outside the grid instead of writing it out of range", () => {
    assert.throws(
      () => screenSheets(screen({ answerCell: "D9", fixtures: { accept: ["=SUM(B2:B3)"] } })),
      /outside the sheet starting at A1/,
    );
  });
});

describe("the formula that goes in the answer cell", () => {
  it("prefers the screen's own reference", () => {
    assert.equal(solutionFormula({ reference: "=A1*2", fixtures: { accept: ["=B1*2"] } }), "=A1*2");
  });

  it("reads the lesson's docs reference when the screen has none", () => {
    assert.equal(solutionFormula({ docs: { reference: "=SUM(A1:A3)" } }), "=SUM(A1:A3)");
  });

  it("falls through prose to the first accepted answer", () => {
    // Workbook screens name a cell in words; the grader's own accepted answer is then the authority.
    assert.equal(
      solutionFormula({ docs: { reference: "Orders, D4" }, fixtures: { accept: ["=B2*C2"] } }),
      "=B2*C2",
    );
  });

  it("has nothing when the screen states no formula", () => {
    assert.equal(solutionFormula({ reference: "Orders, D4", fixtures: { accept: ["17.5"] } }), null);
    assert.equal(solutionFormula({}), null);
  });

  it("gives every shipped formula screen a two-tab file", () => {
    const screens = LESSONS.flatMap(({ screens }) => screens.map(({ screen }) => screen)).filter(
      (item) => item.type === "formula",
    );
    assert.ok(screens.length > 0, "the catalog has no formula screens");
    for (const item of screens) {
      const sheets = screenSheets(item);
      assert.equal(sheets.length, 2, `${item.id} ships ${sheets.length} tabs`);
      assert.equal(exerciseSheet(item).rows.length, item.grid.rows.length);
    }
  });
});
