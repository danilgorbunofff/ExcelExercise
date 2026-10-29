/**
 * The sheet model. The cases that matter are the ones a learner would hit: a lesson whose block does
 * not start at A1, an arrow pressed at the edge of the block (which must stop, not wrap into a cell
 * that is not drawn), and an address written the way a person writes it — `$D$4`, `d4` — resolving to
 * the same cell the page rendered. The markup is pinned by the golden snapshots; this pins the data
 * both the markup and the keyboard handler read.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { MOVE_KEYS, cellAt, gridModel, moveSelection, startCell } from "../packages/sheet/index.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** The grid a formula screen ships: a block starting away from A1, so offsets are not accidental. */
const GRID = {
  startCell: "C3",
  rows: [
    ["", "Answer"],
    ["Rate", "=1+1"],
  ],
};

const model = gridModel({ grid: GRID, answerCell: "D4" });

const addresses = (grid) => gridModel({ grid }).addresses.map((row) => row.join(" ")).join(" | ");

describe("sheet: the block", () => {
  it("resolves every address from startCell, not from A1", () => {
    assert.equal(addresses(GRID), "C3 D3 | C4 D4");
  });

  it("names the columns the block covers", () => {
    assert.deepEqual(model.columns, ["C", "D"]);
  });

  it("reports the block's size from its rows", () => {
    assert.equal(model.width, 2);
    assert.equal(model.height, 2);
  });

  it("keeps the target cell it was handed", () => {
    assert.equal(model.target, "D4");
    assert.equal(gridModel({ grid: GRID }).target, null);
  });

  it("starts at the top-left cell of the block", () => {
    assert.equal(startCell(model), "C3");
  });

  it("covers a single-cell block without special-casing it", () => {
    const one = gridModel({ grid: { startCell: "B2", rows: [["7"]] } });
    assert.deepEqual(one.columns, ["B"]);
    assert.equal(startCell(one), "B2");
    assert.equal(moveSelection("B2", "ArrowRight", { model: one }), null);
  });

  it("throws on a startCell that is not an address, rather than rendering at A1", () => {
    assert.throws(() => gridModel({ grid: { startCell: "nowhere", rows: [["1"]] } }), /is not a cell address/);
  });

  it("throws on a grid with no rows, rather than rendering an empty sheet", () => {
    assert.throws(() => gridModel({ grid: { startCell: "A1", rows: [] } }), /at least one row/);
  });
});

describe("sheet: reading a cell", () => {
  it("returns the value at an address inside the block", () => {
    assert.deepEqual(cellAt(model, "D4"), { address: "D4", value: "=1+1", rowOffset: 1, colOffset: 1 });
  });

  it("reads the empty cell as empty rather than as missing", () => {
    assert.deepEqual(cellAt(model, "C3"), { address: "C3", value: "", rowOffset: 0, colOffset: 0 });
  });

  it("accepts absolute and lowercase spellings of an address the page painted", () => {
    assert.equal(cellAt(model, "$D$4")?.value, "=1+1");
    assert.equal(cellAt(model, "d4")?.value, "=1+1");
  });

  it("returns null for an address above or left of the block", () => {
    assert.equal(cellAt(model, "B2"), null);
    assert.equal(cellAt(model, "D2"), null);
  });

  it("returns null for an address past the last row or column", () => {
    assert.equal(cellAt(model, "E4"), null);
    assert.equal(cellAt(model, "D5"), null);
  });

  it("returns null for something that is not an address at all", () => {
    assert.equal(cellAt(model, ""), null);
    assert.equal(cellAt(model, "Rate"), null);
  });
});

describe("sheet: moving the selection", () => {
  const move = (address, key) => moveSelection(address, key, { model });

  it("stops at the edges instead of wrapping onto a cell that is not drawn", () => {
    assert.equal(move("C3", "ArrowLeft"), null);
    assert.equal(move("C3", "ArrowUp"), null);
    assert.equal(move("D4", "ArrowRight"), null);
    assert.equal(move("D4", "ArrowDown"), null);
  });

  it("moves one cell at a time inside the block", () => {
    assert.equal(move("C3", "ArrowRight"), "D3");
    assert.equal(move("D3", "ArrowDown"), "D4");
    assert.equal(move("D4", "ArrowLeft"), "C4");
    assert.equal(move("C4", "ArrowUp"), "C3");
  });

  it("jumps to the row's first and last cell on Home and End", () => {
    assert.equal(move("D4", "Home"), "C4");
    assert.equal(move("C3", "End"), "D3");
  });

  it("stays put when Home or End is pressed in a one-column block", () => {
    const one = gridModel({ grid: { startCell: "B2", rows: [["1"], ["2"]] } });
    assert.equal(moveSelection("B2", "End", { model: one }), "B2");
    assert.equal(moveSelection("B2", "Home", { model: one }), "B2");
  });

  it("returns null for a key that is not navigation", () => {
    assert.equal(move("C3", "Enter"), null);
    assert.equal(move("C3", "a"), null);
  });

  it("returns null from an address that is not on the sheet", () => {
    assert.equal(move("A1", "ArrowRight"), null);
  });

  it("moves the selection the model says the key moves, for every movement key", () => {
    for (const key of MOVE_KEYS) {
      const next = move("C3", key);
      assert.ok(next === null || addresses(GRID).includes(next), `${key} landed off the sheet`);
    }
  });

  it("does not claim keys it does not move on", () => {
    assert.equal(MOVE_KEYS.has("Enter"), false);
    assert.equal(MOVE_KEYS.has("Tab"), false);
    assert.equal(MOVE_KEYS.has("a"), false);
  });
});

describe("sheet: the client imports the shipped module", () => {
  const drill = readFileSync(join(ROOT, "legacy/src/client/drill.js"), "utf8");

  it("moves the selection through the model instead of walking the DOM", () => {
    assert.match(drill, /from "\.\.\/sheet\/index\.js"/);
    assert.match(drill, /moveSelection\(/);
    assert.doesNotMatch(drill, /function neighbouringKey/);
  });

  it("builds the model once per screen from the payload's grid", () => {
    assert.match(drill, /gridModel\(\{ grid: screen\.grid/);
  });
});
