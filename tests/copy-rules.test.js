/**
 * Item P1 — the copy gate.
 *
 * The rules are asserted as behaviour, not as a list: a banned phrase has to fire on a sentence a
 * generator would write and stay quiet on a sentence a person would write, and the report has to name
 * the file and field so the fix is a two-second lookup. `lintCopy` is run against the real content
 * because a rule that only passes on fixtures is a rule that has never met a lesson.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, it } from "node:test";

import {
  checkText,
  countSyllables,
  findBanned,
  findTypography,
  lessonFields,
  lintCopy,
  loadRules,
  readingEase,
  shingles,
  splitSentences,
} from "../packages/content-lint/copy.js";

const ROOT = join(import.meta.dirname, "..");
const CONTENT = join(ROOT, "legacy", "content");

const rules = loadRules();

describe("the rule file", () => {
  it("ships enough phrases to catch a generated paragraph", () => {
    assert.ok(rules.bannedPhrases.length >= 100, `only ${rules.bannedPhrases.length} phrases`);
    assert.deepEqual(new Set(rules.bannedPhrases.map((entry) => entry.phrase)).size, rules.bannedPhrases.length);
  });

  it("explains every phrase, because a rule without a reason gets deleted", () => {
    for (const entry of [...rules.bannedPhrases, ...rules.bannedOpeners]) {
      assert.ok(entry.why && entry.why.length > 5, `"${entry.phrase}" has no reason`);
    }
  });

  it("keeps the thresholds a rewritten lesson can meet", () => {
    assert.ok(rules.sentence.maxWords <= 32, "a 40-word cap is not a cap");
    assert.ok(rules.flesch.min > 40 && rules.flesch.max < 95);
    assert.ok(rules.shingle.size >= 4 && rules.shingle.maxOverlap <= 0.5);
  });
});

describe("banned phrases", () => {
  it("fires on a generated sentence", () => {
    const hits = findBanned("Delve into the world of spreadsheets and unlock the power of SUM.", rules);
    assert.deepEqual(hits.map((hit) => hit.phrase), ["delve into", "the world of", "unlock the power", "the power of"]);
  });

  it("matches regardless of case and reports where", () => {
    const hits = findBanned("We can LEVERAGE the totals.", rules);
    assert.equal(hits.length, 1);
    assert.equal(hits[0].at, 7);
    assert.equal(hits[0].match, "LEVERAGE");
  });

  it("stays quiet on plain instructional copy", () => {
    assert.deepEqual(findBanned("Type =SUM(B2:B4) in B5 and press Enter. The total appears.", rules), []);
  });

  it("catches a filler opener only at the start", () => {
    assert.equal(findBanned("So, the answer is 3580.", rules).length, 1);
    assert.equal(findBanned("The answer is 3580. So, the total is right.", rules).length, 0);
  });
});

describe("typography", () => {
  it("catches every character a generator prefers", () => {
    const hits = findTypography("The total \u2014 3580 \u2013 is right \u201cfinally\u201d\u2026 \u{1F600}");
    assert.deepEqual(hits.map((hit) => hit.name).sort(), [
      "curly double quote",
      "curly double quote",
      "ellipsis character",
      "em dash",
      "emoji",
      "en dash",
    ]);
  });

  it("leaves a plain sentence alone", () => {
    assert.deepEqual(findTypography("The total, 3580, is right: 'finally'."), []);
  });
});

describe("readability", () => {
  it("counts the syllables of the words it is given", () => {
    assert.deepEqual(
      ["sum", "total", "revenue", "spreadsheet", "the"].map(countSyllables),
      [1, 2, 3, 2, 1],
    );
  });

  it("scores a plain sentence above an academic one", () => {
    const plain = readingEase("SUM adds three cells. The total is 3580. Nothing else is needed.");
    const dense = readingEase(
      "Notwithstanding the fundamental considerations, the functionality facilitates the aggregation of numerical values enumerated within the specified contiguous range.",
    );
    assert.ok(plain.ease > 70, `plain scored ${plain.ease}`);
    assert.ok(dense.ease < 20, `dense scored ${dense.ease}`);
  });

  it("does not treat a formula or a decimal as a sentence break", () => {
    assert.deepEqual(splitSentences("Type =SUM(B2:B4). The rate is 1.15 and it holds."), [
      "Type =SUM(B2:B4).",
      "The rate is 1.15 and it holds.",
    ]);
  });
});

describe("checkText", () => {
  const where = "content/exercises/99-example.json";

  it("passes a clean lesson paragraph", () => {
    const { findings } = checkText(
      "SUM adds every number in the range. In this drill the Q1 column holds 1200, 1450 and 930. The total is 3580.",
      { field: "docs.explain", where, prose: true, rules },
    );
    assert.deepEqual(findings, []);
  });

  it("counts a long sentence once, and names the field", () => {
    const sentence = `${"word ".repeat(34)}end.`;
    const { findings } = checkText(sentence, { field: "docs.explain", where, prose: true, rules });
    const long = findings.filter((finding) => finding.rule === "long-sentence");
    assert.equal(long.length, 1);
    assert.equal(long[0].field, "docs.explain");
    assert.equal(long[0].where, where);
  });

  it("only applies length rules to prose, not to a prompt or a formula hint", () => {
    const sentence = `${"word ".repeat(34)}end.`;
    assert.deepEqual(checkText(sentence, { field: "screens[0].prompt", where, prose: false, rules }).findings, []);
    assert.equal(checkText(sentence, { field: "docs.explain", where, prose: true, rules }).findings.length, 1);
  });
});

describe("shingles", () => {
  it("finds a run of five words wherever it sits", () => {
    const set = shingles("SUM adds every number in the range", 5);
    assert.ok(set.has("sum adds every number in"));
  });

  it("is a set, so repetition inside one lesson does not inflate the overlap", () => {
    const set = shingles("the total is the total is the total", 3);
    assert.ok(set.size < 5);
  });
});

describe("lessonFields", () => {
  it("lists title, prose, prompts, hints and seo in page order", () => {
    const fields = lessonFields({
      title: "SUM: total a column",
      docs: { explain: "e", atWork: "a", outcome: "o", errors: [{ code: "#VALUE!", text: "t" }] },
      screens: [{ prompt: "p", hints: { syntax: "s" } }],
      seo: { title: "SUM in Excel", description: "d" },
    });
    assert.deepEqual(fields.map((field) => field.field), [
      "title",
      "docs.explain",
      "docs.atWork",
      "docs.outcome",
      "docs.errors[0].text",
      "screens[0].prompt",
      "screens[0].hints.syntax",
      "seo.title",
      "seo.description",
    ]);
  });
});

describe("the real catalog", () => {
  const report = lintCopy(CONTENT);

  it("reports every lesson", () => {
    assert.equal(report.stats.lessons, 88);
    assert.equal(report.stats.groups, 16);
    assert.equal(report.lessons.length, 88);
  });

  it("gives every finding a rule, a file and a message", () => {
    for (const finding of report.findings) {
      assert.ok(finding.rule, JSON.stringify(finding));
      assert.ok(finding.where, JSON.stringify(finding));
      assert.ok(finding.message && finding.message.length > 10, JSON.stringify(finding));
      assert.ok(["error", "warn"].includes(finding.severity), JSON.stringify(finding));
    }
  });

  it("counts its findings by rule", () => {
    const total = Object.values(report.stats.byRule).reduce((sum, count) => sum + count, 0);
    assert.equal(total, report.findings.length);
  });
});

describe("the command line", () => {
  const run = (args) => {
    try {
      const stdout = execFileSync(process.execPath, ["packages/content-lint/cli.js", ...args], {
        cwd: ROOT,
        encoding: "utf8",
      });
      return { status: 0, stdout };
    } catch (error) {
      return { status: error.status, stdout: `${error.stdout}${error.stderr}` };
    }
  };

  it("prints the copy report", () => {
    const { status, stdout } = run(["copy"]);
    assert.ok(status === 0 || status === 1, `exited ${status}`);
    assert.match(stdout, /^copy: 88 lessons, 16 groups/m);
  });

  it("accepts --strict on check, so the gate can demand clean prose", () => {
    const { stdout } = run(["check", "--strict"]);
    assert.match(stdout, /^content: 88 of 88/m);
    assert.match(stdout, /^copy: 88 lessons/m);
  });
});

describe("the words that sell something we do not sell", () => {
  // The launch ships individual accounts, three free drills and one price. An institutional seat, a
  // university licence, a cohort and a referral are not for sale, so no shipped string may imply one:
  // a comment is where the vocabulary comes back first, and then it turns into a sentence on a page.
  const WORDS = /\b(institution|institutional|university|universities|cohort|cohorts|referral|referrals|referring|classroom|school|campus)\b/i;
  const ALLOWED = /#organization|"@type": "Organization"|organizationName/;

  const sources = (dir) =>
    readdirSync(join(ROOT, dir), { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile() && /\.(js|mjs)$/.test(entry.name))
      .map((entry) => join(entry.parentPath, entry.name));

  const shipped = [
    ...sources("app"),
    ...sources("lib"),
    ...sources("legacy/src"),
    // The legal lint is the one place the words must stay: it is the rule that refuses them.
    ...sources("packages").filter((file) => !file.includes(`${join("packages", "content-lint")}${sep}`)),
  ];

  it("scans the code that is actually served", () => {
    assert.ok(shipped.length > 40, `only ${shipped.length} files scanned`);
  });

  it("finds none of them in the shipped source", () => {
    const found = [];
    for (const file of shipped) {
      readFileSync(file, "utf8").split("\n").forEach((line, index) => {
        if (ALLOWED.test(line)) return;
        const match = line.match(WORDS);
        if (match) found.push(`${relative(ROOT, file)}:${index + 1} — "${match[0]}"`);
      });
    }
    assert.deepEqual(found, [], `the copy claims a product we do not sell:\n${found.join("\n")}`);
  });

  it("still refuses the words when the legal pages are edited", () => {
    const banned = readFileSync(join(ROOT, "packages", "content-lint", "legal.js"), "utf8");
    for (const name of ["institutional seats", "universities", "cohorts", "referrals", "classrooms"]) {
      assert.ok(banned.includes(`name: "${name}"`), `the legal lint no longer refuses "${name}"`);
    }
  });
});
