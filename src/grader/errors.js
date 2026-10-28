/**
 * Excel error codes. `#ERROR!` is not an Excel code: it is Google Sheets'
 * marker for a formula that will not parse, and we reuse it because a syntax
 * error has no Excel equivalent to borrow.
 */
export const CODES = Object.freeze({
  NULL: "#NULL!",
  DIV0: "#DIV/0!",
  VALUE: "#VALUE!",
  REF: "#REF!",
  NAME: "#NAME?",
  NUM: "#NUM!",
  NA: "#N/A",
  PARSE: "#ERROR!",
});

const KNOWN = new Set(Object.values(CODES));

export class FormulaError extends Error {
  constructor(code, message, position = null) {
    super(message);
    this.name = "FormulaError";
    this.code = KNOWN.has(code) ? code : CODES.VALUE;
    this.position = Number.isInteger(position) && position >= 0 ? position : null;
  }

  toJSON() {
    return { code: this.code, message: this.message, position: this.position };
  }
}

export function isFormulaError(value) {
  return value instanceof FormulaError;
}

export function fail(code, message, position = null) {
  throw new FormulaError(code, message, position);
}
