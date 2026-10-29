import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CODES,
  FormulaError,
  addressOf,
  buildCells,
  callsOf,
  colToIndex,
  expandRange,
  grade,
  gradeAnswer,
  indexToCol,
  normaliseAnswer,
  parse,
  parseRef,
  tokenize,
} from "../packages/grader/index.js";
import { evaluateFormula as run } from "../packages/grader/evaluate.js";
import { HOSTILE, OUTCOME_KEYS } from "./corpus.js";

/** Assert that `thunk` throws a FormulaError with `code`. */
function throwsCode(thunk, code) {
  assert.throws(thunk, (error) => {
    assert.ok(error instanceof FormulaError, `expected FormulaError, got ${error?.name}`);
    assert.equal(error.code, code);
    return true;
  });
}

const SALES = {
  A1: "Region",
  B1: "Q1",
  A2: "North",
  B2: 1200,
  A3: "South",
  B3: 1450,
  A4: "North",
  B4: 930,
  A5: "West",
  B5: 620,
};

const STAFF = {
  A1: "ID",
  B1: "Name",
  C1: "Salary",
  A2: "E-101",
  B2: "Ana",
  C2: 61500,
  A3: "E-102",
  B3: "Bo",
  C3: 57000,
  A4: "E-103",
  B4: "Cy",
  C4: 88000,
  A5: "E-104",
  B5: "Dee",
  C5: 54000,
  A6: "E-105",
  B6: "Eli",
  C6: 49500,
};

const GRADES = { A1: 0, B1: "F", A2: 60, B2: "D", A3: 70, B3: "C", A4: 80, B4: "B", A5: 90, B5: "A" };

/** The band table read sideways, so HLOOKUP has a row to walk; the label column stays out of the range. */
const MONTHS = {
  A1: "Month",
  B1: "Jan",
  C1: "Feb",
  D1: "Mar",
  A2: "Units",
  B2: 120,
  C2: 180,
  D2: 200,
  A3: "Price",
  B3: 4.5,
  C3: 5,
  D3: 5.25,
};

const BANDS = { A1: "Revenue", B1: 0, C1: 1000, D1: 5000, A2: "Rate", B2: 0.02, C2: 0.05, D2: 0.08 };

describe("address", () => {
  it("round-trips column labels", () => {
    for (const [index, label] of [[1, "A"], [26, "Z"], [27, "AA"], [52, "AZ"], [702, "ZZ"], [703, "AAA"]]) {
      assert.equal(indexToCol(index), label);
      assert.equal(colToIndex(label), index);
    }
  });

  it("parses absolute and relative references to one form", () => {
    assert.deepEqual(parseRef("$B$2"), parseRef("b2"));
    assert.equal(addressOf(2, 7), "B7");
    assert.ok(parseRef("Z1000000"));
    assert.equal(parseRef("1A"), null);
  });
});

describe("tokenize", () => {
  it("drops the leading = and ignores whitespace", () => {
    const tokens = tokenize("  =  SUM ( B2 : B4 ) ");
    assert.equal(tokens[0].type, "name");
    assert.equal(tokens[0].value, "SUM");
    assert.equal(tokens.at(-1).type, "eof");
  });

  it("keeps absolute-reference flags but normalises the key", () => {
    const [token] = tokenize("=$a$1");
    assert.equal(token.type, "ref");
    assert.equal(token.value.key, "A1");
    assert.equal(token.value.absCol, true);
    assert.equal(token.value.absRow, true);
  });

  it("reads numbers, text, booleans and operators", () => {
    const kinds = tokenize('=1.5+.5 "a,b" TRUE <> - 50%').map((t) => t.type);
    assert.deepEqual(kinds, ["num", "op", "num", "str", "bool", "op", "op", "num", "op", "eof"]);
  });

  it("supports doubled quotes inside text and single-quoted text", () => {
    assert.equal(tokenize('="a""b"')[0].value, 'a"b');
    assert.equal(tokenize("='abc'")[0].value, "abc");
  });

  it("treats a semicolon as a comma", () => {
    const tokens = tokenize("=SUM(1;2)");
    assert.equal(tokens[3].type, "punct");
    assert.equal(tokens[3].value, "comma");
  });

  it("reports the offset of an unreadable character", () => {
    try {
      tokenize("=1 + #");
      assert.fail("expected a throw");
    } catch (error) {
      assert.equal(error.code, CODES.PARSE);
      assert.equal(error.position, 5);
    }
  });

  it("reports an unterminated string", () => {
    throwsCode(() => tokenize('=IF(1,"x)'), CODES.PARSE);
  });
});

describe("parse", () => {
  it("returns a call node with one range argument", () => {
    const ast = parse("=SUM(B2:B4)");
    assert.equal(ast.type, "call");
    assert.equal(ast.name, "SUM");
    assert.equal(ast.args.length, 1);
    assert.equal(ast.args[0].type, "range");
    assert.equal(ast.args[0].name, "B2:B4");
  });

  it("nests IF branches without throwing", () => {
    const ast = parse('=IF(B2>=70,"Pass","Fail")');
    assert.equal(ast.args.length, 3);
    assert.equal(ast.args[1].type, "string");
    assert.equal(ast.args[0].op, ">=");
  });

  it("applies operator precedence", () => {
    assert.equal(run("=1+2*3"), 7);
    assert.equal(run("=(1+2)*3"), 9);
    assert.equal(run("=2+3&4"), "54");
    assert.equal(run('="a"&1+1'), "a2");
  });

  it("makes ^ right-associative", () => {
    assert.equal(run("=2^3^2"), 512);
  });

  it("handles unary minus and percent", () => {
    assert.equal(run("=-2^2"), 4);
    assert.equal(run("=50%"), 0.5);
    assert.equal(run("=200*10%"), 20);
  });

  it("lets a unary sign sit inside a call", () => {
    assert.equal(run("=SUM(-1,2)"), 1);
  });

  it("rejects trailing rubbish and unbalanced brackets", () => {
    throwsCode(() => parse("=1 2"), CODES.PARSE);
    throwsCode(() => parse("=(1+2"), CODES.PARSE);
    throwsCode(() => parse("=SUM(B2:B4"), CODES.PARSE);
    throwsCode(() => parse("=1:A2"), CODES.PARSE);
  });

  it("finds every call by name", () => {
    const ast = parse("=IF(SUM(B2:B4)>1,SUM(B2),0)");
    assert.equal(callsOf(ast, "sum").length, 2);
    assert.equal(callsOf(ast, "IF").length, 1);
  });
});

describe("values and coercion", () => {
  it("treats a blank cell as 0 in arithmetic and empty text in concatenation", () => {
    assert.equal(run("=Z9+1"), 1);
    assert.equal(run('="x"&Z9'), "x");
  });

  it("coerces numeric text but not words", () => {
    assert.equal(run('="5"*2'), 10);
    throwsCode(() => run('="five"*2'), CODES.VALUE);
  });

  it("compares text case-insensitively", () => {
    assert.equal(run('="Pass"="pass"'), true);
    assert.equal(run('="a"<"b"'), true);
  });
});

describe("aggregates", () => {
  it("sums a range, a list and absolute references identically", () => {
    assert.equal(run("=SUM(B2:B4)", SALES), 3580);
    assert.equal(run("=sum($b$2:$b$4)", SALES), 3580);
    assert.equal(run("=SUM(B2,B3,B4)", SALES), 3580);
  });

  it("ignores text inside a range but refuses a text literal", () => {
    assert.equal(run("=SUM(A1:B4)", SALES), 3580);
    throwsCode(() => run('=SUM("x",1)'), CODES.VALUE);
  });

  it("averages, counts and ranks", () => {
    assert.equal(run("=AVERAGE(2,4,6)"), 4);
    throwsCode(() => run("=AVERAGE(A1:A3)", SALES), CODES.DIV0);
    assert.equal(run("=COUNT(B2:B5)", SALES), 4);
    assert.equal(run("=COUNT(A1:A5)", SALES), 0);
    assert.equal(run("=COUNTA(A1:A5)", SALES), 5);
    assert.equal(run("=MIN(B2:B5)", SALES), 620);
    assert.equal(run("=MAX(B2:B5)", SALES), 1450);
  });

  it("supports SUMIF with and without a sum range", () => {
    assert.equal(run('=SUMIF(A2:A5,"North",B2:B5)', SALES), 2130);
    assert.equal(run('=SUMIF(B2:B5,">1000")', SALES), 2650);
    assert.equal(run('=SUMIF(A2:A5,"Nor*",B2:B5)', SALES), 2130);
    assert.equal(run('=SUMIF(A2:A5,"<>North",B2:B5)', SALES), 2070);
  });

  it("aligns a sum range that starts elsewhere", () => {
    assert.equal(run('=SUMIF(A2:A4,"North",C2:C4)', { ...SALES, C2: 10, C4: 20 }), 30);
  });

  it("counts with criteria", () => {
    assert.equal(run('=COUNTIF(A2:A5,"North")', SALES), 2);
    assert.equal(run('=COUNTIF(B2:B5,">=1000")', SALES), 2);
    assert.equal(run('=COUNTIF(A2:A5,"north")', SALES), 2);
  });
});

describe("logic", () => {
  it("returns the chosen IF branch only", () => {
    assert.equal(run('=IF(B2>=1000,"Pass","Fail")', SALES), "Pass");
    assert.equal(run('=IF(B2>=2000,"Pass","Fail")', SALES), "Fail");
  });

  it("never evaluates the untaken IF branch", () => {
    assert.equal(run("=IF(TRUE,1,1/0)"), 1);
    assert.equal(run("=IF(FALSE,1/0,2)"), 2);
  });

  it("swallows errors with IFERROR", () => {
    assert.equal(run("=IFERROR(1/0,7)"), 7);
    assert.equal(run("=IFERROR(5,7)"), 5);
    assert.equal(run('=IFERROR(VLOOKUP("zz",A2:C6,3,FALSE),"missing")', STAFF), "missing");
  });

  it("combines conditions", () => {
    assert.equal(run("=AND(TRUE,1)"), true);
    assert.equal(run("=OR(FALSE,0,1)"), true);
    assert.equal(run("=NOT(0)"), true);
  });
});

describe("lookup", () => {
  it("finds an exact VLOOKUP match", () => {
    assert.equal(run('=VLOOKUP("E-104",A2:C6,3,FALSE)', STAFF), 54000);
    assert.equal(run('=vlookup("e-104",$A$2:$C$6,3,0)', STAFF), 54000);
  });

  it("matches wildcards when the flag is FALSE", () => {
    assert.equal(run('=VLOOKUP("E-10*",A2:C6,2,FALSE)', STAFF), "Ana");
  });

  it("returns #N/A when an exact match is missing", () => {
    throwsCode(() => run('=VLOOKUP("E-999",A2:C6,3,FALSE)', STAFF), CODES.NA);
  });

  it("approximates by default and refuses anything below the first key", () => {
    assert.equal(run("=VLOOKUP(85,A1:B5,2)", GRADES), "B");
    assert.equal(run("=VLOOKUP(60,A1:B5,2)", GRADES), "D");
    throwsCode(() => run("=VLOOKUP(-1,A1:B5,2)", GRADES), CODES.NA);
  });

  it("refuses a column wider than the table", () => {
    throwsCode(() => run('=VLOOKUP("E-104",A2:C6,9,FALSE)', STAFF), CODES.REF);
    throwsCode(() => run('=VLOOKUP("E-104",A2:C6,0,FALSE)', STAFF), CODES.VALUE);
  });

  it("reads the row HLOOKUP's index names", () => {
    assert.equal(run('=HLOOKUP("Feb",B1:D3,3,FALSE)', MONTHS), 5);
    assert.equal(run('=HLOOKUP("f*",B1:D3,2,FALSE)', MONTHS), 180);
    assert.equal(run('=HLOOKUP("Mar",B1:D3,1,0)', MONTHS), "Mar");
    throwsCode(() => run('=HLOOKUP("Dec",B1:D3,3,FALSE)', MONTHS), CODES.NA);
  });

  it("approximates across the first row until a key overshoots", () => {
    assert.equal(run("=HLOOKUP(4200,B1:D2,2)", BANDS), 0.05);
    assert.equal(run("=HLOOKUP(1000,B1:D2,2,TRUE)", BANDS), 0.05);
    throwsCode(() => run("=HLOOKUP(-1,B1:D2,2)", BANDS), CODES.NA);
  });

  it("refuses a row taller than the table", () => {
    throwsCode(() => run('=HLOOKUP("Feb",B1:D3,4,FALSE)', MONTHS), CODES.REF);
    throwsCode(() => run('=HLOOKUP("Feb",B1:D3,0,FALSE)', MONTHS), CODES.VALUE);
  });

  it("looks up with XLOOKUP and honours if_not_found", () => {
    assert.equal(run('=XLOOKUP("E-103",A2:A6,C2:C6)', STAFF), 88000);
    assert.equal(run('=XLOOKUP("E-999",A2:A6,C2:C6,"none")', STAFF), "none");
    throwsCode(() => run('=XLOOKUP("E-999",A2:A6,C2:C6)', STAFF), CODES.NA);
  });

  it("indexes one and two dimensional ranges", () => {
    assert.equal(run("=INDEX(B2:B5,2)", SALES), 1450);
    assert.equal(run("=INDEX(A2:C6,3,3)", STAFF), 88000);
    throwsCode(() => run("=INDEX(B2:B5,9)", SALES), CODES.REF);
  });

  it("matches exactly and approximately", () => {
    assert.equal(run('=MATCH("E-103",A2:A6,0)', STAFF), 3);
    assert.equal(run('=MATCH("cy",B2:B6,0)', STAFF), 3);
    assert.equal(run("=MATCH(85,A1:A5,1)", GRADES), 4);
    throwsCode(() => run("=MATCH(-1,A1:A5,1)", GRADES), CODES.NA);
    throwsCode(() => run('=MATCH("nope",A2:A6,0)', STAFF), CODES.NA);
  });

  it("combines INDEX and MATCH", () => {
    assert.equal(run('=INDEX(C2:C6,MATCH("E-103",A2:A6,0))', STAFF), 88000);
  });
});

describe("text", () => {
  it("measures and slices", () => {
    assert.equal(run('=LEN("abcd")'), 4);
    assert.equal(run('=LEFT("ORD-4471",3)'), "ORD");
    assert.equal(run('=RIGHT("ORD-4471",4)'), "4471");
    assert.equal(run('=MID("ORD-4471",5,2)'), "44");
  });

  it("makes FIND case-sensitive and SEARCH not", () => {
    assert.equal(run('=FIND("-","ORD-4471")'), 4);
    assert.equal(run('=SEARCH("ord","ORD-4471")'), 1);
    throwsCode(() => run('=FIND("ord","ORD-4471")'), CODES.VALUE);
  });

  it("takes a prefix up to the first hyphen", () => {
    assert.equal(run('=LEFT("ORD-4471",FIND("-","ORD-4471")-1)'), "ORD");
  });

  it("changes case and trims", () => {
    assert.equal(run('=UPPER("ab")'), "AB");
    assert.equal(run('=LOWER("AB")'), "ab");
    assert.equal(run('=PROPER("hello world")'), "Hello World");
    assert.equal(run('=TRIM("  a   b  ")'), "a b");
  });

  it("joins text", () => {
    assert.equal(run('=CONCAT("a",1)'), "a1");
    assert.equal(run('=CONCATENATE("a","b")'), "ab");
    assert.equal(run('=TEXTJOIN("-",TRUE,"a","","b")'), "a-b");
    assert.equal(run('=TEXTJOIN("-",FALSE,"a","","b")'), "a--b");
  });
});

describe("math", () => {
  it("rounds half away from zero at the requested precision", () => {
    assert.equal(run("=ROUND(4120.74*1.08,2)"), 4450.4);
    assert.equal(run("=ROUND(2.5,0)"), 3);
    assert.equal(run("=ROUND(-2.5,0)"), -3);
    assert.equal(run("=ROUND(2.675,2)"), 2.68);
  });

  it("rounds up and down away from zero", () => {
    assert.equal(run("=ROUNDUP(2.1,0)"), 3);
    assert.equal(run("=ROUNDDOWN(2.9,0)"), 2);
    assert.equal(run("=ROUNDUP(-2.1,0)"), -3);
  });

  it("takes absolute values", () => {
    assert.equal(run("=ABS(-4)"), 4);
  });
});

describe("errors", () => {
  it("surfaces #DIV/0! instead of Infinity", () => {
    throwsCode(() => run("=1/0"), CODES.DIV0);
    throwsCode(() => run("=1/Z9"), CODES.DIV0);
  });

  it("names an unsupported function", () => {
    try {
      run("=SUMPRODUCT(A1:A2)");
      assert.fail("expected a throw");
    } catch (error) {
      assert.equal(error.code, CODES.NAME);
      assert.match(error.message, /SUMPRODUCT/);
    }
  });

  it("carries a position for syntax errors", () => {
    try {
      parse("=1 +");
      assert.fail("expected a throw");
    } catch (error) {
      assert.equal(error.code, CODES.PARSE);
      assert.equal(typeof error.position, "number");
    }
  });
});

describe("buildCells and grade", () => {
  const lesson = {
    id: "07-vlookup-exact",
    grid: {
      startCell: "A1",
      rows: [
        ["ID", "Name", "Salary"],
        ["E-101", "Ana", 61500],
        ["E-102", "Bo", 57000],
        ["E-103", "Cy", 88000],
        ["E-104", "Dee", 54000],
        ["E-105", "Eli", 49500],
      ],
    },
    answerCell: "E2",
    expect: { value: 54000 },
    require: [{ id: "func-vlookup", func: "VLOOKUP" }],
    forbid: [],
    requireRef: "A2",
    rules: [{ id: "exact-match", type: "matchType", func: "VLOOKUP", arg: 4, values: [false, 0] }],
    hints: {
      "func-vlookup": "Look the value up instead of typing it.",
      "exact-match": "Add FALSE (or 0) as the 4th argument.",
      value: "Check which column you returned.",
    },
  };

  it("expands a grid from its start cell, with blanks as null", () => {
    const cells = buildCells(lesson);
    assert.equal(cells.A1, "ID");
    assert.equal(cells.C6, 49500);
    assert.equal(Object.keys(cells).length, 18);
    assert.equal(buildCells({ grid: { startCell: "B2", rows: [[1, null]] } }).C2, null);
  });

  it("accepts the reference answer and reasonable variants", async () => {
    const { grade } = await import("../packages/grader/index.js");
    for (const formula of [
      '=VLOOKUP("E-104",A2:C6,3,FALSE)',
      '=vlookup("e-104",$A$2:$C$6,3,0)',
      '=VLOOKUP("E-104",A2:C6,3,FALSE)+0',
    ]) {
      const result = grade(lesson, formula);
      assert.equal(result.ok, true, `${formula} should pass, got ${result.rule}`);
      assert.equal(result.value, 54000);
      assert.equal(result.expected, 54000);
    }
  });

  it("reports the missing 4th argument as exact-match, not as a value error", async () => {
    const { grade } = await import("../packages/grader/index.js");
    const result = grade(lesson, '=VLOOKUP("E-104",A2:C6,3)');
    assert.equal(result.ok, false);
    assert.equal(result.rule, "exact-match");
    assert.match(result.message, /4th argument/);
    assert.equal(result.hint, "Add FALSE (or 0) as the 4th argument.");
  });

  it("rejects TRUE as the 4th argument", async () => {
    const { grade } = await import("../packages/grader/index.js");
    assert.equal(grade(lesson, '=VLOOKUP("E-104",A2:C6,3,TRUE)').rule, "exact-match");
  });

  it("rejects a hardcoded number at the require rule, before requireRef is consulted", async () => {
    const { grade } = await import("../packages/grader/index.js");
    const hardcoded = grade(lesson, "=54000");
    assert.equal(hardcoded.ok, false);
    assert.equal(hardcoded.rule, "func-vlookup");
  });

  it("rejects a formula that never touches the data", async () => {
    const { grade } = await import("../packages/grader/index.js");
    const exercise = { ...lesson, require: [], rules: [] };
    assert.equal(grade(exercise, "=54000").rule, "require-ref");
  });

  it("rejects a forbidden function", async () => {
    const { grade } = await import("../packages/grader/index.js");
    const exercise = {
      ...lesson,
      require: [],
      rules: [],
      forbid: [{ id: "no-vlookup", func: "VLOOKUP" }],
    };
    const result = grade(exercise, '=VLOOKUP("E-104",A2:C6,3,FALSE)');
    assert.equal(result.rule, "no-vlookup");
  });

  it("reports a wrong value with both numbers in the message", async () => {
    const { grade } = await import("../packages/grader/index.js");
    const result = grade(lesson, '=VLOOKUP("E-104",A2:C6,2,FALSE)');
    assert.equal(result.rule, "value");
    assert.equal(result.value, "Dee");
    assert.equal(result.expected, 54000);
    assert.match(result.message, /54000/);
  });

  it("reports a syntax error with a position instead of throwing", async () => {
    const { grade } = await import("../packages/grader/index.js");
    const result = grade(lesson, "=VLOOKUP(");
    assert.equal(result.ok, false);
    assert.equal(result.rule, "syntax");
    assert.equal(result.code, CODES.PARSE);
    assert.ok(result.position !== null);
  });

  it("reports an execution error as #DIV/0!", async () => {
    const { grade } = await import("../packages/grader/index.js");
    const bare = { grid: lesson.grid, expect: { value: 1 } };
    const result = grade(bare, "=1/0");
    assert.equal(result.rule, "error");
    assert.equal(result.code, CODES.DIV0);
  });

  it("keeps a stable outcome shape", async () => {
    const { grade } = await import("../packages/grader/index.js");
    assert.deepEqual(Object.keys(grade(lesson, "=1")).sort(), [
      "code",
      "expected",
      "hint",
      "message",
      "ok",
      "position",
      "rule",
      "value",
    ]);
  });

  it("accepts 4450.4 without demanding bit-exact float equality", async () => {
    const { grade } = await import("../packages/grader/index.js");
    const exercise = {
      grid: { startCell: "A1", rows: [[4120.74]] },
      expect: { value: 4450.4 },
      require: [],
      forbid: [],
    };
    assert.equal(grade(exercise, "=ROUND(A1*1.08,2)").ok, true);
    assert.equal(grade(exercise, "=A1*1.08").ok, false);
  });
});

describe("module hygiene", () => {
  it("imports without adding anything to globalThis", async () => {
    const before = new Set(Object.keys(globalThis));
    await import("../packages/grader/index.js?hygiene-check");
    const added = Object.keys(globalThis).filter((key) => !before.has(key));
    assert.deepEqual(added, []);
  });

  it("builds a summary from calls, keeping refs out of the call list", async () => {
    const { describeFormula } = await import("../packages/grader/grade.js");
    const summary = describeFormula('=IF(SUM(B2:B4)>100,"ok","no")');
    assert.deepEqual(summary.calls, [
      { name: "IF", args: 3 },
      { name: "SUM", args: 1 },
    ]);
    assert.deepEqual(summary.refs, []);
  });
});

describe("review regressions", () => {
  const SALES_CELLS = { B2: 54000, B3: 61000, B4: 48000 };
  const SINGLE = {
    cells: SALES_CELLS,
    expect: { value: 54000 },
    require: [],
    forbid: [],
    rules: [],
  };

  it("reports a range-valued answer as a value outcome instead of throwing", async () => {
    const { grade } = await import("../packages/grader/index.js");
    const result = grade(SINGLE, "=B2:B4");
    assert.equal(result.ok, false);
    assert.equal(result.rule, "value");
    assert.match(result.message, /B2:B4/);
    assert.equal(result.expected, 54000);
  });

  it("ignores logical values inside a range but counts boolean arguments", async () => {
    const cells = { A1: true, A2: 2, A3: false };
    assert.equal(run("=SUM(A1:A3)", cells), 2);
    assert.equal(run("=AVERAGE(A1:A3)", cells), 2);
    assert.equal(run("=SUM(TRUE,2,FALSE)"), 3);
    assert.equal(run("=MAX(A1:A3)", cells), 2);
  });

  it("resizes a short sum_range to the shape of the criteria range", async () => {
    const cells = { A2: "North", A3: "South", A4: "North", B2: 10, B3: 20, B4: 30 };
    assert.equal(run('=SUMIF(A2:A4,"North",B2)', cells), 40);
    assert.equal(run('=SUMIF(A2:A4,"North",B2:B2)', cells), 40);
    assert.equal(run('=SUMIF(A2:A4,"North",B2:B4)', cells), 40);
  });

  it("resizes a short sum_range in both directions", async () => {
    const cells = {
      A1: "North", B1: "North",
      A2: "South", B2: "North",
      C1: 1, D1: 2,
      C2: 4, D2: 8,
    };
    assert.equal(run('=SUMIF(A1:B2,"North",C1)', cells), 1 + 2 + 8);
  });

  it("treats an empty cell in the argument slot as missing, not as FALSE", async () => {
    const { grade } = await import("../packages/grader/index.js");
    const lesson = {
      cells: { A2: "E-104", B2: "Dee", C2: 54000 },
      expect: { value: 54000 },
      require: [{ id: "func-vlookup", func: "VLOOKUP" }],
      rules: [
        { id: "exact-match", type: "matchType", func: "VLOOKUP", arg: 4, values: [false, 0] },
      ],
    };
    const result = grade(lesson, '=VLOOKUP("E-104",A2:C2,3,Z9)');
    assert.equal(result.ok, false);
    assert.equal(result.rule, "exact-match");
    assert.match(result.message, /empty cell/);
  });

  it("checks every call a lesson's arity rule covers, not just the first", async () => {
    const { grade } = await import("../packages/grader/index.js");
    const lesson = {
      cells: { A2: "E-104", B2: "Dee", C2: 54000 },
      expect: { value: 54000 },
      require: [{ id: "func-vlookup", func: "VLOOKUP", minArgs: 4 }],
      rules: [],
    };
    const formula =
      '=IF(VLOOKUP("E-104",A2:C2,3)=54000,VLOOKUP("E-104",A2:C2,3,FALSE),0)';
    const result = grade(lesson, formula);
    assert.equal(result.ok, false);
    assert.equal(result.rule, "func-vlookup");
    assert.match(result.message, /at least 4/);
  });

  it("never answers a too-few-arguments fault with the absent-function message", async () => {
    const { grade } = await import("../packages/grader/index.js");
    // Lesson 6's shape: a per-rule `message` that talks about a *missing* function, so it
    // would be a lie here — SUM is right there, with no range inside it.
    const lesson = {
      cells: { B2: 1, C2: 2, D2: 3 },
      expect: { value: 3 },
      require: [
        { id: "func-sum", func: "SUM", minArgs: 1, message: "wrap the range in SUM." },
      ],
      rules: [],
    };
    const result = grade(lesson, "=SUM()");
    assert.equal(result.ok, false);
    assert.equal(result.rule, "func-sum");
    assert.doesNotMatch(result.message, /wrap the range in SUM/);
    assert.match(result.message, /at least 1 argument here/);
  });

  it("speaks in the singular for a one-argument minimum", async () => {
    const { grade } = await import("../packages/grader/index.js");
    const lesson = {
      cells: { B2: 1 },
      expect: { value: 1 },
      require: [{ id: "func-abs", func: "ABS", minArgs: 1 }],
      rules: [],
    };
    const result = grade(lesson, "=ABS()");
    assert.equal(result.ok, false);
    assert.match(result.message, /at least 1 argument here/);
    assert.doesNotMatch(result.message, /arguments/);
  });

  it("uses a per-rule minArgs message when a lesson supplies one", async () => {
    const { grade } = await import("../packages/grader/index.js");
    const lesson = {
      cells: { B2: 1 },
      expect: { value: 1 },
      require: [
        { id: "func-abs", func: "ABS", minArgs: 2, minArgsMessage: "ABS takes a number and a fallback here." },
      ],
      rules: [],
    };
    const result = grade(lesson, "=ABS(1)");
    assert.equal(result.ok, false);
    assert.equal(result.message, "ABS takes a number and a fallback here.");
  });

  it("capitalises a word after an apostrophe", async () => {
    assert.equal(run("=PROPER(\"o'brien\")"), "O'Brien");
    assert.equal(run('=PROPER("hELLO wORLD")'), "Hello World");
  });

  it("collapses spaces without eating tabs, as Excel's TRIM does", async () => {
    assert.equal(run('=TRIM("a\t\tb  c ")'), "a\t\tb c");
  });

  it("refuses an unbounded range with #NUM! instead of hanging", async () => {
    const { grade } = await import("../packages/grader/index.js");
    const started = Date.now();
    const result = grade(SINGLE, "=SUM(A1:ZZ10000)");
    assert.equal(result.ok, false);
    assert.equal(result.rule, "error");
    assert.equal(result.code, CODES.NUM);
    assert.ok(Date.now() - started < 1000, "the range cap must be enforced before expansion");
  });

  it("caps expandRange at 100,000 cells", async () => {
    const { expandRange } = await import("../packages/grader/address.js");
    assert.equal(expandRange("A1", "A100000", () => null).height, 100000);
    throwsCode(() => expandRange("A1", "A100001", () => null), CODES.NUM);
  });

  it("turns runaway nesting into a syntax outcome instead of a stack overflow", async () => {
    const { grade } = await import("../packages/grader/index.js");
    const deep = `=${"(".repeat(400)}1${")".repeat(400)}`;
    const result = grade(SINGLE, deep);
    assert.equal(result.ok, false);
    assert.equal(result.rule, "syntax");
    assert.match(result.message, /nested/);
  });

  it("does not treat a cell beyond the sheet as a reference", () => {
    assert.equal(parseRef("A1048576").key, "A1048576");
    assert.equal(parseRef("A1048577"), null);
    assert.equal(parseRef("ZZZ1"), null);
    assert.equal(parseRef("XFD1").key, "XFD1");
  });
});

describe("review round 2 regressions", () => {
  const LOOKUP = {
    id: "07-vlookup-exact",
    grid: {
      startCell: "A1",
      rows: [
        ["ID", "Name", "Salary"],
        ["E-101", "Ana", 61500],
        ["E-102", "Bo", 57000],
        ["E-103", "Cy", 88000],
      ],
    },
    answerCell: "E2",
    expect: { value: 88000 },
    require: [],
    forbid: [],
    rules: [{ id: "exact-match", type: "matchType", func: "VLOOKUP", arg: 4, values: [false, 0] }],
    hints: {},
  };

  const PLAIN = { ...LOOKUP, rules: [] };

  const BLANK = {
    ...PLAIN,
    grid: { startCell: "A1", rows: [[null, null], [null, null]] },
  };

  it("reports a range passed as a rule argument instead of throwing", () => {
    const result = grade(LOOKUP, '=VLOOKUP("E-104",A2:C4,3,A2:A3)');
    assert.equal(result.ok, false);
    assert.equal(result.rule, "exact-match");
    assert.match(result.message, /A2:A3/);
    assert.equal(result.code, null);
  });

  it("never throws on a corpus of ordinary and hostile formulas", () => {
    for (const formula of HOSTILE) {
      const result = grade(LOOKUP, formula);
      assert.deepEqual(Object.keys(result).sort(), OUTCOME_KEYS, `shape for ${JSON.stringify(formula)}`);
      assert.equal(typeof result.ok, "boolean", `ok flag for ${JSON.stringify(formula)}`);
      assert.equal(typeof result.message, "string", `message for ${JSON.stringify(formula)}`);
      if (!result.ok) assert.ok(result.hint !== undefined, `hint for ${JSON.stringify(formula)}`);
    }
  });

  it("gives MIN and MAX of a numbers-free block 0, as Excel does", () => {
    assert.equal(grade(BLANK, "=MIN(A1:B2)").value, 0);
    assert.equal(grade(BLANK, "=MAX(A1:B2)").value, 0);
    const average = grade(BLANK, "=AVERAGE(A1:B2)");
    assert.equal(average.rule, "error");
    assert.equal(average.code, CODES.DIV0);
  });

  it("keeps MIN and MAX working beyond the spread-argument limit", () => {
    const wide = {
      ...BLANK,
      grid: { startCell: "A1", rows: [Array.from({ length: 300 }, (_, i) => i + 1)] },
    };
    assert.equal(grade(wide, "=MAX(A1:KN1)").value, 300);
    assert.equal(grade(wide, "=MIN(A1:KN1)").value, 1);
  });

  it("accepts a lone cell reference where SUMIF and COUNTIF want a range", () => {
    assert.equal(grade(PLAIN, '=COUNTIF(A2,"E-101")').value, 1);
    assert.equal(grade(PLAIN, '=SUMIF(A3,"E-102",C3)').value, 57000);
    assert.equal(grade(PLAIN, '=COUNTIF(A1:A4,"E-*")').value, 3);
    assert.equal(grade(PLAIN, '=COUNTIF(A1:A4,"E-102",1)').rule, "error");
  });

  it("still matches XLOOKUP wildcards after the duplicate branch was removed", () => {
    assert.equal(grade(PLAIN, '=XLOOKUP("E-10*",A2:A4,C2:C4,,2)').value, 61500);
    assert.equal(grade(PLAIN, '=XLOOKUP("E-103",A2:A4,C2:C4)').value, 88000);
    assert.equal(grade(PLAIN, '=XLOOKUP("E-103",A2:A4,C2:C4,,-1)').value, 88000);
    assert.equal(grade(PLAIN, '=XLOOKUP("zz",A2:A4,C2:C4)').rule, "error");
  });

  it("expands a range without duplicating the address grid", () => {
    const range = expandRange("A1", "B2", () => 0);
    assert.deepEqual(range.addresses, [["A1", "B1"], ["A2", "B2"]]);
    assert.equal(range.keys, undefined);
    assert.equal(range.width, 2);
    assert.equal(range.height, 2);
  });
});

describe("text results keep the case the formula writes", () => {
  const PASS = {
    id: "04-if-pass-fail",
    grid: { startCell: "A1", rows: [["Student", "Score", "Result"], ["Ana", 70, null]] },
    answerCell: "C2",
    expect: { value: "Pass" },
    require: [{ id: "func-if", func: "IF", minArgs: 3 }],
    forbid: [],
    rules: [],
    requireRef: "B2",
    hints: {},
  };

  it("accepts the exact text the lesson asks for", () => {
    assert.equal(grade(PASS, '=IF(B2>=70,"Pass","Fail")').ok, true);
  });

  it("rejects the same text in a different case", () => {
    // Excel's `=` ignores case, but the cell would display "pass", not "Pass".
    for (const formula of ['=IF(B2>=70,"pass","fail")', '=IF(B2>=70,"PASS","FAIL")']) {
      const result = grade(PASS, formula);
      assert.equal(result.ok, false, `${formula} was accepted`);
      assert.equal(result.rule, "value");
    }
  });

  it("keeps comparison operators and criteria case-insensitive", () => {
    // Criteria semantics are Excel's `=` semantics and must stay loose.
    assert.equal(run('=IF("Pass"="pass",1,0)'), 1);
    assert.equal(run('=COUNTIF(A1:A2,"a")', { A1: "A", A2: "a" }), 2);
  });

  it("rejects a number expected where the formula writes text", () => {
    const result = grade({ ...PASS, expect: { value: 70 } }, '=IF(B2>=70,"70","Fail")');
    assert.equal(result.ok, false);
    assert.equal(result.rule, "value");
  });
});

describe("typed answers", () => {
  const picture = { type: "picture", answers: ["B2:B6", "column B rows 2 to 6"], hints: { value: "The price column." } };

  it("folds the spellings a learner can reasonably type", () => {
    for (const typed of ["B2:B6", "b2:b6", " $B$2:$B$6 ", "COLUMN b ROWS 2 TO 6", "B2:B6\u200b"]) {
      assert.equal(gradeAnswer(picture, typed).ok, true, typed);
    }
    assert.equal(normaliseAnswer("  A  B \n"), "a b");
  });

  it("rejects a near miss without printing the answer it wanted", () => {
    const result = gradeAnswer(picture, "C2:C6");
    assert.equal(result.ok, false);
    assert.equal(result.rule, "value");
    assert.equal(result.expected, null);
    assert.equal(result.message, "That is not what the image shows.");
    assert.equal(result.hint, "The price column.");
  });

  it("rejects an empty answer and a screen with no answers at all", () => {
    assert.equal(gradeAnswer(picture, "   ").ok, false);
    assert.equal(gradeAnswer({ type: "picture" }, "B2:B6").ok, false);
  });
});
