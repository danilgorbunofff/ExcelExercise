/**
 * The sheet grid as data: which cells exist, which one the learner answers in, and where the
 * selection lands when an arrow, Home or End is pressed. The markup lives in the site template and
 * the DOM wiring in `drill.js`, and both read this module, so a cell the client can select is a cell
 * the page rendered and a cell the page renders is one an arrow can reach.
 *
 * Nothing here touches the DOM, keeps state or knows what a screen is: every function takes a model
 * and returns plain values.
 */

import { addressOf, indexToCol, parseRef } from "../grader/index.js";

/** The keys that move the selection. Anything else is not navigation and must not be swallowed. */
export const MOVE_KEYS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"]);

/**
 * The model of one rendered grid. `startCell` is where the block begins, which is not A1 on a lesson
 * that shows a fragment of a bigger sheet, and every address is resolved once here rather than by
 * each caller walking row and column offsets again.
 */
export function gridModel({ grid, answerCell = null }) {
  const start = parseRef(grid.startCell);
  if (!start) throw new Error(`sheet: "${grid.startCell}" is not a cell address`);
  if (!Array.isArray(grid.rows) || grid.rows.length === 0) throw new Error("sheet: a grid needs at least one row");

  const rows = grid.rows;
  const width = rows[0].length;
  const addresses = rows.map((_, rowOffset) =>
    Array.from({ length: width }, (_, colOffset) => addressOf(start.colIndex + colOffset, start.row + rowOffset)),
  );

  return {
    start,
    width,
    height: rows.length,
    rows,
    addresses,
    columns: Array.from({ length: width }, (_, offset) => indexToCol(start.colIndex + offset)),
    target: answerCell,
  };
}

/** The top-left cell of the block: where the selection starts and what the page prints as read-only. */
export function startCell(model) {
  return model.addresses[0][0];
}

/** The cell at an address, or null when the address is not on this sheet. */
export function cellAt(model, address) {
  const parsed = parseRef(address);
  if (!parsed) return null;
  const rowOffset = parsed.row - model.start.row;
  const colOffset = parsed.colIndex - model.start.colIndex;
  if (rowOffset < 0 || rowOffset >= model.height || colOffset < 0 || colOffset >= model.width) return null;
  return {
    address: model.addresses[rowOffset][colOffset],
    value: model.rows[rowOffset][colOffset],
    rowOffset,
    colOffset,
  };
}

/**
 * Where the selection goes from `address` for one movement key: the neighbouring address, or null when
 * the move would leave the sheet, which is where the caller stops rather than wrapping. A key that is
 * not a movement key is the caller's to ignore — test `MOVE_KEYS` first.
 */
export function moveSelection(address, key, { model }) {
  const at = cellAt(model, address);
  if (!at) return null;

  const spot = (rowOffset, colOffset) =>
    rowOffset < 0 || rowOffset >= model.height || colOffset < 0 || colOffset >= model.width
      ? null
      : model.addresses[rowOffset][colOffset];

  switch (key) {
    case "ArrowLeft":
      return spot(at.rowOffset, at.colOffset - 1);
    case "ArrowRight":
      return spot(at.rowOffset, at.colOffset + 1);
    case "ArrowUp":
      return spot(at.rowOffset - 1, at.colOffset);
    case "ArrowDown":
      return spot(at.rowOffset + 1, at.colOffset);
    case "Home":
      return spot(at.rowOffset, 0);
    case "End":
      return spot(at.rowOffset, model.width - 1);
    default:
      return null;
  }
}
