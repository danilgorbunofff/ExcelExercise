/**
 * The gate over the site's own copy.
 *
 * `copy.js` measures the authored content; this measures everything else a visitor reads, which lives
 * in templates, React routes and browser modules. A measurement gate is only worth having if two
 * things hold: it reads the prose that ships, and it does not cry wolf. Both are asserted here.
 *
 * The filter has the last word, so it is tested from both directions. Removing `function`, `position`
 * and `>` from its code heuristics was not a nicety: those are the words this site is made of, and a
 * paragraph about choosing a function was being dropped from the report. Code fragments that used to
 * leak into it, like `length > 0 && blocked < n` read as text between brackets, are asserted gone.
 */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { loadRules } from "../packages/content-lint/copy.js";
import {
  ROOT,
  SOURCE_MODULES,
  decodeEntities,
  extractSiteCopy,
  htmlBlocks,
  htmlLabels,
  inventoryJson,
  lintMeta,
  lintSite,
  lintSurfaces,
  looksLikeCopy,
  renderedPages,
  sourceStrings,
  stripComments,
} from "../packages/content-lint/site.js";

const INVENTORY = join(ROOT, "tests", "golden", "site-copy.json");

describe("what counts as copy", () => {
  it("keeps a sentence a person would write, even when it talks like a spreadsheet", () => {
    // Every one of these was dropped by the first draft of the filter, which is why they are pinned.
    for (const sentence of [
      "A comparison such as B2>100 already returns TRUE or FALSE, so IF is often a wrapper you can drop.",
      "#N/A means nothing matched, #VALUE! means a type is wrong, and #REF! means the reference moved.",
      "MATCH returns the position of a value in a range, and INDEX returns the value at a row and column.",
      "A mean sent to a meeting that needed a median tells the room the wrong thing.",
      "Choose the function before you choose the range, because the summary decides what the column means.",
    ]) {
      assert.equal(looksLikeCopy(sentence), true, sentence);
    }
  });

  it("drops code, selectors and column lists", () => {
    for (const fragment of [
      "input, textarea, select, [contenteditable=true]",
      "username, display_name, linkedin_url, role, created_at",
      "display: flex; align-items: center",
      "12px",
      "document.querySelector(\"[data-drill]\")",
      "=> value.length",
      "https://example.com/pricing",
      "aria-label=\"Next lesson\"",
    ]) {
      assert.equal(looksLikeCopy(fragment), false, fragment);
    }
  });

  it("leaves out the strings too short to judge", () => {
    assert.equal(looksLikeCopy("Paid"), false);
    assert.equal(looksLikeCopy("  "), false);
    assert.equal(looksLikeCopy(null), false);
  });
});

describe("reading a module's strings", () => {
  it("blanks comments and keeps the quotes that are not comments", () => {
    const source = [
      "// the learner's 'screen view' sits after the gate",
      "/* a block: don't measure me */",
      'const label = "Solved on the first attempt.";',
    ].join("\n");
    const stripped = stripComments(source);
    assert.ok(!stripped.includes("screen view"), "a line comment survived");
    assert.ok(!stripped.includes("measure me"), "a block comment survived");
    assert.ok(stripped.includes("Solved on the first attempt."), "a real string was removed");
    assert.equal(stripped.split("\n").length, source.split("\n").length, "line structure changed");
  });

  it("replaces a template hole with a word so the sentence is still a sentence", () => {
    const strings = sourceStrings('const a = `Solved after ${missed} wrong attempts.`;');
    assert.deepEqual(strings, ["Solved after N wrong attempts."]);
  });

  it("does not read arithmetic as JSX text", () => {
    const strings = sourceStrings("const keysLive = readable && chords.length > 0 && (type === 'sequence' ? blocked === 0 : blocked < chords.length);");
    for (const value of strings) {
      assert.ok(!value.includes("&&"), `code leaked into the inventory: ${value}`);
    }
  });

  it("does read JSX text, which has no quotes around it", () => {
    const strings = sourceStrings("<p>The answer is in the bar and in the cell.</p>");
    assert.deepEqual(strings, ["The answer is in the bar and in the cell."]);
  });
});

describe("reading a rendered page", () => {
  it("splits on block elements and drops what a reader never sees", () => {
    const blocks = htmlBlocks(
      "<p>One idea.</p><script>var x = 1;</script><p>Two&nbsp;ideas &#8212; and a third.</p><style>p{color:red}</style>",
    );
    assert.deepEqual(blocks, ["One idea.", "Two ideas \u2014 and a third."]);
  });

  it("decodes the entities the pages actually emit", () => {
    assert.equal(decodeEntities("Barnes &amp; Noble &hellip; 1 &times; 2"), "Barnes & Noble \u2026 1 \u00d7 2");
    assert.equal(decodeEntities("&#39;quoted&#39;"), "'quoted'");
  });

  it("reads the attributes a screen reader says out loud", () => {
    const labels = htmlLabels('<button aria-label="Show the answer">Show</button><img src="/assets/card.png" alt="A grid of scores">');
    assert.deepEqual(
      labels.map((label) => label.text),
      ["Show the answer", "A grid of scores"],
    );
  });
});

describe("the surfaces the gate reads", () => {
  const rules = loadRules();
  const pages = renderedPages(join(ROOT, "legacy", "content"));
  const surfaces = extractSiteCopy({ root: ROOT });
  const byWhere = new Map();
  for (const surface of surfaces) byWhere.set(surface.where, (byWhere.get(surface.where) ?? 0) + 1);

  it("renders every route a static build writes", () => {
    const labels = new Set(pages.map((page) => page.label));
    for (const route of ["/", "/learn", "/excel-exercises", "/start", "/search", "/about", "/pricing", "/projects", "/privacy", "/terms", "/404"]) {
      assert.ok(labels.has(route), `${route} did not render`);
    }
    // The layout wraps every page, and the lesson and silo pages are the shapes the reader meets most.
    for (const label of ["chrome", "/shortcuts", "/formulas", "/excel-functions"]) assert.ok(labels.has(label), label);
    assert.ok(pages.some((page) => page.label.startsWith("/excel/")), "no exercise page rendered");
    assert.ok(pages.some((page) => page.label.startsWith("/learn/groups/")), "no group page rendered");
  });

  it("reads the longest paragraph on every page, which is where a wall of text would hide", () => {
    const inventory = new Set(surfaces.filter((surface) => surface.where.startsWith("page:")).map((surface) => surface.text));
    const joined = [...inventory].join(" \u0001 ");
    const missed = [];
    for (const page of pages) {
      const blocks = htmlBlocks(page.body).filter((block) => block.split(/\s+/).length >= 12 && looksLikeCopy(block));
      if (blocks.length === 0) continue;
      const longest = blocks.sort((left, right) => right.length - left.length)[0];
      if (!joined.includes(longest.slice(0, 40))) missed.push(page.label);
    }
    assert.deepEqual(missed, [], "pages whose prose never reached the gate");
  });

  it("reads every module declared as a source of copy, and each one still has strings", () => {
    for (const module of SOURCE_MODULES) {
      assert.ok(existsSync(join(ROOT, module.path)), `${module.path} is gone; remove it from SOURCE_MODULES`);
      const count = byWhere.get(`module:${module.path}`) ?? 0;
      assert.ok(count >= module.min, `${module.path} contributes ${count} strings, expected at least ${module.min}`);
      assert.ok(readFileSync(join(ROOT, module.path), "utf8").length > 0, `${module.path} is empty`);
    }
  });

  it("names every surface so a finding is a two-second lookup", () => {
    for (const surface of surfaces) {
      assert.match(surface.where, /^(?:page|label|meta|module):\S+$/, surface.where);
      assert.equal(surface.text, surface.text.replace(/\s+/g, " ").trim(), `un-normalised text on ${surface.where}`);
    }
    // One entry per string: the footer renders on every page and a 139-line report is a report nobody reads.
    const texts = surfaces.map((surface) => surface.text);
    assert.equal(new Set(texts).size, texts.length, "the inventory repeats a string");
  });

  it("finds the chrome, the pricing pitch, the legal pages and the runtime messages", () => {
    assert.ok(byWhere.get("page:chrome") >= 3, "the shell's own copy is not being read");
    assert.ok(byWhere.get("page:/pricing") >= 10, "the pricing page is thin");
    assert.ok(byWhere.get("page:/privacy") >= 10, "the privacy page is thin");
    assert.ok(byWhere.get("module:legacy/src/client/drill.js") >= 20, "the runtime is not being read");
    assert.ok(byWhere.get("module:packages/grader/grade.js") >= 4, "the grader's messages are not being read");
  });

  it("is the rules `copy.js` already applies to a lesson, not a second rulebook", () => {
    const report = lintSite({ root: ROOT, rules });
    assert.equal(report.stats.pages, pages.length);
    assert.equal(report.stats.surfaces, surfaces.length);
    assert.ok(report.stats.words > 15000, `only ${report.stats.words} words measured; the extraction regressed`);
    // Every rule the report can name has to be a rule the content gate knows, so the house style is one file.
    const known = new Set(["banned-phrase", "typography", "long-sentence", "mean-sentence", "long-paragraph", "reading-ease", "seo-title", "seo-description"]);
    for (const finding of report.findings) assert.ok(known.has(finding.rule), `unknown rule ${finding.rule}`);
  });
});

describe("the gate catches a violation", () => {
  const rules = loadRules();

  it("fires on a sentence the house style bans", () => {
    const findings = lintSurfaces(
      [{ where: "page:/planted", text: "This page will delve into a seamless and robust approach to the whole thing." }],
      rules,
    );
    assert.ok(findings.some((finding) => finding.rule === "banned-phrase"));
    assert.ok(findings.every((finding) => finding.where === "page:/planted"));
  });

  it("fires on decorative punctuation", () => {
    const findings = lintSurfaces([{ where: "module:planted.js", text: "Nothing is scheduled yet — finish an exercise." }], rules);
    assert.ok(findings.some((finding) => finding.rule === "typography"));
  });

  it("fires on a wall of text", () => {
    const sentence = "The sheet holds the numbers and the numbers hold the story of the quarter and the quarter is what the meeting is about. ";
    const findings = lintSurfaces([{ where: "page:/planted", text: sentence.repeat(6).trim() }], rules);
    assert.ok(findings.some((finding) => finding.rule === "long-paragraph"));
  });

  it("stays quiet on copy that follows the style", () => {
    const findings = lintSurfaces(
      [{ where: "page:/planted", text: "Type the answer in the bar, then press Enter. The sheet checks it and tells you what it saw." }],
      rules,
    );
    assert.deepEqual(findings, []);
  });
});

describe("the meta bands", () => {
  const rules = loadRules();

  it("measures the title a search result shows, site name included", () => {
    const findings = lintMeta([{ label: "/privacy", page: { title: "Privacy", description: "A sentence long enough to pass, mentioning what is kept and what is not." } }], rules, {
      siteName: "Excel Exercises",
    });
    assert.deepEqual(findings, [], "a short heading with the site name appended is a fine title");
    const bare = lintMeta([{ label: "/privacy", page: { title: "Privacy" } }], rules);
    assert.equal(bare.length, 1, "a bare heading is too short to be a title");
  });

  it("names a description that is too long to survive a search result", () => {
    const findings = lintMeta([{ label: "/pricing", page: { title: "How Excel formulas are graded", description: "x".repeat(200) } }], rules, { siteName: "Site" });
    assert.equal(findings.length, 1);
    assert.equal(findings[0].rule, "seo-description");
  });
});

describe("the inventory file", () => {
  it("matches what the extractor reads today", () => {
    assert.ok(existsSync(INVENTORY), "run npm run copy:site:write to store the inventory");
    const stored = JSON.parse(readFileSync(INVENTORY, "utf8"));
    const current = JSON.parse(inventoryJson(extractSiteCopy({ root: ROOT })));
    const before = new Set(stored.map(([where, text]) => `${where} :: ${text}`));
    const after = new Set(current.map(([where, text]) => `${where} :: ${text}`));
    const added = [...after].filter((entry) => !before.has(entry));
    const removed = [...before].filter((entry) => !after.has(entry));
    assert.deepEqual(added, [], "new copy is not in the inventory; run npm run copy:site:write");
    assert.deepEqual(removed, [], "the inventory lists copy that is no longer shipped; run npm run copy:site:write");
  });

  it("is written in a stable order, so a wording change is a one-line diff", () => {
    const surfaces = extractSiteCopy({ root: ROOT });
    const once = inventoryJson(surfaces);
    const twice = inventoryJson([...surfaces].reverse());
    assert.equal(once, twice);
  });
});
