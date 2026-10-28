import { parseRef } from "./address.js";
import { FormulaError } from "./errors.js";
import { buildCells, createContext, evaluate, formatValue } from "./evaluate.js";
import { callsOf, parse, walkAst } from "./parse.js";
import { valuesEqual, isBlank, isRange } from "./values.js";

const DEFAULT_MESSAGES = {
  syntax: "That formula cannot be read yet.",
  require: "The formula does not use the function this lesson is teaching.",
  forbid: "The formula uses a function this lesson asks you not to use.",
  "require-ref": "The formula does not point at the data it is meant to use.",
  matchType: "One of the arguments is not what this lesson needs.",
  value: "The formula runs, but the answer is not the one this lesson expects.",
  error: "The formula stops with an error instead of a value.",
  internal: "The grader could not read that formula.",
  correct: "Correct.",
};

function hintFor(exercise, ruleId) {
  const hints = exercise?.hints ?? {};
  return hints[ruleId] ?? hints[ruleKeyFallback(ruleId)] ?? hints.value ?? "";
}

function ruleKeyFallback(ruleId) {
  if (ruleId === "require-ref") return "requireRef";
  if (ruleId === "matchType") return "match";
  return "value";
}

function outcome(ok, rule, exercise, extra = {}) {
  return {
    ok,
    rule,
    message: extra.message ?? DEFAULT_MESSAGES[rule] ?? DEFAULT_MESSAGES.value,
    hint: ok ? "" : (extra.hint ?? hintFor(exercise, rule)),
    value: extra.value === undefined ? null : extra.value,
    expected: extra.expected === undefined ? null : extra.expected,
    code: extra.code ?? null,
    position: extra.position ?? null,
  };
}

/** True when the AST points at `targetKey`, directly or through a range. */
export function referencesCell(ast, targetKey) {
  const target = parseRef(targetKey);
  if (!target) return false;

  let found = false;
  walkAst(ast, (node) => {
    if (found) return;
    if (node.type === "ref" && node.key === target.key) {
      found = true;
      return;
    }
    if (node.type === "range") {
      const rows = [node.from.row, node.to.row].sort((a, b) => a - b);
      const cols = [node.from.colIndex, node.to.colIndex].sort((a, b) => a - b);
      if (
        target.row >= rows[0] &&
        target.row <= rows[1] &&
        target.colIndex >= cols[0] &&
        target.colIndex <= cols[1]
      ) {
        found = true;
      }
    }
  });
  return found;
}

function checkRequire(ast, rule) {
  const calls = callsOf(ast, rule.func);
  if (!calls.length) {
    return {
      rule: rule.id,
      // Lessons that need more than one function supply their own sentence, because the
      // generic one would name a function the lesson also teaches rather than the missing one.
      message: rule.message ?? `This lesson is about ${rule.func}. Your formula does not use ${rule.func}.`,
      hint: rule.hint,
    };
  }
  if (rule.minArgs) {
    // Every use has to carry the arguments, not just the outermost one:
    // a nested three-argument VLOOKUP is still a three-argument VLOOKUP.
    const worst = calls.reduce((low, call) => (call.args.length < low.args.length ? call : low), calls[0]);
    if (worst.args.length < rule.minArgs) {
      // `message` speaks to the absent function, so it must not answer here: the function is
      // there, and telling the learner to add it is false. `minArgsMessage` is the per-rule slot.
      const needed = rule.minArgs === 1 ? "argument" : "arguments";
      return {
        rule: rule.id,
        message:
          rule.minArgsMessage ??
          `${rule.func} needs at least ${rule.minArgs} ${needed} here; yours has ${worst.args.length}.`,
        hint: rule.hint,
      };
    }
  }
  return null;
}

function checkForbid(ast, rule) {
  const calls = callsOf(ast, rule.func);
  if (!calls.length) return null;
  return {
    rule: rule.id,
    message: rule.message ?? `This lesson asks for a solution without ${rule.func}.`,
    hint: rule.hint,
  };
}

function checkMatchType(ast, rule, ctx) {
  const calls = callsOf(ast, rule.func);
  if (!calls.length) {
    return {
      rule: rule.id,
      message: rule.message ?? `${rule.func} is missing from the formula.`,
      hint: rule.hint,
    };
  }

  const index = rule.arg - 1;
  for (const call of calls) {
    const failure = checkCallArgument(call, index, rule, ctx);
    if (failure) return failure;
  }
  return null;
}

function checkCallArgument(call, index, rule, ctx) {
  const argNode = call.args[index];

  if (!argNode || argNode.type === "blank") {
    return {
      rule: rule.id,
      message:
        rule.missingMessage ??
        `${rule.func} has no ${ordinal(rule.arg)} argument, so Excel uses its default instead.`,
      hint: rule.hint,
    };
  }

  let value;
  try {
    value = evaluate(argNode, ctx);
  } catch (error) {
    if (error instanceof FormulaError) {
      return { rule: rule.id, message: error.message, hint: rule.hint, code: error.code };
    }
    throw error;
  }

  // An empty cell is not the same thing as a value the lesson accepts:
  // a blank fourth argument is what Excel treats as the default, not `FALSE`.
  if (isBlank(value)) {
    return {
      rule: rule.id,
      message:
        rule.missingMessage ??
        `${rule.func}'s ${ordinal(rule.arg)} argument points at an empty cell, so this lesson cannot use it.`,
      hint: rule.hint,
    };
  }

  // A block of cells is not a single argument value: `=VLOOKUP(x,A1:B3,3,A2:A3)`
  // passes a whole column where a lookup mode belongs. Comparing it would throw.
  if (isRange(value)) {
    return {
      rule: rule.id,
      message:
        rule.wrongMessage ??
        `${rule.func}'s ${ordinal(rule.arg)} argument points at ${formatValue(value)} instead of a single value.`,
      hint: rule.hint,
    };
  }

  const allowed = rule.values ?? [];
  let passes = false;
  try {
    passes = allowed.some((candidate) => valuesEqual(value, candidate));
  } catch (error) {
    if (!(error instanceof FormulaError)) throw error;
    return { rule: rule.id, message: error.message, hint: rule.hint, code: error.code };
  }
  if (passes) return null;

  return {
    rule: rule.id,
    message:
      rule.wrongMessage ??
      `${rule.func}'s ${ordinal(rule.arg)} argument is ${formatValue(value)}; this lesson needs ${allowed
        .map(formatValue)
        .join(" or ")}.`,
    hint: rule.hint,
  };
}

function ordinal(n) {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

function compareToExpected(actual, expected, tolerance) {
  if (isRange(actual)) return false;
  if (typeof actual === "number" && typeof expected === "number") {
    const scale = Math.max(1, Math.abs(actual), Math.abs(expected));
    return Math.abs(actual - expected) <= tolerance * scale;
  }
  // Excel's `=` operator ignores case, but the text a formula writes into a cell
  // keeps it: "pass" is not the answer when the lesson asks for "Pass".
  if (typeof actual === "string" && typeof expected === "string") return actual === expected;
  return valuesEqual(actual, expected);
}

/**
 * Grade a learner's formula against an exercise.
 * Never throws for bad input: an unreadable formula is a `syntax` outcome.
 */
export function grade(exercise, input) {
  if (!exercise || !exercise.expect || exercise.expect.value === undefined) {
    throw new TypeError("exercise.expect.value is required");
  }

  const cells = exercise.cells ?? (exercise.grid ? buildCells(exercise) : {});
  const ctx = createContext(cells);
  const expected = exercise.expect.value;
  const tolerance = exercise.expect.tolerance ?? 1e-9;

  let ast;
  try {
    ast = parse(input);
  } catch (error) {
    if (error instanceof FormulaError) {
      return outcome(false, "syntax", exercise, {
        message: error.message,
        hint: exercise?.hints?.syntax,
        code: error.code,
        position: error.position,
        expected,
      });
    }
    throw error;
  }

  for (const rule of exercise.require ?? []) {
    const failure = checkRequire(ast, rule);
    if (failure) return outcome(false, failure.rule, exercise, { ...failure, expected });
  }

  for (const rule of exercise.forbid ?? []) {
    const failure = checkForbid(ast, rule);
    if (failure) return outcome(false, failure.rule, exercise, { ...failure, expected });
  }

  if (exercise.requireRef && !referencesCell(ast, exercise.requireRef)) {
    return outcome(false, "require-ref", exercise, {
      message:
        exercise.requireRefMessage ??
        `Your formula does not refer to ${exercise.requireRef}. The lesson checks that you point at the data rather than typing the number.`,
      expected,
    });
  }

  for (const rule of exercise.rules ?? []) {
    if (rule.type !== "matchType") continue;
    const failure = checkMatchType(ast, rule, ctx);
    if (failure) return outcome(false, failure.rule, exercise, { ...failure, expected });
  }

  let actual;
  try {
    actual = evaluate(ast, ctx);
  } catch (error) {
    if (error instanceof FormulaError) {
      return outcome(false, "error", exercise, {
        message: `${error.code} ${error.message}`,
        hint: exercise?.hints?.error,
        code: error.code,
        position: error.position,
        expected,
      });
    }
    throw error;
  }

  if (isRange(actual)) {
    return outcome(false, "value", exercise, {
      message:
        exercise.expect.rangeMessage ??
        `Your formula points at ${formatValue(actual)} instead of producing one value. Point at the single cell that holds the answer.`,
      expected,
    });
  }

  if (!compareToExpected(actual, expected, tolerance)) {
    return outcome(false, "value", exercise, {
      message:
        exercise.expect.message ??
        `Your formula returns ${formatValue(actual)}, but this lesson expects ${formatValue(expected)}.`,
      value: actual,
      expected,
    });
  }

  return outcome(true, "correct", exercise, {
    message: exercise.successMessage ?? DEFAULT_MESSAGES.correct,
    value: actual,
    expected,
  });
}

/** Structural summary used by rules and by the UI's "what did I write" panel. */
export function describeFormula(input) {
  const ast = parse(input);
  const calls = [];
  const refs = [];
  walkAst(ast, (node) => {
    if (node.type === "call") calls.push({ name: node.upper, args: node.args.length });
    if (node.type === "ref") refs.push(node.key);
  });
  return { ast, calls, refs };
}
