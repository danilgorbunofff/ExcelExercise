/**
 * What a screen's `.xlsx` actually holds.
 *
 * A formula screen is a grid and a target cell, and the answer is a formula — so the file it ships is
 * two tabs: `Exercise`, which is the grid exactly as the page draws it, and `Solution`, the same grid
 * with the reference formula written into the answer cell. A workbook screen already carries its own
 * authored sheet and ships that instead. `xlsx.mjs` writes whatever this module returns; nothing here
 * touches bytes.
 */

import { parseRef } from "./packages.mjs";

export const EXERCISE_TAB = "Exercise";
export const SOLUTION_TAB = "Solution";

/**
 * The formula a learner is supposed to end up with, or `null`. Screens state it one of three ways, in
 * order of authority: the screen's own `reference`, the lesson-level `docs.reference` (sometimes prose
 * — "Orders, D4" — which is why it is checked rather than trusted), and the first accepted fixture,
 * which the grader treats as a correct answer and so is the one that must work.
 */
export function solutionFormula(screen) {
  for (const candidate of [screen?.reference, screen?.docs?.reference, screen?.fixtures?.accept?.[0]]) {
    if (typeof candidate !== "string") continue;
    const text = candidate.trim();
    if (text.startsWith("=") && !text.includes("\n")) return text;
  }
  return null;
}

/**
 * The tab that is the exercise itself: the authored sheet for a workbook screen, the screen's grid for
 * a formula screen. `null` for a screen that has neither, which is every picture and shortcut screen.
 */
export function exerciseSheet(screen) {
  if (screen?.sheet) return screen.sheet;
  if (screen?.grid) return { name: EXERCISE_TAB, startCell: screen.grid.startCell, rows: screen.grid.rows };
  return null;
}

/** Two case-insensitive-identical tab names are a file Excel refuses to open. */
function solutionName(taken) {
  const used = String(taken ?? "").trim().toLowerCase();
  return used === SOLUTION_TAB.toLowerCase() ? "Answers" : SOLUTION_TAB;
}

function withAnswer(sheet, answerCell, formula) {
  const start = parseRef(sheet.startCell);
  const cell = parseRef(answerCell);
  if (!start || !cell) {
    throw new Error(`workbook-sheets: "${sheet.startCell}" or "${answerCell}" is not a cell address`);
  }
  const rowOffset = cell.row - start.row;
  const colOffset = cell.colIndex - start.colIndex;
  const inside = sheet.rows[rowOffset] !== undefined && colOffset >= 0 && colOffset < sheet.rows[rowOffset].length;
  // A content lint catches this too; the build refuses it because a file written from a bad address
  // would put the answer outside the grid it belongs to, which is worse than no download at all.
  if (!inside) {
    throw new Error(`workbook-sheets: the answer cell ${answerCell} is outside the sheet starting at ${sheet.startCell}`);
  }
  const rows = sheet.rows.map((row) => row.slice());
  rows[rowOffset][colOffset] = formula;
  return { name: solutionName(sheet.name), startCell: sheet.startCell, rows };
}

/**
 * The tabs a screen ships, in order. One tab when the screen has no formula answer — a workbook screen
 * written in prose keeps the single sheet it has always had, byte for byte.
 */
export function screenSheets(screen) {
  const sheet = exerciseSheet(screen);
  if (!sheet) return null;
  const formula = solutionFormula(screen);
  if (!formula || !screen.answerCell) return [sheet];
  return [sheet, withAnswer(sheet, screen.answerCell, formula)];
}
