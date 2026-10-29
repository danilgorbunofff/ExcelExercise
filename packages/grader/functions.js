import { CODES, FormulaError } from "./errors.js";
import { MAX_COL, MAX_ROW, addressOf, expandRange, parseRef } from "./address.js";
import {
  compareValues,
  flatten,
  hasWildcard,
  isBlank,
  isNumericText,
  isRange,
  toBoolean,
  toNumber,
  toText,
  wildcardToRegExp,
} from "./values.js";

/* ------------------------------------------------------------------ helpers */

function badArgs(name, message) {
  return new FormulaError(CODES.VALUE, `${name}: ${message}`);
}

function numericOrNull(value) {
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "string" && isNumericText(value)) return Number(value);
  return null;
}

function scalar(value) {
  if (isRange(value)) {
    const first = value.values[0]?.[0];
    return first === undefined ? null : first;
  }
  return value;
}

/** Numbers for aggregate maths: ranges skip text and booleans, scalars do not. */
function aggregateNumbers(name, args, { includeScalarText = false } = {}) {
  const out = [];
  for (const arg of args) {
    if (isRange(arg)) {
      // Excel ignores text and logical values that live in a reference,
      // while booleans used directly as arguments still count as 1/0.
      for (const row of arg.values) {
        for (const cell of row) {
          if (typeof cell === "number") out.push(cell);
        }
      }
      continue;
    }
    if (isBlank(arg)) continue;
    if (typeof arg === "number") out.push(arg);
    else if (typeof arg === "boolean") out.push(arg ? 1 : 0);
    else if (includeScalarText && isNumericText(arg)) out.push(Number(arg));
    else if (typeof arg === "string") {
      throw badArgs(name, `"${arg}" is text, and ${name} cannot add text.`);
    }
  }
  return out;
}

function roundTo(value, digits, mode) {
  const x = toNumber(value);
  const d = Math.trunc(toNumber(digits));
  if (!Number.isFinite(x)) throw new FormulaError(CODES.NUM, "That number cannot be rounded.");

  const factor = 10 ** d;
  const scaled = Number((x * factor).toPrecision(15));
  const sign = scaled < 0 ? -1 : 1;
  const magnitude = Math.abs(scaled);

  let rounded;
  if (mode === "up") rounded = Math.ceil(magnitude);
  else if (mode === "down") rounded = Math.floor(magnitude);
  else rounded = Math.round(magnitude);

  const result = (sign * rounded) / factor;
  return Object.is(result, -0) ? 0 : Number(result.toPrecision(15));
}

function flattenText(args) {
  const parts = [];
  for (const arg of args) {
    if (isRange(arg)) {
      for (const row of arg.values) for (const cell of row) parts.push(toText(cell));
    } else {
      parts.push(toText(arg));
    }
  }
  return parts;
}

/* ----------------------------------------------------------------- criteria */

export function criteriaTest(rawCriteria) {
  const criteria = scalar(rawCriteria);

  if (isBlank(criteria)) return (value) => isBlank(value) || value === "";

  if (typeof criteria === "number" || typeof criteria === "boolean") {
    return (value) => {
      const n = numericOrNull(value);
      return n !== null && compareValues(n, typeof criteria === "boolean" ? (criteria ? 1 : 0) : criteria) === 0;
    };
  }

  const text = String(criteria);
  const m = /^(<>|<=|>=|<|>|=)?([\s\S]*)$/.exec(text);
  const op = m[1] ?? "=";
  const operand = m[2];

  if (operand === "") {
    if (op === "=") return (value) => isBlank(value) || value === "";
    if (op === "<>") return (value) => !(isBlank(value) || value === "");
  }

  const operandNumber = isNumericText(operand) ? Number(operand) : null;
  const matcher =
    operandNumber === null && hasWildcard(operand) && (op === "=" || op === "<>")
      ? wildcardToRegExp(operand)
      : null;

  return (value) => {
    if (isBlank(value)) return op === "<>" && operand !== "";
    if (matcher) {
      const hit = matcher.test(toText(value));
      return op === "<>" ? !hit : hit;
    }

    if (operandNumber !== null) {
      const n = numericOrNull(value);
      if (n === null) return op === "<>";
      switch (op) {
        case "=":
          return compareValues(n, operandNumber) === 0;
        case "<>":
          return compareValues(n, operandNumber) !== 0;
        case "<":
          return compareValues(n, operandNumber) < 0;
        case ">":
          return compareValues(n, operandNumber) > 0;
        case "<=":
          return compareValues(n, operandNumber) <= 0;
        case ">=":
          return compareValues(n, operandNumber) >= 0;
        default:
          return false;
      }
    }

    const cellText = toText(value);
    const cmp = compareValues(cellText, operand);
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
      case ">=":
        return cmp >= 0;
      default:
        return false;
    }
  };
}

function requireRange(name, value, argIndex) {
  if (!isRange(value)) {
    throw badArgs(name, `argument ${argIndex} must be a range of cells.`);
  }
  return value;
}

/**
 * Like `requireRange`, but a lone cell reference counts as a 1x1 range, so
 * `=COUNTIF(A2,"x")` and `=SUMIF(A2,"x",B2)` behave as they do in Excel.
 */
function rangeArgument(name, value, argIndex, node, ctx) {
  if (isRange(value)) return value;
  const key = node?.type === "ref" ? node.key : null;
  if (key) return expandRange(key, key, ctx.getCell);
  throw badArgs(name, `argument ${argIndex} must be a range of cells.`);
}

/**
 * Excel resizes a `sum_range` from its own top-left corner to the shape of the
 * range being tested, so `SUMIF(A2:A4,"North",B2)` sums B2:B4.
 */
function alignToRange(name, node, range, ctx, argIndex) {
  const startKey = node?.type === "ref" ? node.key : node?.type === "range" ? node.from.key : null;
  const start = startKey ? parseRef(startKey) : null;
  if (!start) {
    throw badArgs(name, `argument ${argIndex} must be a reference to cells.`);
  }

  const lastCol = start.colIndex + range.width - 1;
  const lastRow = start.row + range.height - 1;
  if (lastCol > MAX_COL || lastRow > MAX_ROW) {
    throw badArgs(name, `argument ${argIndex} runs off the edge of the sheet.`);
  }

  return expandRange(
    addressOf(start.colIndex, start.row),
    addressOf(lastCol, lastRow),
    ctx.getCell,
  );
}

function matchLookup(lookup, cell, { wildcard = true } = {}) {
  if (typeof lookup === "string" && wildcard && hasWildcard(lookup)) {
    return wildcardToRegExp(lookup).test(toText(cell));
  }
  return compareValues(cell, lookup) === 0;
}

/**
 * VLOOKUP and HLOOKUP are one walk on two axes: the keys run down the first column
 * or across the first row, and the index number picks the column or the row to read.
 * `across` names the axis so the pair cannot drift on the parts that matter —
 * wildcards, the default approximate match, #N/A when no key fits and #REF! when the
 * index reaches past the table.
 */
function axisLookup(name, { lookup, table, index, approximate, across }) {
  const horizontal = across === "row";
  const noun = horizontal ? "row" : "column";
  const keys = horizontal ? table.width : table.height;
  const depth = horizontal ? table.height : table.width;
  const indexNumber = Math.trunc(index);
  const keyAt = horizontal ? (i) => table.values[0][i] : (i) => table.values[i][0];
  const read = horizontal
    ? (i) => table.values[indexNumber - 1][i]
    : (i) => table.values[i][indexNumber - 1];

  if (!Number.isFinite(indexNumber) || indexNumber < 1) {
    throw new FormulaError(CODES.VALUE, `${name}'s ${noun} number must be 1 or more.`);
  }
  if (indexNumber > depth) {
    const shape = `${depth} ${noun}s`;
    const tooBig = horizontal ? "taller" : "wider";
    throw new FormulaError(
      CODES.REF,
      `${name}'s ${noun} number ${indexNumber} is ${tooBig} than the table (${shape}).`,
    );
  }

  if (!approximate) {
    for (let i = 0; i < keys; i += 1) {
      if (matchLookup(lookup, keyAt(i))) return read(i) ?? null;
    }
    throw new FormulaError(
      CODES.NA,
      `${name} found no exact match for ${formatLookup(lookup)} in the first ${noun}.`,
    );
  }

  const key = numericOrNull(lookup);
  let best = -1;
  for (let i = 0; i < keys; i += 1) {
    const cell = keyAt(i);
    const cellNumber = numericOrNull(cell);
    const cmp =
      key !== null && cellNumber !== null
        ? compareValues(cellNumber, key)
        : compareValues(cell, lookup);
    if (cmp <= 0) best = i;
    else break;
  }
  if (best === -1) {
    throw new FormulaError(
      CODES.NA,
      `${name} found no approximate match for ${formatLookup(lookup)}; every value is larger.`,
    );
  }
  return read(best) ?? null;
}

/* ---------------------------------------------------------------- registry */

const NUMERIC_AGGREGATE = (name, pick, { empty } = {}) => (args) => {
  const numbers = aggregateNumbers(name, args);
  // Excel gives MIN/MAX of an empty block 0, and only AVERAGE complains.
  if (!numbers.length) {
    if (empty !== undefined) return empty;
    throw new FormulaError(CODES.DIV0, `${name} found no numbers to work with.`);
  }
  return pick(numbers);
};

export const FUNCTIONS = {
  SUM: (args) => aggregateNumbers("SUM", args).reduce((a, b) => a + b, 0),
  AVERAGE: NUMERIC_AGGREGATE("AVERAGE", (n) => n.reduce((a, b) => a + b, 0) / n.length),
  MIN: NUMERIC_AGGREGATE("MIN", (n) => n.reduce((a, b) => (b < a ? b : a)), { empty: 0 }),
  MAX: NUMERIC_AGGREGATE("MAX", (n) => n.reduce((a, b) => (b > a ? b : a)), { empty: 0 }),
  COUNT: (args) => {
    let count = 0;
    for (const arg of args) {
      if (isRange(arg)) {
        for (const row of arg.values) for (const cell of row) if (typeof cell === "number") count += 1;
      } else if (typeof arg === "number") {
        count += 1;
      } else if (typeof arg === "string" && isNumericText(arg)) {
        count += 1;
      }
    }
    return count;
  },
  COUNTA: (args) => {
    let count = 0;
    for (const arg of args) {
      if (isRange(arg)) {
        for (const row of arg.values) {
          for (const cell of row) if (!isBlank(cell) && cell !== "") count += 1;
        }
      } else if (!isBlank(arg) && arg !== "") {
        count += 1;
      }
    }
    return count;
  },

  SUMIF: (args, ctx, node) => {
    const range = rangeArgument("SUMIF", args[0], 1, node?.args?.[0], ctx);
    const test = criteriaTest(args[1]);
    const sumRange =
      args.length > 2 ? alignToRange("SUMIF", node?.args?.[2], range, ctx, 3) : range;

    // Excel aligns sum_range to range by position, not by absolute address:
    // the top-left of sum_range answers the top-left of range.
    let total = 0;
    for (let r = 0; r < range.values.length; r += 1) {
      for (let c = 0; c < range.values[r].length; c += 1) {
        if (!test(range.values[r][c])) continue;
        const target = sumRange.values[r]?.[c];
        if (typeof target === "number") total += target;
      }
    }
    return total;
  },

  COUNTIF: (args, ctx, node) => {
    const range = rangeArgument("COUNTIF", args[0], 1, node?.args?.[0], ctx);
    const test = criteriaTest(args[1]);
    let count = 0;
    for (const row of range.values) for (const cell of row) if (test(cell)) count += 1;
    return count;
  },

  NOT: (args) => !toBoolean(scalar(args[0])),

  AND: (args) => {
    let any = false;
    for (const value of flatten(args)) {
      if (isBlank(value)) continue;
      any = true;
      if (!toBoolean(value)) return false;
    }
    if (!any) throw badArgs("AND", "no logical values were given.");
    return true;
  },

  OR: (args) => {
    let any = false;
    for (const value of flatten(args)) {
      if (isBlank(value)) continue;
      any = true;
      if (toBoolean(value)) return true;
    }
    if (!any) throw badArgs("OR", "no logical values were given.");
    return false;
  },

  VLOOKUP: (args) =>
    axisLookup("VLOOKUP", {
      lookup: scalar(args[0]),
      table: requireRange("VLOOKUP", args[1], 2),
      index: toNumber(args[2]),
      approximate: args.length > 3 ? toBoolean(scalar(args[3])) : true,
      across: "column",
    }),

  HLOOKUP: (args) =>
    axisLookup("HLOOKUP", {
      lookup: scalar(args[0]),
      table: requireRange("HLOOKUP", args[1], 2),
      index: toNumber(args[2]),
      approximate: args.length > 3 ? toBoolean(scalar(args[3])) : true,
      across: "row",
    }),

  XLOOKUP: (args) => {
    const lookup = scalar(args[0]);
    const lookupArray = requireRange("XLOOKUP", args[1], 2);
    const returnArray = requireRange("XLOOKUP", args[2], 3);
    const ifNotFound = args.length > 3 ? scalar(args[3]) : undefined;
    const matchMode = args.length > 4 && !isBlank(args[4]) ? Math.trunc(toNumber(args[4])) : 0;
    const searchMode = args.length > 5 && !isBlank(args[5]) ? Math.trunc(toNumber(args[5])) : 1;

    const lookupCells = flatten([lookupArray]);
    const returnCells = flatten([returnArray]);
    if (lookupCells.length !== returnCells.length) {
      throw badArgs("XLOOKUP", "the lookup and return ranges must be the same size.");
    }

    const indexes = [...lookupCells.keys()];
    if (searchMode === -1) indexes.reverse();

    const notFound = () => {
      if (ifNotFound !== undefined) return ifNotFound;
      throw new FormulaError(CODES.NA, `XLOOKUP found no match for ${formatLookup(lookup)}.`);
    };

    for (const i of indexes) {
      if (matchLookup(lookup, lookupCells[i], { wildcard: matchMode === 2 })) return returnCells[i] ?? null;
    }

    if (matchMode === -1 || matchMode === 1) {
      let bestIndex = -1;
      for (const i of indexes) {
        const cmp = compareValues(lookupCells[i], lookup);
        const usable = matchMode === -1 ? cmp <= 0 : cmp >= 0;
        if (!usable) continue;
        if (bestIndex === -1) {
          bestIndex = i;
          continue;
        }
        const against = compareValues(lookupCells[i], lookupCells[bestIndex]);
        if (matchMode === -1 ? against > 0 : against < 0) bestIndex = i;
      }
      if (bestIndex !== -1) return returnCells[bestIndex] ?? null;
      return notFound();
    }

    return notFound();
  },
  INDEX: (args) => {
    const array = requireRange("INDEX", args[0], 1);
    const rowArg = args.length > 1 && !isBlank(args[1]) ? Math.trunc(toNumber(args[1])) : null;
    const colArg = args.length > 2 && !isBlank(args[2]) ? Math.trunc(toNumber(args[2])) : null;

    if (rowArg === null && colArg === null) {
      throw badArgs("INDEX", "give at least a row number.");
    }

    let row = rowArg ?? 0;
    let col = colArg ?? 0;

    // A one-dimensional range can be indexed with a single argument.
    if (array.height === 1 && colArg === null) {
      col = rowArg ?? 1;
      row = 1;
    } else if (array.width === 1 && colArg === null) {
      col = 1;
    }

    if (row < 1 || col < 1) {
      throw new FormulaError(CODES.VALUE, "INDEX needs a row and column of 1 or more.");
    }
    if (row > array.height || col > array.width) {
      throw new FormulaError(
        CODES.REF,
        `INDEX is outside the range: the range is ${array.height}×${array.width} cells.`,
      );
    }
    return array.values[row - 1][col - 1];
  },

  MATCH: (args) => {
    const lookup = scalar(args[0]);
    const array = requireRange("MATCH", args[1], 2);
    const matchType = args.length > 2 && !isBlank(args[2]) ? Math.trunc(toNumber(args[2])) : 1;
    const cells = flatten([array]);

    if (matchType === 0) {
      for (let i = 0; i < cells.length; i += 1) {
        if (matchLookup(lookup, cells[i])) return i + 1;
      }
      throw new FormulaError(CODES.NA, `MATCH found no exact match for ${formatLookup(lookup)}.`);
    }

    if (matchType === 1) {
      let best = -1;
      for (let i = 0; i < cells.length; i += 1) {
        if (compareValues(cells[i], lookup) <= 0) best = i;
        else break;
      }
      if (best === -1) {
        throw new FormulaError(CODES.NA, `MATCH found no value small enough for ${formatLookup(lookup)}.`);
      }
      return best + 1;
    }

    if (matchType === -1) {
      let best = -1;
      for (let i = 0; i < cells.length; i += 1) {
        if (compareValues(cells[i], lookup) >= 0) best = i;
        else break;
      }
      if (best === -1) {
        throw new FormulaError(CODES.NA, `MATCH found no value large enough for ${formatLookup(lookup)}.`);
      }
      return best + 1;
    }

    throw badArgs("MATCH", "the third argument must be -1, 0 or 1.");
  },

  LEN: (args) => toText(scalar(args[0])).length,
  LEFT: (args) => {
    const text = toText(scalar(args[0]));
    const count = args.length > 1 ? Math.trunc(toNumber(args[1])) : 1;
    if (count < 0) throw new FormulaError(CODES.VALUE, "LEFT needs a character count of 0 or more.");
    return text.slice(0, count);
  },
  RIGHT: (args) => {
    const text = toText(scalar(args[0]));
    const count = args.length > 1 ? Math.trunc(toNumber(args[1])) : 1;
    if (count < 0) throw new FormulaError(CODES.VALUE, "RIGHT needs a character count of 0 or more.");
    return count === 0 ? "" : text.slice(-count);
  },
  MID: (args) => {
    const text = toText(scalar(args[0]));
    const start = Math.trunc(toNumber(args[1]));
    const count = Math.trunc(toNumber(args[2]));
    if (start < 1) throw new FormulaError(CODES.VALUE, "MID's start position begins at 1.");
    if (count < 0) throw new FormulaError(CODES.VALUE, "MID needs a character count of 0 or more.");
    return text.slice(start - 1, start - 1 + count);
  },

  FIND: (args) => {
    const needle = toText(scalar(args[0]));
    const haystack = toText(scalar(args[1]));
    const start = args.length > 2 ? Math.trunc(toNumber(args[2])) : 1;
    if (start < 1) throw new FormulaError(CODES.VALUE, "FIND's start position begins at 1.");
    const index = haystack.indexOf(needle, start - 1);
    if (index === -1) {
      throw new FormulaError(CODES.VALUE, `FIND could not locate "${needle}" in "${haystack}".`);
    }
    return index + 1;
  },

  SEARCH: (args) => {
    const needle = toText(scalar(args[0]));
    const haystack = toText(scalar(args[1]));
    const start = args.length > 2 ? Math.trunc(toNumber(args[2])) : 1;
    if (start < 1) throw new FormulaError(CODES.VALUE, "SEARCH's start position begins at 1.");
    const slice = haystack.slice(start - 1);
    const pattern = hasWildcard(needle) ? wildcardToRegExp(needle, { anchored: false }) : null;
    const index = pattern ? slice.search(pattern) : slice.toLowerCase().indexOf(needle.toLowerCase());
    if (index === -1) {
      throw new FormulaError(CODES.VALUE, `SEARCH could not locate "${needle}" in "${haystack}".`);
    }
    return index + start;
  },

  UPPER: (args) => toText(scalar(args[0])).toUpperCase(),
  LOWER: (args) => toText(scalar(args[0])).toLowerCase(),
  PROPER: (args) =>
    toText(scalar(args[0])).replace(
      /([A-Za-z\u00C0-\u024F])([A-Za-z\u00C0-\u024F]*)/g,
      (_, first, rest) => first.toUpperCase() + rest.toLowerCase(),
    ),
  // Excel's TRIM only knows about the space character; tabs are left alone.
  TRIM: (args) => toText(scalar(args[0])).replace(/ +/g, " ").replace(/^ +| +$/g, ""),

  CONCAT: (args) => flattenText(args).join(""),
  CONCATENATE: (args) => flattenText(args).join(""),

  TEXTJOIN: (args) => {
    const glue = toText(scalar(args[0]));
    const ignoreEmpty = args.length > 1 ? toBoolean(scalar(args[1])) : true;
    const parts = flattenText(args.slice(2)).filter((part) => !ignoreEmpty || part !== "");
    return parts.join(glue);
  },

  ABS: (args) => Math.abs(toNumber(scalar(args[0]))),
  ROUND: (args) => roundTo(args[0], args.length > 1 ? args[1] : 0, "half"),
  ROUNDUP: (args) => roundTo(args[0], args.length > 1 ? args[1] : 0, "up"),
  ROUNDDOWN: (args) => roundTo(args[0], args.length > 1 ? args[1] : 0, "down"),
};

/** Functions handled by the evaluator itself so arguments stay lazy. */
const LAZY_FUNCTIONS = new Set(["IF", "IFERROR"]);

export const KNOWN_FUNCTIONS = new Set([...Object.keys(FUNCTIONS), ...LAZY_FUNCTIONS]);

export const FUNCTION_ARITY = Object.freeze({
  IF: { min: 2, max: 3 },
  IFERROR: { min: 2, max: 2 },
  SUM: { min: 1, max: Infinity },
  AVERAGE: { min: 1, max: Infinity },
  MIN: { min: 1, max: Infinity },
  MAX: { min: 1, max: Infinity },
  COUNT: { min: 1, max: Infinity },
  COUNTA: { min: 1, max: Infinity },
  AND: { min: 1, max: Infinity },
  OR: { min: 1, max: Infinity },
  NOT: { min: 1, max: 1 },
  ABS: { min: 1, max: 1 },
  LEN: { min: 1, max: 1 },
  UPPER: { min: 1, max: 1 },
  LOWER: { min: 1, max: 1 },
  PROPER: { min: 1, max: 1 },
  TRIM: { min: 1, max: 1 },
  CONCAT: { min: 1, max: Infinity },
  CONCATENATE: { min: 1, max: Infinity },
  SUMIF: { min: 2, max: 3 },
  COUNTIF: { min: 2, max: 2 },
  VLOOKUP: { min: 3, max: 4 },
  HLOOKUP: { min: 3, max: 4 },
  XLOOKUP: { min: 3, max: 6 },
  INDEX: { min: 1, max: 3 },
  MATCH: { min: 2, max: 3 },
  LEFT: { min: 1, max: 2 },
  RIGHT: { min: 1, max: 2 },
  MID: { min: 3, max: 3 },
  FIND: { min: 2, max: 3 },
  SEARCH: { min: 2, max: 3 },
  TEXTJOIN: { min: 3, max: Infinity },
  ROUND: { min: 1, max: 2 },
  ROUNDUP: { min: 1, max: 2 },
  ROUNDDOWN: { min: 1, max: 2 },
});

export function formatLookup(value) {
  if (typeof value === "string") return `"${value}"`;
  if (isBlank(value)) return "an empty cell";
  return String(value);
}

export function requireArity(name, argCount) {
  const rule = FUNCTION_ARITY[name];
  if (!rule) return;
  if (argCount < rule.min || argCount > rule.max) {
    const expected =
      rule.max === Infinity
        ? `at least ${rule.min}`
        : rule.min === rule.max
          ? `${rule.min}`
          : `${rule.min} to ${rule.max}`;
    throw badArgs(name, `expected ${expected} argument${rule.min === 1 && rule.max === 1 ? "" : "s"}, got ${argCount}.`);
  }
}
