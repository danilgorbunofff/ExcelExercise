import { CODES, FormulaError } from "./errors.js";

export const EPSILON = 1e-9;
const NUMERIC_TEXT = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i;

export function isRange(value) {
  return Boolean(value) && typeof value === "object" && value.kind === "range";
}

export function isBlank(value) {
  return value === null || value === undefined;
}

export function isNumericText(value) {
  return typeof value === "string" && NUMERIC_TEXT.test(value.trim());
}

export function toNumber(value, who = "That value") {
  if (isBlank(value)) return 0;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new FormulaError(CODES.NUM, `${who} is not a finite number.`);
    return value;
  }
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "string") {
    const text = value.trim();
    if (text === "") throw new FormulaError(CODES.VALUE, `${who} is empty text, not a number.`);
    if (NUMERIC_TEXT.test(text)) return Number(text);
    throw new FormulaError(CODES.VALUE, `${who} is text ("${text}"), not a number.`);
  }
  if (isRange(value)) {
    throw new FormulaError(CODES.VALUE, `${who} is a range of cells; a single value is needed here.`);
  }
  throw new FormulaError(CODES.VALUE, `${who} is not a number.`);
}

export function numberToText(value) {
  if (Number.isNaN(value)) throw new FormulaError(CODES.NUM, "The result is not a number.");
  if (!Number.isFinite(value)) {
    throw new FormulaError(CODES.NUM, "The result is too large to calculate.");
  }
  if (Object.is(value, -0) || value === 0) return "0";
  return String(Number(value.toPrecision(15)));
}

export function toText(value) {
  if (isBlank(value)) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return numberToText(value);
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (isRange(value)) {
    throw new FormulaError(CODES.VALUE, "A whole range cannot be used where one piece of text is expected.");
  }
  return String(value);
}

export function toBoolean(value) {
  if (isBlank(value)) return false;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const text = value.trim().toUpperCase();
    if (text === "TRUE") return true;
    if (text === "FALSE") return false;
    throw new FormulaError(CODES.VALUE, `"${value}" is text; a condition needs TRUE or FALSE.`);
  }
  throw new FormulaError(CODES.VALUE, "That value cannot be used as a condition.");
}

function numericCompare(a, b) {
  const scale = Math.max(1, Math.abs(a), Math.abs(b));
  if (Math.abs(a - b) <= EPSILON * scale) return 0;
  return a < b ? -1 : 1;
}

function textCompare(a, b) {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  if (x === y) return 0;
  return x < y ? -1 : 1;
}

function blankSurrogate(other) {
  if (typeof other === "number") return 0;
  if (typeof other === "boolean") return false;
  return "";
}

function isNumericLike(value) {
  return typeof value === "number" || typeof value === "boolean";
}

/**
 * Excel-ish ordering: numbers/booleans by value, text case-insensitively,
 * text and numbers ordered by type. Blanks borrow the other side's type.
 */
export function compareValues(a, b) {
  if (isRange(a) || isRange(b)) {
    throw new FormulaError(CODES.VALUE, "A whole range cannot be compared as a single value.");
  }

  let x = isBlank(a) ? null : a;
  let y = isBlank(b) ? null : b;
  if (x === null && y === null) return 0;
  if (x === null) x = blankSurrogate(y);
  if (y === null) y = blankSurrogate(x);

  if (isNumericLike(x) && isNumericLike(y)) {
    const nx = typeof x === "boolean" ? (x ? 1 : 0) : x;
    const ny = typeof y === "boolean" ? (y ? 1 : 0) : y;
    return numericCompare(nx, ny);
  }
  if (isNumericLike(x)) return -1;
  if (isNumericLike(y)) return 1;
  return textCompare(toText(x), toText(y));
}

export function valuesEqual(a, b) {
  return compareValues(a, b) === 0;
}

/** Flatten any mix of scalars and ranges into raw cell values, row-major. */
export function flatten(args) {
  const out = [];
  for (const arg of args) {
    if (isRange(arg)) {
      for (const row of arg.values) for (const cell of row) out.push(cell);
    } else {
      out.push(arg);
    }
  }
  return out;
}

export function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function wildcardToRegExp(pattern, { anchored = true } = {}) {
  let source = "";
  for (const ch of pattern) {
    if (ch === "*") source += "[\\s\\S]*";
    else if (ch === "?") source += "[\\s\\S]";
    else source += escapeRegExp(ch);
  }
  return new RegExp(anchored ? `^${source}$` : source, "i");
}

export function hasWildcard(text) {
  return typeof text === "string" && (text.includes("*") || text.includes("?"));
}
