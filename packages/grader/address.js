import { CODES, FormulaError } from "./errors.js";

const COL_RE = /^([A-Za-z]{1,3})$/;

export const MAX_ROW = 1048576;
export const MAX_COL = 16384;

export function colToIndex(col) {
  let n = 0;
  for (const ch of col.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

export function indexToCol(n) {
  if (!Number.isInteger(n) || n < 1) throw new RangeError(`bad column index ${n}`);
  let out = "";
  let value = n;
  while (value > 0) {
    const rem = (value - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    value = Math.floor((value - 1) / 26);
  }
  return out;
}

export function isColumnLabel(text) {
  return COL_RE.test(text);
}

export function parseRef(text) {
  const m = /^\$?([A-Za-z]{1,3})\$?(\d{1,7})$/.exec(String(text).trim());
  if (!m) return null;
  const col = m[1].toUpperCase();
  const row = Number(m[2]);
  if (row < 1 || row > MAX_ROW) return null;
  const colIndex = colToIndex(col);
  if (colIndex < 1 || colIndex > MAX_COL) return null;
  return { col, row, colIndex, key: `${col}${row}` };
}

export function addressOf(colIndex, row) {
  return `${indexToCol(colIndex)}${row}`;
}

/** No lesson needs more than this many cells in one range; beyond it the tab freezes. */
export const MAX_RANGE_CELLS = 100000;

/**
 * Expand a rectangular range into rows of cell keys.
 * Returns a RangeValue: { addresses, values, width, height }.
 * Throws a `#NUM!` FormulaError rather than materialising an unbounded block.
 */
export function expandRange(from, to, getCell) {
  const a = parseRef(from);
  const b = parseRef(to);
  if (!a || !b) throw new RangeError(`bad range ${from}:${to}`);
  const c1 = Math.min(a.colIndex, b.colIndex);
  const c2 = Math.max(a.colIndex, b.colIndex);
  const r1 = Math.min(a.row, b.row);
  const r2 = Math.max(a.row, b.row);

  const cells = (r2 - r1 + 1) * (c2 - c1 + 1);
  if (cells > MAX_RANGE_CELLS) {
    throw new FormulaError(
      CODES.NUM,
      `${from}:${to} covers ${cells.toLocaleString("en-US")} cells. Use the columns your table actually fills, not a whole block.`,
    );
  }

  const addresses = [];
  const values = [];
  for (let r = r1; r <= r2; r += 1) {
    const rowAddresses = [];
    const rowValues = [];
    for (let c = c1; c <= c2; c += 1) {
      const key = addressOf(c, r);
      rowAddresses.push(key);
      rowValues.push(getCell(key));
    }
    addresses.push(rowAddresses);
    values.push(rowValues);
  }
  return {
    kind: "range",
    addresses,
    values,
    height: r2 - r1 + 1,
    width: c2 - c1 + 1,
  };
}
