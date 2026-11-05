/**
 * The function notes: the content gate, and the one thing that can silently disappear from a note —
 * the exercise it borrows from a lesson. A note whose exercise slug is wrong still parses, still passes
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
import { prepareExercisePage } from "../legacy/src/site/exercise-page.mjs";
import { renderSiteMenu } from "../legacy/src/site/shell.mjs";
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

  it("renders every exercise the note promises, or the page asks for practice it does not offer", () => {
    const config = siteConfig({ SITE_URL: "https://drills.example", SITE_BUILT_AT: "2026-11-02" });
    for (const article of notes) {
      const entry = index.find((item) => item.slug === article.exercise) ?? null;
      const { body } = prepareArticlePage({ config, track, index, articles: notes, article, entry, clientAvailable: true });
      const islands = (body.match(/class="article-drill"/g) ?? []).length;
      assert.equal(islands, article.drills.length, `${article.slug}: the page renders ${islands} of ${article.drills.length} exercises`);
      assert.ok(islands >= 1, `${article.slug}: the exercise is missing from the page`);
      for (const [position, slug] of article.drills.entries()) {
        assert.ok(body.includes(`id="article-data-${position + 1}"`), `${article.slug}: exercise ${position + 1} has no payload to grade against`);
      }
      assert.ok(body.includes('href="/excel/'), `${article.slug}: the note links to no exercise`);
    }
  });

  it("puts a door to the note on the lesson the note exercises", () => {
    const config = siteConfig({ SITE_URL: "https://drills.example", SITE_BUILT_AT: "2026-11-02" });
    const lessonsWithNotes = new Set(notes.map((article) => article.exercise));
    for (const entry of index) {
      const { body } = prepareExercisePage({ config, track, index, entry, clientAvailable: true, articles: notes });
      const doors = notes.filter((article) => body.includes(`href="/excel-functions/${article.slug}"`));
      if (lessonsWithNotes.has(entry.slug)) {
        assert.equal(doors.length, 1, `${entry.slug}: the note written around this exercise has no door on it`);
      } else {
        assert.deepEqual(doors, [], `${entry.slug}: a door to a note that is not about this exercise`);
      }
    }
  });

  it("lists the notes in the site chrome, so the hub is one click from the front door", () => {
    const menu = renderSiteMenu({ config: siteConfig({ SITE_URL: "https://drills.example" }) });
    assert.ok(menu.includes('href="/excel-functions"'), "the notes hub is unlisted");
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
    write("ghost", readFileSync(join(CONTENT, "articles", "sum.md"), "utf8").replace("drills: sum-basics,", "drills: not-a-lesson,"));
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

  it("refuses a note that drops a section of the template", () => {
    const text = readFileSync(join(CONTENT, "articles", "sum.md"), "utf8");
    assert.throws(
      () => parseArticle(text.replace("## Alternatives", "## Other ways"), { name: "split.md" }),
      /missing the "## alternatives" section/,
      "a note with no comparison section answered half of what the reader asked",
    );
    assert.throws(
      () => parseArticle(text.replace("## Other apps", "## Elsewhere"), { name: "split.md" }),
      /missing the "## other-apps" section/,
    );
  });

  it("refuses a note whose comparisons say nothing checkable", () => {
    const text = readFileSync(join(CONTENT, "articles", "sum.md"), "utf8");
    const thin = text.replace(/## Other apps[\s\S]*?## Practice/, "## Other apps\n\nLots of tools do this.\n\n## Practice");
    assert.throws(
      () => parseArticle(thin, { name: "vague.md" }),
      /names 0 of Sheets\/VBA\/Google/,
      "one app is a mention, not a comparison",
    );
    const versionless = text.replace(/## Alternatives[\s\S]*?## Other apps/, "## Alternatives\n\n`=SUBTOTAL(9, B2:B4)` does the same thing.\n\n## Other apps");
    assert.throws(
      () => parseArticle(versionless, { name: "versionless.md" }),
      /says which version it needs/,
      "advice with no version breaks on the reader's install",
    );
  });

  it("refuses an errors table that promises a code the grader cannot return", () => {
    const text = readFileSync(join(CONTENT, "articles", "sum.md"), "utf8");
    assert.throws(
      () => parseArticle(text.replace("`#VALUE!`", "`#SPILL!`"), { name: "spill.md" }),
      /"#SPILL!" is not an error the grader returns/,
    );
  });

  it("refuses a note that is a stub or a book", () => {
    const text = readFileSync(join(CONTENT, "articles", "sum.md"), "utf8");
    const stub = [
      text.slice(0, text.indexOf("## Syntax")),
      "## Syntax\n\n`=SUM(B2:B4)`\n",
      "## Examples\n\n### Example 1\n\n`=SUM(B2:B4)` adds three cells.\n",
      "### Example 2\n\n`=SUM(B2:B4,D2:D4)` adds two blocks.\n",
      "## What goes wrong\n\n| Result | What it means | The fix |\n| --- | --- | --- |\n| `#VALUE!` | A cell is not a number | Fix the cell |\n",
      "## Alternatives\n\n`=SUBTOTAL(9, B2:B4)` skips filtered rows, and it works in Excel 2019.\n",
      "## Other apps\n\nGoogle Sheets has `=SUM(B2:B4)`, and so does VBA as `WorksheetFunction.Sum`.\n",
      "## Practice\n\nType the total of the Q1 column.\n",
      "## Questions\n\nDoes SUM ignore text? Yes, and blanks, and booleans typed by hand.\n",
    ].join("\n");
    assert.throws(() => parseArticle(stub, { name: "thin.md" }), /below the 700-word floor/);
    const filler = `${"A sentence that says very little about sums, twice over. ".repeat(200)}\n\n`;
    const fat = text.replace("## Practice", `${filler}## Practice`);
    assert.throws(() => parseArticle(fat, { name: "fat.md" }), /above the 1800-word ceiling/);
  });

  it("refuses a note with no exercises, too many exercises, or the same exercise twice", () => {
    const text = readFileSync(join(CONTENT, "articles", "sum.md"), "utf8");
    const exercises = /^drills: .*$/m.exec(text)[0];
    const swap = (value) => parseArticle(text.replace(exercises, value), { name: "drills.md" });
    assert.throws(() => swap("drills:"), /has 0 drills, expected 1 to 6/);
    assert.throws(() => swap("drills: a-b, c-d, e-f, g-h, i-j, k-l, m-n"), /has 7 drills, expected 1 to 6/);
    assert.throws(() => swap("drills: sum-basics, sum-basics"), /listed twice/);
    assert.throws(() => swap("drills: sum-basics, Sum_Basics"), /not a lesson slug/);
    assert.throws(
      () => swap(`drills: sum-basics\nexercise: sum-basics`),
      /"drills" and "exercise" are both set/,
      "a note lists its exercises once, or the page renders one of them twice",
    );
  });

  it("warns about the old single-drill key without failing the note", () => {
    write("legacy", readFileSync(join(CONTENT, "articles", "sum.md"), "utf8").replace(/^drills: .*$/m, "exercise: sum-basics"));
    const report = lintArticles(content);
    const hits = report.findings.filter((finding) => finding.rule === "legacy-field");
    assert.equal(hits.length, 1, "the old key is a warning, once");
    assert.equal(hits[0].severity, "warn", "a note on the old key still ships");
    rmSync(join(content, "articles", "legacy.md"));
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
