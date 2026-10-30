/**
 * The workbook preview's cells, with the sheet's formulas already computed.
 *
 * The preview used to print the formula's own text — `=IFERROR(ROUND(SUMIF(…)/…*100,1),"")` where the
 * file shows `44.8` — so a screen that asked the learner to read B7 asked them to evaluate a nested
 * SUMIF in their head, and a screen that asked for an answer the preview never showed looked broken.
 * A workbook preview that prints formulas is not a preview of a workbook.
 *
 * The values come from the grader's own evaluator, which is the engine that grades every formula
 * screen, so the number in the preview and the number in a verdict cannot disagree. Nothing here
 * re-implements a spreadsheet.
 *
 * Formulas may refer to other formulas, so this settles rather than recurses: each pass evaluates every
 * formula against the previous pass's values and the loop stops when a pass changes nothing. A circular
 * reference never settles, so it is cut off and the last pass is shown — the preview is read-only, so a
 * spreadsheet's circular-reference warning has nowhere to go, and this is the one case where the two
 * can disagree.
 */

import { buildCells, compute, gridModel, isFormulaError } from "./packages.mjs";

/** Enough passes for a chain deeper than anything a lesson has, and a cut-off long before it hurts. */
const MAX_PASSES = 12;

const isFormula = (value) => typeof value === "string" && value.startsWith("=");

/** What a cell reads: a value as the sheet holds it, an error as its Excel code, a blank as nothing. */
function cellText(value) {
  if (value === null || value === undefined) return "";
  if (isFormulaError(value)) return value.code;
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  return value;
}

function evaluateCell(formula, cells, options) {
  try {
    return compute(formula, cells, options);
  } catch (error) {
    // A formula that cannot be evaluated is a cell a spreadsheet fills with an error code, not a page
    // that fails to build. Anything that is not a formula error is a bug here, and it propagates.
    if (isFormulaError(error)) return error;
    throw error;
  }
}

/**
 * The rows to print and the formulas to name, in sheet order. `rows` is the same shape as
 * `sheet.rows`, so a caller can hand it straight to the grid renderer; `formulas` is `{ address,
 * formula }` for every cell the preview had to compute, because a value with no visible formula hides
 * the very thing the lesson is teaching.
 */
export function previewSheet(sheet, options = {}) {
  const model = gridModel({ grid: sheet });
  const cells = buildCells({ grid: sheet });
  const formulas = Object.keys(cells)
    .filter((address) => isFormula(cells[address]))
    .map((address) => ({ address, formula: cells[address] }));

  if (formulas.length === 0) return { rows: model.rows, formulas };

  let values = { ...cells };
  for (let pass = 0; pass < MAX_PASSES; pass += 1) {
    const next = { ...values };
    let settled = true;
    for (const { address } of formulas) {
      next[address] = evaluateCell(cells[address], values, options);
      if (cellText(next[address]) !== cellText(values[address])) settled = false;
    }
    values = next;
    if (settled) break;
  }

  const rows = model.rows.map((row, rowOffset) =>
    row.map((_, colOffset) => {
      const value = values[model.addresses[rowOffset][colOffset]];
      return value === null ? null : cellText(value);
    }),
  );
  return { rows, formulas };
}
