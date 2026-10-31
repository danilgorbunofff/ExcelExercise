/**
 * The function notes: the content gate, and the one thing that can silently disappear from a note —
 * the drill it borrows from a lesson. A note whose exercise slug is wrong still parses, still passes
 * every frontmatter rule, and still renders; it just renders without the input it told the reader to
 * type into. That is a rendered-page assertion, so it lives here next to the content rules.
 */
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, describe, it } from "node:test";

import { lintArticles, servedPaths } from "../packages/content-lint/articles.js";
import { articleProblems, loadArticles, parseArticle } from "../packages/content/index.js";
import { loadContent } from "../packages/content/index.js";
import { loadContent as loadSiteContent } from "../legacy/src/site/content.mjs";
import { prepareArticlePage } from "../legacy/src/site/article-page.mjs";
import { siteConfig } from "../legacy/src/site/config.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CONTENT = join(ROOT, "legacy", "content");
const rules = { seoTitle: { minChars: 18, maxChars: 60 }, seoDescription: { minChars: 70, maxChars: 155 } };

const blocking = (report) => report.findings.filter((finding) => finding.severity === "error");

describe("the notes that ship", () => {
  const notes = loadArticles(join(CONTENT, "articles"));
  const { track, index } = loadSiteContent(CONTENT);
  const lessons = index.map((entry) => entry.exercise);

  it("parses every file in the folder", () => {
    const files = readdirSync(join(CONTENT, "articles")).filter((name) => name.endsWith(".md"));
    assert.ok(files.length > 0, "the notes folder is empty");
    assert.equal(notes.length, files.length);
  });

  it("passes the gate without a single finding", () => {
    const report = lintArticles(CONTENT);
    assert.deepEqual(
      report.findings.map((finding) => `${finding.where}: ${finding.message}`),
      [],
      "the shipped notes should not need the gate to argue with them",
    );
    assert.equal(report.stats.articles, notes.length);
  });

  it("points every note at a lesson that exists", () => {
    assert.deepEqual(articleProblems({ articles: notes, lessons, paths: servedPaths(lessons, notes) }), []);
  });

  it("renders the drill on every note, or the page asks for practice it does not offer", () => {
    const config = siteConfig({ SITE_URL: "https://drills.example", SITE_BUILT_AT: "2026-11-02" });
    for (const article of notes) {
      const entry = index.find((item) => item.slug === article.exercise) ?? null;
      const { body } = prepareArticlePage({ config, track, index, articles: notes, article, entry, clientAvailable: true });
      assert.ok(body.includes('class="article-drill"'), `${article.slug}: the drill is missing from the page`);
      assert.ok(body.includes('id="article-data"'), `${article.slug}: the drill has no payload to grade against`);
      assert.ok(body.includes('href="/excel/'), `${article.slug}: the note links to no exercise`);
    }
  });
});

describe("the gate itself", () => {
  let dir;
  let content;

  before(() => {
    dir = mkdtempSync(join(tmpdir(), "es-articles-"));
    content = join(dir, "content");
    cpSync(CONTENT, content, { recursive: true });
  });

  after(() => rmSync(dir, { recursive: true, force: true }));

  const write = (slug, text) => writeFileSync(join(content, "articles", `${slug}.md`), text);

  it("refuses a note whose exercise does not exist", () => {
    write("ghost", readFileSync(join(CONTENT, "articles", "sum.md"), "utf8").replace("exercise: sum-basics", "exercise: not-a-lesson"));
    const report = lintArticles(content);
    assert.ok(
      report.findings.some((finding) => finding.message.includes("not-a-lesson") && finding.severity === "error"),
      "a note borrowed from a missing lesson has to fail",
    );
    rmSync(join(content, "articles", "ghost.md"));
  });

  it("refuses a note whose prose reads like marketing", () => {
    const text = readFileSync(join(CONTENT, "articles", "sum.md"), "utf8").replace(
      "## Practice",
      "We will delve into the fast-paced world of sums.\n\n## Practice",
    );
    write("slop", text);
    const report = lintArticles(content);
    const hits = report.findings.filter((finding) => finding.rule === "banned-phrase");
    assert.ok(hits.length >= 2, "both banned phrases should be reported, not just the first");
    rmSync(join(content, "articles", "slop.md"));
  });

  it("refuses generator punctuation", () => {
    const text = readFileSync(join(CONTENT, "articles", "sum.md"), "utf8").replace("## Practice", "The answer \u2014 the total.\n\n## Practice");
    write("dash", text);
    const report = lintArticles(content);
    assert.ok(report.findings.some((finding) => finding.rule === "typography"), "an em dash is a tell, not a style");
    rmSync(join(content, "articles", "dash.md"));
  });

  it("reports a note that repeats another one", () => {
    const text = readFileSync(join(CONTENT, "articles", "sum.md"), "utf8");
    write("sum-copy", text.replace(/^title: .*$/m, "title: Copy of the SUM note"));
    const report = lintArticles(content);
    assert.ok(
      report.findings.some((finding) => finding.rule === "duplicate-note"),
      "two notes with the same body are one note and one competitor",
    );
    rmSync(join(content, "articles", "sum-copy.md"));
  });

  it("keeps a broken file out of the crash path", () => {
    write("broken", "---\ntitle: Broken\n---\n\n## Syntax\n\n=SOMETHING()\n");
    const report = lintArticles(content);
    assert.equal(report.stats.articles, loadArticles(join(CONTENT, "articles")).length, "the parsable notes still load");
    assert.ok(blocking(report).length > 0, "the broken file is reported, not thrown");
    rmSync(join(content, "articles", "broken.md"));
  });

  it("keeps the description inside what a search result shows", () => {
    const article = parseArticle(
      readFileSync(join(CONTENT, "articles", "sum.md"), "utf8").replace(/^description: .*$/m, "description: Too short."),
      { name: "short.md" },
    );
    assert.ok(article.description.length < rules.seoDescription.minChars, "the fixture has to be short");
    write("short", readFileSync(join(CONTENT, "articles", "sum.md"), "utf8").replace(/^description: .*$/m, "description: Too short."));
    const report = lintArticles(content);
    assert.ok(report.findings.some((finding) => finding.field === "description"), "a snippet that says nothing is a warning");
    rmSync(join(content, "articles", "short.md"));
  });
});

describe("the addresses a note may link to", () => {
  it("covers the lessons and the notes, not the signed-in surfaces", () => {
    const notes = loadArticles(join(CONTENT, "articles"));
    const { index } = loadSiteContent(CONTENT);
    const paths = servedPaths(index.map((entry) => entry.exercise), notes);
    assert.ok(paths.has("/excel-functions"));
    for (const note of notes) assert.ok(paths.has(`/excel-functions/${note.slug}`), `${note.slug} is not a served path`);
    for (const entry of index) assert.ok(paths.has(`/excel/${entry.slug}`), `${entry.slug} is not a served path`);
    for (const path of ["/account", "/pricing", "/learn"]) {
      assert.ok(!paths.has(path), `${path} is not a page a note may point at`);
    }
  });
});
