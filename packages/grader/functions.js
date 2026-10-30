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

/**
 * A range value built from values rather than from cells — what a spilling function
 * hands back. It carries no addresses, so `formatValue` describes it as a spilled block.
 */
export function spill(values) {
  const rows = values.map((row) => (Array.isArray(row) ? row : [row]));
  return {
    kind: "range",
    values: rows,
    width: rows[0]?.length ?? 0,
    height: rows.length,
  };
}

function numbersOf(name, value) {
  if (isRange(value)) {
    const out = [];
    for (const row of value.values) {
      for (const cell of row) if (typeof cell === "number") out.push(cell);
    }
    return out;
  }
  if (typeof value === "number") return [value];
  if (typeof value === "boolean") return [value ? 1 : 0];
  if (isBlank(value)) return [];
  throw badArgs(name, `"${toText(value)}" is text, and ${name} needs a block of numbers.`);
}

/** `SUMIFS`-style pairs: each criterion range followed by its criterion. */
function conditionalPairs(name, args, from, ctx, node) {
  const pairs = [];
  for (let index = from; index < args.length; index += 2) {
    if (index + 1 >= args.length) {
      throw badArgs(name, "every criterion range needs a criterion after it.");
    }
    const range = rangeArgument(name, args[index], index + 1, node?.args?.[index], ctx);
    pairs.push({ range, test: criteriaTest(args[index + 1]) });
  }
  if (!pairs.length) throw badArgs(name, "give at least one range followed by its criterion.");
  return pairs;
}

function sameShape(name, anchor, range, argIndex) {
  if (range.height !== anchor.height || range.width !== anchor.width) {
    throw badArgs(
      name,
      `argument ${argIndex} is ${range.height}x${range.width} but must be ${anchor.height}x${anchor.width}, the size of the range it filters.`,
    );
  }
}

/** Numbers from the value range whose row-and-column passes every criterion pair. */
function conditionalNumbers(name, args, ctx, node) {
  const valueRange = rangeArgument(name, args[0], 1, node?.args?.[0], ctx);
  const pairs = conditionalPairs(name, args, 1, ctx, node);
  pairs.forEach((pair, index) => sameShape(name, valueRange, pair.range, index * 2 + 2));

  const out = [];
  for (let row = 0; row < valueRange.height; row += 1) {
    for (let col = 0; col < valueRange.width; col += 1) {
      if (!pairs.every((pair) => pair.test(pair.range.values[row][col]))) continue;
      const cell = valueRange.values[row][col];
      if (typeof cell === "number") out.push(cell);
    }
  }
  return out;
}

/** MROUND, FLOOR and CEILING: one rounding step, three ways of choosing it. */
function multipleRound(name, value, multiple, mode) {
  const number = toNumber(scalar(value));
  const step = toNumber(scalar(multiple));
  if (step === 0) throw new FormulaError(CODES.DIV0, `${name} cannot round to a multiple of 0.`);
  if (mode === "nearest" && number !== 0 && Math.sign(number) !== Math.sign(step)) {
    throw new FormulaError(
      CODES.NUM,
      `${name} cannot round ${number} to a multiple of ${step}: the two numbers have different signs.`,
    );
  }
  if (number === 0) return 0;

  const size = Math.abs(step);
  const steps = Number((Math.abs(number) / size).toPrecision(15));
  const rounded =
    mode === "up" ? Math.ceil(steps) : mode === "down" ? Math.floor(steps) : Math.round(steps);
  const result = (Math.sign(number) * rounded * size);
  return Object.is(result, -0) ? 0 : Number(result.toPrecision(15));
}

/**
 * TEXTBEFORE and TEXTAFTER share one splitter: Excel defaults to the first delimiter,
 * answers #N/A when the text has no delimiter at all, and a negative instance counts
 * from the end of the string.
 */
function sliceOnDelimiter(args, side) {
  const name = side === "before" ? "TEXTBEFORE" : "TEXTAFTER";
  const text = toText(scalar(args[0]));
  const delimiter = toText(scalar(args[1]));
  const instance = args.length > 2 ? Math.trunc(toNumber(args[2])) : 1;
  if (delimiter === "") return side === "before" ? "" : text;
  if (instance === 0) throw new FormulaError(CODES.VALUE, `${name} needs an instance number that is not 0.`);

  const pieces = text.split(delimiter);
  const delimiters = pieces.length - 1;
  const at = instance > 0 ? instance - 1 : delimiters + instance;
  if (at < 0 || at >= delimiters) {
    throw new FormulaError(CODES.NA, `${name} could not find delimiter ${instance} in "${text}".`);
  }
  return side === "before" ? pieces.slice(0, at + 1).join(delimiter) : pieces.slice(at + 1).join(delimiter);
}

/**
 * SUBTOTAL and AGGREGATE share one table of codes. Excel numbers them 1..11 (add 100
 * to a SUBTOTAL code to skip hidden rows, which this engine has none of).
 */
function aggregateByCode(name, code, args) {
  const numbers = aggregateNumbers(name, args);
  switch (code) {
    case 1:
      if (!numbers.length) {
        throw new FormulaError(CODES.DIV0, `${name} found no numbers to average.`);
      }
      return numbers.reduce((a, b) => a + b, 0) / numbers.length;
    case 2:
      return numbers.length;
    case 3:
      return args.reduce((total, arg) => {
        if (!isRange(arg)) return total + (isBlank(arg) || arg === "" ? 0 : 1);
        let count = 0;
        for (const row of arg.values) {
          for (const cell of row) if (!isBlank(cell) && cell !== "") count += 1;
        }
        return total + count;
      }, 0);
    case 4:
      return numbers.length ? numbers.reduce((a, b) => (b > a ? b : a)) : 0;
    case 5:
      return numbers.length ? numbers.reduce((a, b) => (b < a ? b : a)) : 0;
    case 6:
      return numbers.length ? numbers.reduce((a, b) => a * b, 1) : 0;
    case 7:
    case 8:
    case 10:
    case 11: {
      const sample = code === 7 || code === 10;
      if (!numbers.length || (sample && numbers.length < 2)) {
        throw new FormulaError(CODES.DIV0, `${name} needs at least two numbers for that code.`);
      }
      const mean = numbers.reduce((a, b) => a + b, 0) / numbers.length;
      const squares = numbers.reduce((a, b) => a + (b - mean) ** 2, 0);
      const variance = squares / (sample ? numbers.length - 1 : numbers.length);
      return code === 7 || code === 8 ? Math.sqrt(variance) : variance;
    }
    case 9:
      return numbers.reduce((a, b) => a + b, 0);
    default:
      throw new FormulaError(
        CODES.VALUE,
        `${name} cannot use ${code}. Use 1 to 11 (1 AVERAGE, 2 COUNT, 3 COUNTA, 4 MAX, 5 MIN, 6 PRODUCT, 9 SUM).`,
      );
  }
}

/* -------------------------------------------------------------- date helpers */

/**
 * Excel counts days from 1899-12-30, which is two days before 1900-01-01 and therefore lands
 * 1900-03-01 on serial 61, exactly as Excel's own leap-year bug left it.
 */
const SERIAL_EPOCH = Date.UTC(1899, 11, 30);
const MS_PER_DAY = 86_400_000;

/** The clock a drill reads: pinned by the screen's `today`, otherwise this machine's clock. */
function clockOf(ctx) {
  const pinned = ctx?.clock;
  return pinned instanceof Date && !Number.isNaN(pinned.getTime()) ? pinned : new Date();
}

/** The serial of the clock's calendar day, read in the same timezone the clock was built in. */
function daySerial(date) {
  return (Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - SERIAL_EPOCH) / MS_PER_DAY;
}

/** A pinned date is whole; a live clock carries the time of day in the fraction. */
function serialOf(date) {
  const seconds = date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds();
  return daySerial(date) + (seconds + date.getMilliseconds() / 1000) / 86_400;
}

function dateFromSerial(name, value) {
  const serial = toNumber(value);
  if (!Number.isFinite(serial) || serial < 0 || serial > 2_958_465) {
    throw new FormulaError(CODES.NUM, `${name}: ${serial} is not a date this sheet can hold.`);
  }
  return new Date(SERIAL_EPOCH + Math.trunc(serial) * MS_PER_DAY);
}

function datePart(name, value, pick) {
  return pick(dateFromSerial(name, value));
}

/** DATE rolls an out-of-range month or day into the neighbouring month, and years 0-1899 into the 1900s. */
function partsToSerial(name, year, month, day) {
  const y = Math.trunc(toNumber(year));
  const m = Math.trunc(toNumber(month));
  const d = Math.trunc(toNumber(day));
  const fullYear = y >= 0 && y < 1900 ? y + 1900 : y;
  const stamp = Date.UTC(fullYear, m - 1, d);
  const serial = (stamp - SERIAL_EPOCH) / MS_PER_DAY;
  if (!Number.isFinite(serial) || serial < 0) {
    throw new FormulaError(CODES.NUM, `${name}: ${y}-${m}-${d} is before the first date this sheet can hold.`);
  }
  return serial;
}

/** Shift a serial by whole months, pinning the day to the end of a shorter month. */
function addMonths(name, serial, step) {
  const start = dateFromSerial(name, serial);
  const year = start.getUTCFullYear();
  const month = start.getUTCMonth() + step;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(start.getUTCDate(), lastDay);
  return partsToSerial(name, year, month + 1, day);
}

/** The seconds past midnight a serial carries, rounded because a serial is a float. */
function secondsOfDay(name, value) {
  const serial = toNumber(value);
  dateFromSerial(name, serial);
  const fraction = serial - Math.floor(serial);
  return Math.round(fraction * 86_400) % 86_400;
}

const DATEDIF_UNITS = new Set(["Y", "M", "D", "MD", "YM", "YD"]);

/**
 * DATEDIF answers with the *complete* units between two dates, which is why a birthday that has
 * not come round yet does not count. Everything it reports falls out of one number: the count of
 * whole months, with the remainder left over as days.
 */
function datedif(name, startValue, endValue, unitValue) {
  const start = Math.trunc(toNumber(startValue));
  const end = Math.trunc(toNumber(endValue));
  const unit = toText(unitValue).trim().toUpperCase();
  if (!DATEDIF_UNITS.has(unit)) {
    throw new FormulaError(CODES.NUM, `${name}: "${unit}" is not a unit DATEDIF knows.`);
  }
  if (start > end) {
    throw new FormulaError(CODES.NUM, `${name}: the start date is after the end date.`);
  }

  const from = dateFromSerial(name, start);
  const to = dateFromSerial(name, end);
  let months = (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth());
  if (months > 0 && addMonths(name, start, months) > end) months -= 1;
  if (months < 0) months = 0;

  switch (unit) {
    case "D":
      return end - start;
    case "M":
      return months;
    case "Y":
      return Math.floor(months / 12);
    case "MD":
      return end - addMonths(name, start, months);
    case "YM":
      return months % 12;
    default:
      return end - addMonths(name, start, Math.floor(months / 12) * 12);
  }
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

  /* Conditional aggregates: one tested range for SUMIF/COUNTIF, many for the *IFS family. */
  SUMIFS: (args, ctx, node) =>
    conditionalNumbers("SUMIFS", args, ctx, node).reduce((a, b) => a + b, 0),

  AVERAGEIFS: (args, ctx, node) => {
    const numbers = conditionalNumbers("AVERAGEIFS", args, ctx, node);
    if (!numbers.length) {
      throw new FormulaError(CODES.DIV0, "AVERAGEIFS found no numbers that match every criterion.");
    }
    return numbers.reduce((a, b) => a + b, 0) / numbers.length;
  },

  MINIFS: (args, ctx, node) => {
    const numbers = conditionalNumbers("MINIFS", args, ctx, node);
    // Excel answers 0 rather than an error when nothing matches, as MIN does.
    return numbers.length ? numbers.reduce((a, b) => (b < a ? b : a)) : 0;
  },

  MAXIFS: (args, ctx, node) => {
    const numbers = conditionalNumbers("MAXIFS", args, ctx, node);
    return numbers.length ? numbers.reduce((a, b) => (b > a ? b : a)) : 0;
  },

  COUNTIFS: (args, ctx, node) => {
    const pairs = conditionalPairs("COUNTIFS", args, 0, ctx, node);
    const anchor = pairs[0].range;
    pairs.forEach((pair, index) => sameShape("COUNTIFS", anchor, pair.range, index * 2 + 1));

    let count = 0;
    for (let row = 0; row < anchor.height; row += 1) {
      for (let col = 0; col < anchor.width; col += 1) {
        if (pairs.every((pair) => pair.test(pair.range.values[row][col]))) count += 1;
      }
    }
    return count;
  },

  /* Statistics that need the numbers sorted, or a shape rather than a total. */
  MEDIAN: (args) => {
    const numbers = aggregateNumbers("MEDIAN", args).sort((a, b) => a - b);
    if (!numbers.length) throw new FormulaError(CODES.NUM, "MEDIAN found no numbers to work with.");
    const middle = Math.floor(numbers.length / 2);
    return numbers.length % 2 ? numbers[middle] : (numbers[middle - 1] + numbers[middle]) / 2;
  },

  MODE: (args) => {
    const numbers = aggregateNumbers("MODE", args);
    const counts = new Map();
    let best = null;
    let bestCount = 1;
    for (const number of numbers) {
      const count = (counts.get(number) ?? 0) + 1;
      counts.set(number, count);
      if (count > bestCount) {
        best = number;
        bestCount = count;
      }
    }
    if (best === null) {
      throw new FormulaError(CODES.NA, "MODE found no value repeated more than once.");
    }
    return best;
  },

  LARGE: (args) => {
    const numbers = numbersOf("LARGE", args[0]).sort((a, b) => b - a);
    const k = Math.trunc(toNumber(scalar(args[1])));
    if (!Number.isFinite(k) || k < 1 || k > numbers.length) {
      throw new FormulaError(
        CODES.NUM,
        `LARGE needs a position from 1 to ${numbers.length}; there ${numbers.length === 1 ? "is" : "are"} ${numbers.length} number${numbers.length === 1 ? "" : "s"} in that block.`,
      );
    }
    return numbers[k - 1];
  },

  SMALL: (args) => {
    const numbers = numbersOf("SMALL", args[0]).sort((a, b) => a - b);
    const k = Math.trunc(toNumber(scalar(args[1])));
    if (!Number.isFinite(k) || k < 1 || k > numbers.length) {
      throw new FormulaError(
        CODES.NUM,
        `SMALL needs a position from 1 to ${numbers.length}; there ${numbers.length === 1 ? "is" : "are"} ${numbers.length} number${numbers.length === 1 ? "" : "s"} in that block.`,
      );
    }
    return numbers[k - 1];
  },

  RANK: (args) => {
    const number = toNumber(scalar(args[0]));
    const values = numbersOf("RANK", args[1]);
    const ascending = args.length > 2 && toBoolean(scalar(args[2]));
    if (!values.includes(number)) {
      throw new FormulaError(CODES.NA, `RANK found no ${number} in that block.`);
    }
    const ahead = values.filter((value) => (ascending ? value < number : value > number)).length;
    return ahead + 1;
  },

  /* Boolean tests. ISERROR and ISNA also live in LAZY_FUNCTIONS: an argument that
     throws has to be caught before it is evaluated. */
  ISBLANK: (args) => isBlank(scalar(args[0])),
  ISNUMBER: (args) => typeof scalar(args[0]) === "number",
  ISTEXT: (args) => typeof scalar(args[0]) === "string" && !isBlank(scalar(args[0])),
  ISLOGICAL: (args) => typeof scalar(args[0]) === "boolean",
  NA: () => {
    throw new FormulaError(CODES.NA, "NA() writes #N/A on purpose.");
  },

  /* Aggregates over many ranges. */
  SUMPRODUCT: (args) => {
    const anchor = args.find(isRange);
    if (!anchor) return args.reduce((product, arg) => product * toNumber(arg), 1);
    args.forEach((arg, index) => {
      if (isRange(arg)) sameShape("SUMPRODUCT", anchor, arg, index + 1);
    });

    let total = 0;
    for (let row = 0; row < anchor.height; row += 1) {
      for (let col = 0; col < anchor.width; col += 1) {
        let product = 1;
        for (const arg of args) {
          const cell = isRange(arg) ? arg.values[row][col] : arg;
          // Excel treats text and blanks as 0 inside SUMPRODUCT rather than refusing them.
          const number = numericOrNull(isBlank(cell) ? null : cell);
          product *= number ?? 0;
        }
        total += product;
      }
    }
    return total;
  },

  SUBTOTAL: (args) => {
    const code = Math.trunc(toNumber(scalar(args[0])));
    const bare = code > 100 ? code - 100 : code;
    return aggregateByCode("SUBTOTAL", bare, args.slice(1));
  },

  /* AGGREGATE shares SUBTOTAL's code table, adds MEDIAN/MODE/LARGE/SMALL and takes an
     options number that hides rows and errors — this engine shows every row and lets a
     reference to an error cell fail loudly, so the options are accepted and ignored. */
  AGGREGATE: (args) => {
    const code = Math.trunc(toNumber(scalar(args[0])));
    const options = Math.trunc(toNumber(scalar(args[1])));
    if (!(options >= 0 && options <= 7)) {
      throw new FormulaError(CODES.VALUE, `AGGREGATE's option ${options} is not one of 0 to 7.`);
    }
    const rest = args.slice(2);
    if (code === 14 || code === 15) {
      if (rest.length !== 2) throw badArgs("AGGREGATE", "LARGE and SMALL need the block and a position.");
      return FUNCTIONS[code === 14 ? "LARGE" : "SMALL"](rest);
    }
    return aggregateByCode("AGGREGATE", code, rest);
  },

  /* Spilling functions. The drill grades one value, so these hand back a range value
     that other functions read: =COUNTA(UNIQUE(...)), =INDEX(SORT(...),2). */
  UNIQUE: (args) => {
    const source = requireRange("UNIQUE", args[0], 1);
    const byColumn = args.length > 1 && toBoolean(scalar(args[1]));
    const once = args.length > 2 && toBoolean(scalar(args[2]));
    const lines = byColumn
      ? Array.from({ length: source.width }, (_, col) => source.values.map((row) => row[col]))
      : source.values.map((row) => [...row]);

    const seen = new Map();
    for (const line of lines) {
      const key = JSON.stringify(line.map((cell) => (isBlank(cell) ? null : cell)));
      seen.set(key, { line, count: (seen.get(key)?.count ?? 0) + 1 });
    }
    const kept = [...seen.values()]
      .filter((entry) => (once ? entry.count === 1 : true))
      .map((entry) => entry.line);
    if (!kept.length) throw new FormulaError(CODES.NA, "UNIQUE found no value left after filtering.");

    /* Dedupe keeps whole rows (or whole columns), so the block hands back the shape of its source:
       a repeated row of a two-column range answers with both of its cells, not just the first. */
    if (!byColumn) return spill(kept);
    return spill(source.values.map((row, index) => kept.map((line) => line[index])));
  },

  SORT: (args) => {
    const source = requireRange("SORT", args[0], 1);
    const index = args.length > 1 ? Math.trunc(toNumber(scalar(args[1]))) : 1;
    const descending = args.length > 2 && toNumber(scalar(args[2])) === -1;
    const byColumn = args.length > 3 && toBoolean(scalar(args[3]));
    const lines = byColumn
      ? Array.from({ length: source.width }, (_, col) => source.values.map((row) => row[col]))
      : source.values.map((row) => [...row]);

    const limit = byColumn ? source.height : source.width;
    if (!(index >= 1 && index <= limit)) {
      throw new FormulaError(CODES.VALUE, `SORT's sort index must be from 1 to ${limit}.`);
    }
    const order = descending ? -1 : 1;
    lines.sort((a, b) => order * compareValues(a[index - 1], b[index - 1]));

    return byColumn ? spill(lines.map((line) => line[0])) : spill(lines);
  },

  FILTER: (args) => {
    const source = requireRange("FILTER", args[0], 1);
    const include = requireRange("FILTER", args[1], 2);
    if (include.width !== 1 || include.height !== source.height) {
      throw badArgs(
        "FILTER",
        `the include argument is ${include.height}x${include.width} but must be a single column with ${source.height} rows.`,
      );
    }

    const kept = source.values.filter((_, row) => toBoolean(include.values[row][0]));
    if (!kept.length) {
      if (args.length > 2) return scalar(args[2]);
      throw new FormulaError(CODES.NA, "FILTER found no rows that match, and no value was given for that case.");
    }
    return spill(kept);
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

  // Excel replaces every instance unless a fourth argument names one, and an empty needle
  // returns the text unchanged rather than wrapping it in the replacement.
  SUBSTITUTE: (args) => {
    const text = toText(scalar(args[0]));
    const needle = toText(scalar(args[1]));
    const replacement = toText(scalar(args[2]));
    if (needle === "") return text;
    if (args.length > 3) {
      const which = Math.trunc(toNumber(args[3]));
      if (which < 1) throw new FormulaError(CODES.VALUE, "SUBSTITUTE's instance number begins at 1.");
      let index = -1;
      for (let seen = 0; seen < which; seen += 1) {
        index = text.indexOf(needle, index + 1);
        if (index === -1) return text;
      }
      return text.slice(0, index) + replacement + text.slice(index + needle.length);
    }
    return text.split(needle).join(replacement);
  },

  TEXTBEFORE: (args) => sliceOnDelimiter(args, "before"),

  TEXTAFTER: (args) => sliceOnDelimiter(args, "after"),

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
  MROUND: (args) => multipleRound("MROUND", args[0], args[1], "nearest"),
  FLOOR: (args) => multipleRound("FLOOR", args[0], args[1], "down"),
  CEILING: (args) => multipleRound("CEILING", args[0], args[1], "up"),

  // Dates answer with a serial number, so a drill can compare one to a number it was given.
  TODAY: (_args, ctx) => daySerial(clockOf(ctx)),
  NOW: (_args, ctx) => serialOf(clockOf(ctx)),
  DATE: (args) => partsToSerial("DATE", args[0], args[1], args[2]),
  YEAR: (args) => datePart("YEAR", args[0], (date) => date.getUTCFullYear()),
  MONTH: (args) => datePart("MONTH", args[0], (date) => date.getUTCMonth() + 1),
  DAY: (args) => datePart("DAY", args[0], (date) => date.getUTCDate()),
  DAYS: (args) => {
    const end = Math.trunc(toNumber(args[0]));
    const start = Math.trunc(toNumber(args[1]));
    dateFromSerial("DAYS", start);
    dateFromSerial("DAYS", end);
    return end - start;
  },
  DATEDIF: (args) => datedif("DATEDIF", args[0], args[1], args[2]),
  EDATE: (args) => addMonths("EDATE", Math.trunc(toNumber(args[0])), Math.trunc(toNumber(args[1]))),
  EOMONTH: (args) => {
    const start = Math.trunc(toNumber(args[0]));
    const step = Math.trunc(toNumber(args[1]));
    const shifted = dateFromSerial("EOMONTH", addMonths("EOMONTH", start, step));
    const year = shifted.getUTCFullYear();
    const month = shifted.getUTCMonth();
    return partsToSerial("EOMONTH", year, month + 2, 0);
  },
  HOUR: (args) => Math.floor(secondsOfDay("HOUR", args[0]) / 3600),
  MINUTE: (args) => Math.floor((secondsOfDay("MINUTE", args[0]) % 3600) / 60),
  WEEKDAY: (args) => {
    const serial = Math.trunc(toNumber(args[0]));
    const type = args.length > 1 ? Math.trunc(toNumber(args[1])) : 1;
    const day = dateFromSerial("WEEKDAY", serial).getUTCDay();
    if (type === 1 || type === 17) return day + 1;
    if (type === 2 || type === 11) return ((day + 6) % 7) + 1;
    if (type === 3) return (day + 6) % 7;
    if (type >= 12 && type <= 16) return ((day - (type - 10) + 7) % 7) + 1;
    throw new FormulaError(CODES.NUM, `WEEKDAY: ${type} is not a week numbering Excel knows.`);
  },
};

/** Functions handled by the evaluator itself so arguments stay lazy. */
const LAZY_FUNCTIONS = new Set(["IF", "IFERROR", "IFNA", "IFS", "SWITCH", "ISERROR", "ISNA"]);

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
  SUBSTITUTE: { min: 3, max: 4 },
  TEXTBEFORE: { min: 2, max: 3 },
  TEXTAFTER: { min: 2, max: 3 },
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
  MROUND: { min: 2, max: 2 },
  FLOOR: { min: 2, max: 2 },
  CEILING: { min: 2, max: 2 },
  TODAY: { min: 0, max: 0 },
  NOW: { min: 0, max: 0 },
  DATE: { min: 3, max: 3 },
  YEAR: { min: 1, max: 1 },
  MONTH: { min: 1, max: 1 },
  DAY: { min: 1, max: 1 },
  DAYS: { min: 2, max: 2 },
  DATEDIF: { min: 3, max: 3 },
  EDATE: { min: 2, max: 2 },
  EOMONTH: { min: 2, max: 2 },
  WEEKDAY: { min: 1, max: 2 },
  HOUR: { min: 1, max: 1 },
  MINUTE: { min: 1, max: 1 },
  SUMIFS: { min: 3, max: Infinity },
  COUNTIFS: { min: 2, max: Infinity },
  AVERAGEIFS: { min: 3, max: Infinity },
  MINIFS: { min: 3, max: Infinity },
  MAXIFS: { min: 3, max: Infinity },
  MEDIAN: { min: 1, max: Infinity },
  MODE: { min: 1, max: Infinity },
  LARGE: { min: 2, max: 2 },
  SMALL: { min: 2, max: 2 },
  RANK: { min: 2, max: 3 },
  IFS: { min: 2, max: Infinity },
  SWITCH: { min: 3, max: Infinity },
  IFNA: { min: 2, max: 2 },
  ISBLANK: { min: 1, max: 1 },
  ISNUMBER: { min: 1, max: 1 },
  ISTEXT: { min: 1, max: 1 },
  ISLOGICAL: { min: 1, max: 1 },
  ISERROR: { min: 1, max: 1 },
  ISNA: { min: 1, max: 1 },
  NA: { min: 0, max: 0 },
  SUMPRODUCT: { min: 1, max: Infinity },
  SUBTOTAL: { min: 2, max: Infinity },
  AGGREGATE: { min: 3, max: Infinity },
  UNIQUE: { min: 1, max: 3 },
  SORT: { min: 1, max: 4 },
  FILTER: { min: 2, max: 3 },
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
