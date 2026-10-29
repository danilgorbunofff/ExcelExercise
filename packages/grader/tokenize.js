import { parseRef } from "./address.js";
import { CODES, FormulaError } from "./errors.js";

const NUMBER_RE = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/;
const TWO_CHAR_OPS = new Set(["<>", "<=", ">=", "!="]);
const ONE_CHAR_OPS = new Set(["+", "-", "*", "/", "^", "&", "%", "=", "<", ">"]);
const PUNCTUATION = { "(": "lparen", ")": "rparen", ",": "comma", ";": "comma", ":": "colon" };

function isSpace(ch) {
  return ch === " " || ch === "\t" || ch === "\n" || ch === "\r";
}

function isDigit(ch) {
  return ch >= "0" && ch <= "9";
}

function isWordStart(ch) {
  return /[A-Za-z_$]/.test(ch);
}

function isWordPart(ch) {
  return /[A-Za-z0-9_$]/.test(ch);
}

function readString(src, start, quote) {
  let out = "";
  let i = start + 1;
  while (i < src.length) {
    const ch = src[i];
    if (ch === quote) {
      if (src[i + 1] === quote) {
        out += quote;
        i += 2;
        continue;
      }
      return { text: out, end: i + 1 };
    }
    out += ch;
    i += 1;
  }
  throw new FormulaError(CODES.PARSE, "The text is missing its closing quote.", start);
}

function readRef(word) {
  const parsed = parseRef(word);
  if (!parsed) return null;
  const m = /^(\$?)([A-Za-z]{1,3})(\$?)(\d+)$/.exec(word);
  return {
    ...parsed,
    absCol: m[1] === "$",
    absRow: m[3] === "$",
  };
}

function classifyWord(src, word, start, end) {
  const after = src.slice(end).replace(/^[ \t]+/, "");
  if (after.startsWith("(")) {
    if (/^\d/.test(word)) return null;
    return { type: "name", value: word, text: word, start, end };
  }
  const upper = word.toUpperCase();
  if (upper === "TRUE" || upper === "FALSE") {
    return { type: "bool", value: upper === "TRUE", text: word, start, end };
  }
  const ref = readRef(word);
  if (ref) return { type: "ref", value: ref, text: word, start, end };
  return { type: "name", value: word, text: word, start, end };
}

/**
 * Turn a formula string into a flat token list ending in `eof`.
 * Every token carries `start`/`end` offsets so errors can point at a caret.
 */
export function tokenize(source) {
  if (typeof source !== "string") {
    throw new FormulaError(CODES.PARSE, "A formula has to be text.", 0);
  }

  let i = 0;
  while (i < source.length && isSpace(source[i])) i += 1;
  if (source[i] === "=") i += 1;

  const tokens = [];
  while (i < source.length) {
    const ch = source[i];

    if (isSpace(ch)) {
      i += 1;
      continue;
    }

    const start = i;

    if (ch === '"' || ch === "'") {
      const { text, end } = readString(source, start, ch);
      tokens.push({ type: "str", value: text, start, end });
      i = end;
      continue;
    }

    if (isDigit(ch) || (ch === "." && isDigit(source[i + 1] ?? ""))) {
      const match = NUMBER_RE.exec(source.slice(i));
      const text = match[0];
      tokens.push({ type: "num", value: Number(text), text, start, end: start + text.length });
      i += text.length;
      continue;
    }

    if (isWordStart(ch)) {
      let j = i;
      while (j < source.length && isWordPart(source[j])) j += 1;
      const word = source.slice(i, j);
      const token = classifyWord(source, word, i, j);
      if (!token) {
        throw new FormulaError(CODES.PARSE, `"${word}" is not a valid cell reference or function.`, i);
      }
      tokens.push(token);
      i = j;
      continue;
    }

    const pair = source.slice(i, i + 2);
    if (TWO_CHAR_OPS.has(pair)) {
      tokens.push({ type: "op", value: pair === "!=" ? "<>" : pair, start, end: start + 2 });
      i += 2;
      continue;
    }

    if (ONE_CHAR_OPS.has(ch)) {
      tokens.push({ type: "op", value: ch, start, end: start + 1 });
      i += 1;
      continue;
    }

    if (Object.hasOwn(PUNCTUATION, ch)) {
      tokens.push({ type: "punct", value: PUNCTUATION[ch], start, end: start + 1 });
      i += 1;
      continue;
    }

    throw new FormulaError(CODES.PARSE, `"${ch}" cannot appear in a formula.`, i);
  }

  tokens.push({ type: "eof", value: null, start: source.length, end: source.length });
  return tokens;
}

export function describeToken(token) {
  switch (token.type) {
    case "eof":
      return "the end of the formula";
    case "str":
      return `"${token.value}"`;
    case "num":
      return token.text;
    default:
      return `"${token.text ?? token.value}"`;
  }
}
