import { addressOf, expandRange, parseRef } from "./address.js";
import { CODES, FormulaError } from "./errors.js";
import { FUNCTIONS, KNOWN_FUNCTIONS, requireArity } from "./functions.js";
import { parse } from "./parse.js";
import { compareValues, isBlank, isRange, toBoolean, toNumber, toText } from "./values.js";

/** Cell lookup context. Missing keys resolve to a blank cell, like an empty grid. */
export function createContext(cells = {}) {
  return {
    getCell(key) {
      const value = cells[key];
      return value === undefined ? null : value;
    },
  };
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

function evaluateBinary(node, ctx) {
  const { op } = node;
  const left = evaluate(node.left, ctx);
  const right = evaluate(node.right, ctx);

  if (op === "&") return toText(left) + toText(right);

  if (op === "=" || op === "<>" || op === "<" || op === ">" || op === "<=" || op === ">=") {
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

  if (name === "IFERROR") {
    try {
      return evaluate(node.args[0], ctx);
    } catch (error) {
      if (error instanceof FormulaError) return evaluate(node.args[1], ctx);
      throw error;
    }
  }

  const args = node.args.map((arg) => evaluate(arg, ctx));
  return FUNCTIONS[name](args, ctx, node);
}

/** Convenience: parse + evaluate in one call. */
export function evaluateFormula(source, cells = {}) {
  const ast = parse(source);
  return evaluate(ast, createContext(cells));
}

export function formatValue(value) {
  if (isBlank(value)) return "an empty cell";
  if (isRange(value)) {
    const first = value.addresses?.[0]?.[0] ?? "?";
    const last = value.addresses?.at(-1)?.at(-1) ?? first;
    return `the block ${first}:${last}`;
  }
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "string") return `"${value}"`;
  return String(value);
}
