import { addressOf, expandRange, parseRef } from "./address.js";
import { CODES, FormulaError } from "./errors.js";
import { FUNCTIONS, KNOWN_FUNCTIONS, requireArity, spill } from "./functions.js";
import { parse } from "./parse.js";
import { compareValues, isBlank, isRange, toBoolean, toNumber, toText } from "./values.js";

/**
 * Cell lookup context. Missing keys resolve to a blank cell, like an empty grid.
 *
 * `clock` is the pinned "today" a screen can carry. Without one the evaluator reads this machine's
 * clock, which is what makes TODAY and NOW volatile — a drill that asks for a date has to pin the
 * day it is asking about, or the answer would change overnight.
 */
export function createContext(cells = {}, { clock } = {}) {
  return {
    clock: clock ?? null,
    getCell(key) {
      const value = cells[key];
      return value === undefined ? null : value;
    },
  };
}

/**
 * A screen's `today` is written `YYYY-MM-DD`, or `YYYY-MM-DDTHH:MM` when the drill is about the time
 * of day as well, and read as that moment on this machine's calendar. A bare date is local midnight.
 */
export function pinnedClock(today) {
  if (typeof today !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(today);
  if (!match) return null;
  const [, year, month, day, hour = 0, minute = 0] = match.map((part) => (part === undefined ? 0 : Number(part)));
  const date = new Date(year, month - 1, day, hour, minute);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute
  ) {
    return null;
  }
  return date;
}

/** Expand `grid.rows` from `grid.startCell` into a flat `{ A1: value }` map. */
export function buildCells(exercise) {
  const grid = exercise?.grid;
  if (!grid || !Array.isArray(grid.rows)) {
    throw new TypeError("exercise.grid.rows is required");
  }

  const origin = parseRef(grid.startCell ?? "A1");
  if (!origin) throw new RangeError(`bad startCell ${grid.startCell}`);

  const cells = {};
  grid.rows.forEach((row, r) => {
    if (!Array.isArray(row)) throw new TypeError(`grid.rows[${r}] must be an array`);
    row.forEach((value, c) => {
      const key = addressOf(origin.colIndex + c, origin.row + r);
      cells[key] = value === "" || value === null || value === undefined ? null : value;
    });
  });
  return cells;
}

export function evaluate(node, ctx = createContext()) {
  switch (node?.type) {
    case "number":
      return node.value;
    case "string":
      return node.value;
    case "boolean":
      return node.value;
    case "blank":
      return null;

    case "ref": {
      const value = ctx.getCell(node.key);
      if (value instanceof FormulaError) throw value;
      return value ?? null;
    }

    case "range":
      return expandRange(node.from.key, node.to.key, ctx.getCell);

    case "name":
      throw new FormulaError(
        CODES.NAME,
        `"${node.name}" is not a cell reference or a function. Check the spelling.`,
        node.start,
      );

    case "unary": {
      const value = toNumber(evaluate(node.operand, ctx), `The value after "${node.op}"`);
      return node.op === "-" ? -value : value;
    }

    case "percent":
      return toNumber(evaluate(node.operand, ctx), "The value before %") / 100;

    case "binary":
      return evaluateBinary(node, ctx);

    case "call":
      return evaluateCall(node, ctx);

    default:
      throw new FormulaError(CODES.PARSE, `Cannot evaluate a "${node?.type ?? "missing"}" node.`);
  }
}

function compareCells(op, left, right) {
  const cmp = compareValues(left, right);
  switch (op) {
    case "=":
      return cmp === 0;
    case "<>":
      return cmp !== 0;
    case "<":
      return cmp < 0;
    case ">":
      return cmp > 0;
    case "<=":
      return cmp <= 0;
    default:
      return cmp >= 0;
  }
}

function evaluateBinary(node, ctx) {
  const { op } = node;
  const left = evaluate(node.left, ctx);
  const right = evaluate(node.right, ctx);

  if (op === "&") return toText(left) + toText(right);

  if (op === "=" || op === "<>" || op === "<" || op === ">" || op === "<=" || op === ">=") {
    // A block compared against one value answers cell by cell, which is what
    // =FILTER(range, range>1000) needs. Two blocks still refuse: that is a matrix.
    if (isRange(left) !== isRange(right)) {
      const block = isRange(left) ? left : right;
      return spill(
        block.values.map((row) =>
          row.map((cell) =>
            isRange(left) ? compareCells(op, cell, right) : compareCells(op, left, cell),
          ),
        ),
      );
    }
    return compareCells(op, left, right);
  }

  const a = toNumber(left, "The left side of the calculation");
  const b = toNumber(right, "The right side of the calculation");

  switch (op) {
    case "+":
      return a + b;
    case "-":
      return a - b;
    case "*":
      return a * b;
    case "/":
      if (b === 0) {
        throw new FormulaError(
          CODES.DIV0,
          "Dividing by zero. A cell in the divisor is empty or holds 0.",
          node.right.start,
        );
      }
      return a / b;
    case "^": {
      const result = a ** b;
      if (!Number.isFinite(result)) {
        throw new FormulaError(CODES.NUM, "That power is too large to calculate.");
      }
      return result;
    }
    default:
      throw new FormulaError(CODES.PARSE, `Unknown operator "${op}".`, node.start);
  }
}

function evaluateCall(node, ctx) {
  const name = node.upper;

  if (!KNOWN_FUNCTIONS.has(name)) {
    throw new FormulaError(
      CODES.NAME,
      `"${node.name}" is not one of the functions this track covers. Check the spelling or use another approach.`,
      node.start,
    );
  }

  requireArity(name, node.args.length);

  if (name === "IF") {
    const condition = toBoolean(evaluate(node.args[0], ctx));
    const branch = condition ? node.args[1] : node.args[2];
    if (!branch) return false;
    return branch.type === "blank" ? null : evaluate(branch, ctx);
  }

  if (name === "IFERROR" || name === "IFNA") {
    try {
      return evaluate(node.args[0], ctx);
    } catch (error) {
      // IFNA only stands in for #N/A; every other error keeps travelling.
      if (error instanceof FormulaError && (name === "IFERROR" || error.code === CODES.NA)) {
        return evaluate(node.args[1], ctx);
      }
      throw error;
    }
  }

  if (name === "ISERROR" || name === "ISNA") {
    try {
      evaluate(node.args[0], ctx);
      return false;
    } catch (error) {
      if (!(error instanceof FormulaError)) throw error;
      return name === "ISERROR" || error.code === CODES.NA;
    }
  }

  if (name === "IFS") {
    if (node.args.length % 2) {
      throw new FormulaError(
        CODES.VALUE,
        "IFS: every condition needs a value after it.",
        node.start,
      );
    }
    for (let index = 0; index < node.args.length; index += 2) {
      if (!toBoolean(evaluate(node.args[index], ctx))) continue;
      const value = node.args[index + 1];
      return value.type === "blank" ? null : evaluate(value, ctx);
    }
    throw new FormulaError(CODES.NA, "IFS found no TRUE condition.", node.start);
  }

  if (name === "SWITCH") {
    const subject = evaluate(node.args[0], ctx);
    const rest = node.args.slice(1);
    for (let index = 0; index + 1 < rest.length; index += 2) {
      if (compareValues(evaluate(rest[index], ctx), subject) !== 0) continue;
      const value = rest[index + 1];
      return value.type === "blank" ? null : evaluate(value, ctx);
    }
    // With an odd number of trailing arguments the last one is the default.
    if (rest.length % 2 === 1) {
      const fallback = rest[rest.length - 1];
      return fallback.type === "blank" ? null : evaluate(fallback, ctx);
    }
    throw new FormulaError(CODES.NA, "SWITCH found no matching case and no default.", node.start);
  }

  const args = node.args.map((arg) => evaluate(arg, ctx));
  return FUNCTIONS[name](args, ctx, node);
}

/** Convenience: parse + evaluate in one call. `options.today` pins TODAY and NOW. */
export function evaluateFormula(source, cells = {}, { today } = {}) {
  const ast = parse(source);
  return evaluate(ast, createContext(cells, { clock: pinnedClock(today) }));
}

export function formatValue(value) {
  if (isBlank(value)) return "an empty cell";
  if (isRange(value)) {
    const first = value.addresses?.[0]?.[0];
    // A spilled result has no addresses: describe its shape instead of naming a block.
    if (!first) return `a spilled block of ${value.height} row${value.height === 1 ? "" : "s"} by ${value.width} column${value.width === 1 ? "" : "s"}`;
    const last = value.addresses?.at(-1)?.at(-1) ?? first;
    return `the block ${first}:${last}`;
  }
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "string") return `"${value}"`;
  return String(value);
}
