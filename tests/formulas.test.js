/**
 * The problem pages: a question, one formula, the reason it works, and an exercise that grades on the page.
 *
 * The content rules are asserted through the same function the gate uses, so this file cannot drift
 * from `npm run content:formulas`. The things a rule cannot see are asserted separately: that the page
 * the reader gets actually carries the exercise, that the hub lists every question, and that typing a
 * page's own question into search finds that page rather than a note about the same function.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { servedPaths } from "../packages/content-lint/articles.js";
import { lintFormulas } from "../packages/content-lint/formulas.js";
import {
  FAMILIES,
  FORMULA_SECTIONS,
  formulaProblems,
  loadArticles,
  loadFormulas,
  parseFormula,
} from "../packages/content/index.js";
import { buildSearchIndex, search } from "../packages/search/index.js";
import { loadContent } from "../legacy/src/site/content.mjs";
import { prepareFormulaPage, prepareFormulasHub } from "../legacy/src/site/formula-page.mjs";
import { siteConfig } from "../legacy/src/site/config.mjs";
import { esc } from "../legacy/src/site/html.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CONTENT = join(ROOT, "legacy", "content");
const config = siteConfig({ SITE_URL: "https://drills.example", SITE_BUILT_AT: "2026-11-02" });
const { track, index } = loadContent(CONTENT);
const lessons = index.map((entry) => entry.exercise);
const notes = loadArticles(join(CONTENT, "articles"));
const formulas = loadFormulas(join(CONTENT, "formulas"));
const errors = (findings) => findings.filter((finding) => finding.severity === "error");
const FORMULA_SOURCE = readFileSync(
  join(CONTENT, "formulas", readdirSync(join(CONTENT, "formulas")).filter((name) => name.endsWith(".md"))[0]),
  "utf8",
);

const page = (formula) =>
  prepareFormulaPage({
    config,
    track,
    index,
    articles: notes,
    formulas,
    formula,
    clientAvailable: true,
  });

describe("the problem pages that ship", () => {
  it("parses every file in the folder", () => {
    const files = readdirSync(join(CONTENT, "formulas")).filter((name) => name.endsWith(".md"));
    assert.ok(files.length > 0, "the formulas folder is empty");
    assert.equal(formulas.length, files.length);
  });

  it("passes the gate without a blocking finding", () => {
    const report = lintFormulas(CONTENT);
    assert.deepEqual(
      errors(report.findings).map((finding) => `${finding.where}: ${finding.message}`),
      [],
      "the shipped problem pages should not need the gate to argue with them",
    );
    assert.equal(report.stats.formulas, formulas.length);
  });

  it("answers every page in the four sections the reader asks for", () => {
    for (const formula of formulas) {
      const ids = new Set(formula.blocks.filter((block) => block.type === "h2").map((block) => block.id));
      for (const section of FORMULA_SECTIONS) {
        assert.ok(ids.has(section), `${formula.slug}: no "## ${section}" section`);
      }
    }
  });

  it("points every page at an exercise that exists", () => {
    assert.deepEqual(
      formulaProblems({ formulas, lessons, paths: servedPaths(lessons, notes, formulas) }),
      [],
    );
  });

  it("borrows one to four exercises, and every one of them is a lesson in the track", () => {
    const slugs = new Set(lessons.map((lesson) => lesson.slug));
    for (const formula of formulas) {
      assert.ok(formula.drills.length >= 1, `${formula.slug}: no exercise`);
      assert.ok(formula.drills.length <= 4, `${formula.slug}: ${formula.drills.length} exercises`);
      for (const slug of formula.drills) assert.ok(slugs.has(slug), `${formula.slug}: "${slug}" is not a lesson`);
    }
  });

  it("sorts every page onto one of the hub's four shelves", () => {
    for (const formula of formulas) assert.ok(FAMILIES.includes(formula.family), `${formula.slug}: "${formula.family}"`);
    const used = new Set(formulas.map((formula) => formula.family));
    assert.deepEqual([...FAMILIES].filter((family) => !used.has(family)), [], "a shelf with nothing on it");
  });

  it("refuses a page whose exercise slug is not a lesson", () => {
    const broken = { ...formulas[0], drills: ["no-such-lesson"] };
    const problems = formulaProblems({ formulas: [broken], lessons, paths: servedPaths(lessons, notes, [broken]) });
    assert.ok(
      problems.some((problem) => /no-such-lesson/.test(String(problem?.message ?? problem))),
      "an exercise that is not a lesson has to be a blocking finding",
    );
  });

  it("refuses a page that drops the part readers come back for", () => {
    const text = FORMULA_SOURCE.replace("## What goes wrong", "## Something else");
    assert.throws(() => parseFormula(text, { name: "short.md" }), /What goes wrong|what-goes-wrong/);
  });

  it("refuses a page that opens with a heading instead of the answer", () => {
    const text = FORMULA_SOURCE.replace(/^(---\n[\s\S]*?\n---\n\n)/, "$1## Answer\n\n");
    assert.throws(() => parseFormula(text, { name: "heading-first.md" }), /paragraph|answer/i);
  });
});

describe("the page a reader lands on", () => {
  it("renders one island per exercise, each with its own payload", () => {
    for (const formula of formulas) {
      const { body } = page(formula);
      const islands = (body.match(/class="article-drill"/g) ?? []).length;
      assert.equal(islands, formula.drills.length, `${formula.slug}: renders ${islands} of ${formula.drills.length}`);
      for (const [position, slug] of formula.drills.entries()) {
        assert.ok(body.includes(`id="article-data-${position + 1}"`), `${formula.slug}: exercise ${position + 1} has no payload`);
        assert.ok(body.includes(`href="/excel/${slug}"`), `${formula.slug}: no link to ${slug}`);
      }
    }
  });

  it("asks the question above the answer, and puts the exercise before the way out", () => {
    for (const formula of formulas) {
      const { body } = page(formula);
      const heading = body.indexOf(`<h1>${esc(formula.title)}</h1>`);
      const question = body.indexOf(formula.question);
      assert.ok(heading !== -1 && question > heading, `${formula.slug}: the question is not under the heading`);
      const exercise = body.indexOf('class="article-drill"');
      const next = body.indexOf("Where to go next");
      assert.ok(exercise !== -1 && next !== -1 && exercise < next, `${formula.slug}: the way out comes before the exercise`);
    }
  });

  it("lists the whole silo as siblings, and the note for its function", () => {
    for (const formula of formulas) {
      const { body } = page(formula);
      const siblings = formulas.filter(
        (other) => other.slug !== formula.slug && body.includes(`href="/formulas/${other.slug}"`),
      );
      assert.ok(siblings.length >= 2, `${formula.slug}: links to ${siblings.length} other problem pages`);
      const note = notes.find((article) =>
        String(article.function ?? "")
          .split(/[/\s]+/)
          .includes(formula.function),
      );
      if (note) assert.ok(body.includes(`href="/excel-functions/${note.slug}"`), `${formula.slug}: no note link`);
    }
  });

  it("lists every question on the hub, in its family", () => {
    const { body } = prepareFormulasHub({ config, track, index, articles: notes, formulas });
    for (const formula of formulas) {
      assert.ok(body.includes(`href="/formulas/${formula.slug}"`), `hub: no link to ${formula.slug}`);
      assert.ok(body.includes(formula.question), `hub: does not list the question "${formula.question}"`);
      assert.ok(body.includes(`id="family-${formula.family}"`), `hub: no "${formula.family}" section`);
    }
  });
});

describe("finding a problem page", () => {
  const entries = buildSearchIndex({ index, articles: notes, formulas, groups: track.groups });

  it("returns the page that answers its own question", () => {
    for (const formula of formulas) {
      const hits = search(formula.question, entries, { limit: 3 });
      assert.equal(hits[0]?.id, formula.slug, `"${formula.question}" found ${hits.map((hit) => hit.id).join(", ")}`);
      assert.equal(hits[0]?.kind, "formula", `${formula.slug}: ranked as a "${hits[0]?.kind}", not a problem page`);
    }
  });

  it("finds a page from the words the question uses, not the function name", () => {
    const queries = [
      ["look up to the left", "look-up-a-value-to-the-left-of-the-key"],
      ["count open tickets", "countif-count-the-open-tickets"],
      ["round up crates", "round-up-to-whole-crates-with-roundup"],
    ];
    for (const [query, slug] of queries) {
      const hits = search(query, entries, { limit: 3 }).map((hit) => hit.id);
      assert.ok(hits.includes(slug), `"${query}" did not find ${slug} (got ${hits.join(", ")})`);
    }
  });

  it("keeps the notes and the problem pages apart", () => {
    const notesOnly = buildSearchIndex({ index, articles: notes, groups: track.groups }).filter(
      (entry) => entry.kind === "formula",
    );
    assert.deepEqual(notesOnly, [], "the formula kind leaked into a build without problem pages");
  });
});
