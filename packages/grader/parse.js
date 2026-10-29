import { CODES, FormulaError } from "./errors.js";
import { describeToken, tokenize } from "./tokenize.js";

const BINDING_POWER = {
  ":": 80,
  "%": 90,
  "^": 50,
  "*": 40,
  "/": 40,
  "+": 30,
  "-": 30,
  "&": 20,
  "=": 10,
  "<>": 10,
  "<": 10,
  ">": 10,
  "<=": 10,
  ">=": 10,
};

const RIGHT_ASSOCIATIVE = new Set(["^"]);
const UNARY_BP = 55;

/** Deep enough for any teaching formula, shallow enough to never overflow the stack. */
const MAX_DEPTH = 64;

function peek(state) {
  return state.tokens[state.pos];
}

function advance(state) {
  const token = state.tokens[state.pos];
  state.pos += 1;
  return token;
}

function isPunct(token, value) {
  return token.type === "punct" && token.value === value;
}

function isOp(token, value) {
  return token.type === "op" && token.value === value;
}

function expression(state, rightBindingPower) {
  state.depth += 1;
  if (state.depth > MAX_DEPTH) {
    throw new FormulaError(
      CODES.PARSE,
      `That formula is nested more than ${MAX_DEPTH} levels deep. Break it into smaller steps.`,
      peek(state)?.start ?? null,
    );
  }

  try {
    let left = prefix(state);

    for (;;) {
      const token = peek(state);
      if (token.type === "eof") break;

      let leftBindingPower;
      if (token.type === "op") leftBindingPower = BINDING_POWER[token.value];
      else if (isPunct(token, "colon")) leftBindingPower = BINDING_POWER[":"];
      else break;

      if (leftBindingPower === undefined || leftBindingPower <= rightBindingPower) break;
      left = infix(state, left, token);
    }

    return left;
  } finally {
    state.depth -= 1;
  }
}

function prefix(state) {
  const token = advance(state);

  switch (token.type) {
    case "num":
      return { type: "number", value: token.value, start: token.start, end: token.end };
    case "str":
      return { type: "string", value: token.value, start: token.start, end: token.end };
    case "bool":
      return { type: "boolean", value: token.value, start: token.start, end: token.end };
    case "ref":
      return { type: "ref", ...token.value, start: token.start, end: token.end };
    case "name":
      if (isPunct(peek(state), "lparen")) return call(state, token);
      return { type: "name", name: token.value, start: token.start, end: token.end };
    case "punct":
      if (token.value === "lparen") {
        const inner = expression(state, 0);
        const closing = peek(state);
        if (!isPunct(closing, "rparen")) {
          throw new FormulaError(
            CODES.PARSE,
            `A "(" is never closed; found ${describeToken(closing)} instead of ")".`,
            token.start,
          );
        }
        advance(state);
        return inner;
      }
      throw new FormulaError(CODES.PARSE, `Unexpected ${describeToken(token)}.`, token.start);
    case "op":
      if (token.value === "+" || token.value === "-") {
        const operand = expression(state, UNARY_BP);
        return { type: "unary", op: token.value, operand, start: token.start, end: operand.end };
      }
      throw new FormulaError(CODES.PARSE, `"${token.value}" cannot start a formula.`, token.start);
    default:
      throw new FormulaError(CODES.PARSE, `Unexpected ${describeToken(token)}.`, token.start);
  }
}

function infix(state, left, token) {
  if (token.type === "punct" && token.value === "colon") {
    advance(state);
    const right = expression(state, BINDING_POWER[":"]);
    if (left.type !== "ref" || right.type !== "ref") {
      throw new FormulaError(
        CODES.PARSE,
        "The : operator needs a cell reference on each side, like A1:B4.",
        token.start,
      );
    }
    return {
      type: "range",
      from: left,
      to: right,
      name: `${left.key}:${right.key}`,
      start: left.start,
      end: right.end,
    };
  }

  advance(state);

  if (token.value === "%") {
    return { type: "percent", operand: left, start: left.start, end: token.end };
  }

  const bindingPower = BINDING_POWER[token.value];
  const right = expression(
    state,
    RIGHT_ASSOCIATIVE.has(token.value) ? bindingPower - 1 : bindingPower,
  );

  return {
    type: "binary",
    op: token.value,
    left,
    right,
    start: left.start,
    end: right.end,
  };
}

function call(state, nameToken) {
  advance(state); // lparen
  const args = [];
  const name = nameToken.value;

  if (isPunct(peek(state), "rparen")) {
    const closing = advance(state);
    return {
      type: "call",
      name,
      upper: name.toUpperCase(),
      args,
      start: nameToken.start,
      end: closing.end,
    };
  }

  for (;;) {
    const token = peek(state);

    if (isPunct(token, "comma")) {
      args.push({ type: "blank", start: token.start, end: token.start });
      advance(state);
      continue;
    }

    if (isPunct(token, "rparen")) {
      args.push({ type: "blank", start: token.start, end: token.start });
      break;
    }

    if (token.type === "eof") {
      throw new FormulaError(
        CODES.PARSE,
        `${name} is missing its closing ")".`,
        nameToken.start,
      );
    }

    args.push(expression(state, 0));

    const next = peek(state);
    if (next.type === "eof") {
      throw new FormulaError(CODES.PARSE, `${name} is missing its closing ")".`, nameToken.start);
    }
    if (isPunct(next, "comma")) {
      advance(state);
      continue;
    }
    if (isPunct(next, "rparen")) break;
    throw new FormulaError(
      CODES.PARSE,
      `Inside ${name}, expected "," or ")", found ${describeToken(next)}.`,
      next.start,
    );
  }

  const closing = advance(state);
  return {
    type: "call",
    name,
    upper: name.toUpperCase(),
    args,
    start: nameToken.start,
    end: closing.end,
  };
}

/** Parse a formula string (or a token list) into an AST. */
export function parse(input) {
  const tokens = typeof input === "string" ? tokenize(input) : input;
  const state = { tokens, pos: 0, depth: 0 };

  if (peek(state).type === "eof") {
    throw new FormulaError(CODES.PARSE, "The formula is empty.", 0);
  }

  const ast = expression(state, 0);
  const trailing = peek(state);
  if (trailing.type !== "eof") {
    throw new FormulaError(
      CODES.PARSE,
      `Unexpected ${describeToken(trailing)} after the formula.`,
      trailing.start,
    );
  }
  return ast;
}

export function childrenOf(node) {
  switch (node?.type) {
    case "call":
      return node.args;
    case "binary":
      return [node.left, node.right];
    case "unary":
    case "percent":
      return [node.operand];
    default:
      return [];
  }
}

export function walkAst(node, visit) {
  if (!node) return;
  visit(node);
  for (const child of childrenOf(node)) walkAst(child, visit);
}

/** Every function call in the tree, by upper-case name. */
export function callsOf(ast, upperName) {
  const found = [];
  walkAst(ast, (node) => {
    if (node.type === "call" && node.upper === upperName.toUpperCase()) found.push(node);
  });
  return found;
}
