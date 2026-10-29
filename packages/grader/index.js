import { buildCells as buildCellsFromGrid, createContext, evaluate, evaluateFormula } from "./evaluate.js";
import { grade } from "./grade.js";
import { parse } from "./parse.js";
import { tokenize } from "./tokenize.js";

export { grade } from "./grade.js";
export { FormulaError, CODES, isFormulaError } from "./errors.js";
export { tokenize } from "./tokenize.js";
export { parse, walkAst, callsOf, childrenOf } from "./parse.js";
export { FUNCTIONS, KNOWN_FUNCTIONS, criteriaTest } from "./functions.js";
export { evaluate, evaluateFormula, createContext, formatValue } from "./evaluate.js";
export {
  compareValues,
  valuesEqual,
  toNumber,
  toText,
  toBoolean,
  isRange,
  isBlank,
  flatten,
  wildcardToRegExp,
} from "./values.js";
export { colToIndex, indexToCol, isColumnLabel, parseRef, addressOf, expandRange } from "./address.js";

export const buildCells = buildCellsFromGrid;

/** Evaluate a standalone formula against an ad-hoc cell map; returns the value. */
export function compute(formula, cells = {}) {
  return evaluateFormula(formula, cells);
}

/** Parse only: useful for "is this a formula at all" checks in the UI. */
export function structure(formula) {
  return parse(formula);
}
