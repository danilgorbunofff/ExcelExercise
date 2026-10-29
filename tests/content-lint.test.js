import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { LESSON_BASES, lintContent, replayFixtures } from "../packages/content-lint/index.js";
import { loadContent } from "../packages/content/index.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CONTENT = join(ROOT, "legacy", "content");
const FIXTURES = join(ROOT, "tests", "fixtures");

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const writeJson = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);

const messages = (report) => report.errors.map(({ where, message }) => (where ? `${where}: ${message}` : message));

/**
 * Copies the real content and fixtures into a temp directory so a test can break one thing and see
 * exactly one error. Both directories are handed to the callback; cleanup is unconditional.
 */
function sandbox(mutate, { persist = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "es-lint-"));
  const content = join(dir, "content");
  const fixtures = join(dir, "fixtures");
  cpSync(CONTENT, content, { recursive: true });
  cpSync(FIXTURES, fixtures, { recursive: true });
  mutate?.({ content, fixtures, dir });
  const report = lintContent(content, { fixturesDir: fixtures });
  if (!persist) rmSync(dir, { recursive: true, force: true });
  return { report, content, fixtures, dir };
}

const lessonPath = (content, id) => join(content, "exercises", `${id}.json`);
const fixturePath = (fixtures, id) => join(fixtures, `${id}.json`);

/** The real corpus, with one lesson rewritten as the schema v2 shape the linter has to accept. */
function toV2(raw, fixture) {
  const {
    id, slug, level, title, docs,
    prompt, grid, answerCell, expect, require, forbid, requireRef, rules, hints,
  } = raw;
  const screen = {
    id: "formula-1", type: "formula",
    prompt, grid, answerCell, expect, require, forbid, requireRef, rules, hints,
    fixtures: { accept: fixture.accepted, reject: fixture.rejected.map((entry) => entry.formula) },
  };
  for (const key of Object.keys(screen)) if (screen[key] === undefined) delete screen[key];
  return { id, slug, level, title, docs, schemaVersion: 2, screens: [screen] };
}

describe("content-lint: the real corpus", () => {
  const { report } = sandbox();

  it("passes, with every fixture agreeing with the grader", () => {
    assert.deepEqual(report.errors, []);
    assert.equal(report.ok, true);
  });

  it("replays one fixture file per lesson", () => {
    const files = readdirSync(FIXTURES).filter((name) => name.endsWith(".json"));
    const accepted = files.reduce((sum, name) => sum + readJson(join(FIXTURES, name)).accepted.length, 0);
    const rejected = files.reduce((sum, name) => sum + readJson(join(FIXTURES, name)).rejected.length, 0);
    assert.equal(report.stats.lessons, files.length);
    assert.equal(report.stats.screens, files.length, "v1 lessons are single-screen");
    assert.equal(report.stats.accepted, accepted);
    assert.equal(report.stats.rejected, rejected);
    assert.ok(accepted >= files.length && rejected >= files.length);
  });

  it("warns about nothing worse than prompt style and the intro debt", () => {
    for (const warning of report.warnings) assert.match(warning.message, /sentences|no intro yet/);
  });

  it("reports the catalog the lessons sit in", () => {
    assert.equal(report.stats.groups, 16);
    assert.equal(report.stats.planned, 78);
  });
});

describe("content-lint: fixtures", () => {
  it("fails a screen with no fixtures at all", () => {
    const { report } = sandbox(({ fixtures }) => rmSync(fixturePath(fixtures, "03-countif-open-tickets")));
    const found = messages(report);
    assert.equal(found.length, 1, found.join("\n"));
    assert.match(found[0], /has no fixtures/);
  });

  it("fails a screen below the six-and-six floor", () => {
    const { report } = sandbox(({ fixtures }) => {
      const path = fixturePath(fixtures, "01-sum-basics");
      const fixture = readJson(path);
      writeJson(path, { ...fixture, accepted: fixture.accepted.slice(0, 5) });
    });
    assert.match(messages(report).join("\n"), /has 5 accepted fixtures, the floor is 6/);
  });

  it("fails a formula the lesson calls accepted but the grader rejects", () => {
    const { report } = sandbox(({ fixtures }) => {
      const path = fixturePath(fixtures, "01-sum-basics");
      const fixture = readJson(path);
      writeJson(path, { ...fixture, accepted: [...fixture.accepted, "=AVERAGE(B2:B4)"] });
    });
    assert.match(messages(report).join("\n"), /accepts "=AVERAGE\(B2:B4\)" but the grader rejects it \(func-sum/);
  });

  it("fails a formula the lesson calls rejected but the grader accepts", () => {
    const { report } = sandbox(({ fixtures }) => {
      const path = fixturePath(fixtures, "01-sum-basics");
      const fixture = readJson(path);
      writeJson(path, { ...fixture, rejected: [...fixture.rejected, { formula: "=SUM(B2:B4)", rule: "value", why: "wrong" }] });
    });
    assert.match(messages(report).join("\n"), /rejects "=SUM\(B2:B4\)" but the grader accepts it/);
  });

  it("fails a rejection filed under a rule the grader does not report", () => {
    const { report } = sandbox(({ fixtures }) => {
      const path = fixturePath(fixtures, "01-sum-basics");
      const fixture = readJson(path);
      const rejected = fixture.rejected.map((entry, index) => (index === 1 ? { ...entry, rule: "value" } : entry));
      writeJson(path, { ...fixture, rejected });
    });
    assert.match(messages(report).join("\n"), /filed under "value" but the grader reports "func-sum"/);
  });

  it("fails a rule the lesson can report that no fixture ever triggers", () => {
    const { report } = sandbox(({ fixtures }) => {
      const path = fixturePath(fixtures, "01-sum-basics");
      const fixture = readJson(path);
      writeJson(path, { ...fixture, rejected: fixture.rejected.filter((entry) => entry.rule !== "func-sum") });
    });
    assert.match(messages(report).join("\n"), /never exercises the "func-sum" failure/);
  });

  it("fails a fixture file that belongs to no lesson", () => {    const { report } = sandbox(({ fixtures }) =>
      writeJson(join(fixtures, "11-ghost.json"), { accepted: [], rejected: [] }),
    );
    assert.match(messages(report).join("\n"), /tests\/fixtures\/11-ghost\.json: belongs to no lesson/);
  });

  it("refuses two sources of truth for one screen", () => {
    const { report } = sandbox(({ content }) => {
      const path = lessonPath(content, "01-sum-basics");
      writeJson(path, { ...readJson(path), fixtures: { accept: ["=SUM(B2:B4)"], reject: ["=B2"] } });
    });
    assert.match(messages(report).join("\n"), /declares fixtures inline and in tests\/fixtures/);
  });

  it("reports an unreadable fixture file once, not as missing fixtures", () => {
    const { report } = sandbox(({ fixtures }) => {
      writeFileSync(fixturePath(fixtures, "01-sum-basics"), "{ not json");
    });
    const found = messages(report);
    assert.equal(found.length, 1, found.join("\n"));
    assert.match(found[0], /tests\/fixtures\/01-sum-basics\.json: is not readable JSON/);
  });
});

describe("content-lint: schema v2", () => {
  it("accepts fixtures inline on the screen, with no sidecar", () => {
    const { report } = sandbox(({ content, fixtures }) => {
      const id = "01-sum-basics";
      const fixture = readJson(fixturePath(fixtures, id));
      writeJson(lessonPath(content, id), toV2(readJson(lessonPath(content, id)), fixture));
      rmSync(fixturePath(fixtures, id));
    });
    assert.deepEqual(report.errors, []);
    assert.equal(report.ok, true);
  });

  it("fails a v2 lesson whose fixtures are still in the sidecar", () => {
    const { report } = sandbox(({ content, fixtures }) => {
      const id = "01-sum-basics";
      const fixture = readJson(fixturePath(fixtures, id));
      const v2 = toV2(readJson(lessonPath(content, id)), fixture);
      delete v2.screens[0].fixtures;
      writeJson(lessonPath(content, id), v2);
    });
    assert.match(messages(report).join("\n"), /is schemaVersion 2 but its fixtures are still in tests\/fixtures/);
  });
});

describe("content-lint: prompts and links", () => {
  it("fails a prompt copy-pasted from another lesson", () => {
    const { report } = sandbox(({ content }) => {
      const first = readJson(lessonPath(content, "01-sum-basics"));
      const second = lessonPath(content, "02-average-scores");
      writeJson(second, { ...readJson(second), prompt: `  ${first.prompt.toUpperCase()} ` });
    });
    assert.match(messages(report).join("\n"), /prompt is a duplicate of the one in content\/exercises\/01-sum-basics\.json/);
  });

  it("warns, but does not fail, when a prompt is two sentences", () => {
    const { report } = sandbox(({ content }) => {
      const path = lessonPath(content, "01-sum-basics");
      const lesson = readJson(path);
      writeJson(path, { ...lesson, prompt: "Add up the column. Keep it short." });
    });
    assert.deepEqual(report.errors, []);
    const prompts = report.warnings.filter(({ message }) => message.includes("sentences"));
    assert.equal(prompts.length, 1);
    assert.match(prompts[0].message, /prompt is 2 sentences/);
  });

  it("fails an internal link to a page that does not exist", () => {
    const { report } = sandbox(({ content }) => {
      const path = lessonPath(content, "04-if-pass-fail");
      const lesson = readJson(path);
      writeJson(path, { ...lesson, docs: { ...lesson.docs, explain: `${lesson.docs.explain} See [the lookup drill](/learn/excel/no-such-drill).` } });
    });
    assert.match(messages(report).join("\n"), /links to "\/learn\/excel\/no-such-drill", which is not a page that exists/);
  });

  it("accepts a link to a lesson under either published base", () => {
    const { report } = sandbox(({ content }) => {
      const path = lessonPath(content, "04-if-pass-fail");
      const lesson = readJson(path);
      const explain = `${lesson.docs.explain} Then try [SUM](/learn/excel/sum-basics) or [the same drill](/excel/sum-basics).`;
      writeJson(path, { ...lesson, docs: { ...lesson.docs, explain } });
    });
    assert.deepEqual(report.errors, []);
  });

  it("rejects paths the site never serves, including the lesson index", () => {
    const { report } = sandbox(({ content }) => {
      const path = lessonPath(content, "04-if-pass-fail");
      const lesson = readJson(path);
      const explain = `${lesson.docs.explain} See [a](/lessons/sum-basics), [b](/learn/excel) and [c](/lessons).`;
      writeJson(path, { ...lesson, docs: { ...lesson.docs, explain } });
    });
    assert.deepEqual(
      report.errors.filter(({ where }) => where?.includes("04-if-pass-fail")).map(({ message }) => message),
      [
        'docs.explain links to "/lessons/sum-basics", which is not a page that exists',
        'docs.explain links to "/learn/excel", which is not a page that exists',
        'docs.explain links to "/lessons", which is not a page that exists',
      ],
    );
  });
});

describe("content-lint: the catalog", () => {
  /** Rewrites track.json in the sandbox. The loader reads it, so a broken catalog is one error. */
  function editTrack(content, edit) {
    const path = join(content, "track.json");
    writeJson(path, edit(readJson(path)));
  }

  it("warns once about groups that hold published lessons but still owe their intro", () => {
    const { report } = sandbox();
    const intros = report.warnings.filter(({ message }) => message.includes("no intro yet"));
    assert.equal(intros.length, 1);
    assert.match(intros[0].message, /^9 groups with published lessons and no intro yet: sum, count, statistical, logical, rounding, lookup, index-match, text-search, capstone$/);
  });

  it("says nothing about intros once every published group has one", () => {
    const { report } = sandbox(({ content }) => {
      editTrack(content, (track) => ({
        ...track,
        groups: track.groups.map((group) => {
          const published = track.lessons.some((lesson) => lesson.id && lesson.group === group.id);
          return published ? { ...group, intro: `A short introduction to ${group.title}.` } : group;
        }),
      }));
    });
    assert.deepEqual(report.errors, []);
    assert.equal(report.warnings.filter(({ message }) => message.includes("no intro yet")).length, 0);
  });

  it("fails a catalog where a planned slot repeats a published title", () => {
    const { report } = sandbox(({ content }) => {
      editTrack(content, (track) => ({
        ...track,
        lessons: [...track.lessons, { title: "  sum: TOTAL a column ", level: 1, group: "sum" }],
      }));
    });
    assert.deepEqual(
      report.errors.filter(({ where }) => where === "content/track.json").map(({ message }) => message),
      ['lessons[88] "sum: TOTAL a column" repeats the title of lessons[3]'],
    );
  });

  it("fails two planned slots that say the same thing", () => {
    const { report } = sandbox(({ content }) => {
      editTrack(content, (track) => ({
        ...track,
        lessons: [...track.lessons, { title: "A drill", level: 1, group: "count" }, { title: "a drill", level: 2, group: "date" }],
      }));
    });
    assert.match(report.errors.map(({ message }) => message).join("\n"), /lessons\[89\] "a drill" repeats the title of lessons\[88\]/);
  });

  /**
   * The intro rule is a warning only because nothing renders a group yet: the moment a route shows
   * one, a blank intro is an empty section on a live page. This test reads the app tree rather than
   * trusting the comment in `checkCatalog` to be flipped by hand.
   */
  it("stops treating a blank intro as debt the moment a page renders a group", () => {
    const { report } = sandbox(({ content }) => {
      editTrack(content, (track) => ({
        ...track,
        groups: track.groups.map(({ id, title }) => ({ id, title })),
      }));
    });
    const pages = readdirSync(join(ROOT, "app"), { recursive: true, encoding: "utf8" }).filter(
      (path) => path.endsWith("page.js") && (/\[group\]/.test(path) || /(^|\/)groups?\//.test(path)),
    );
    const mentions = (list) => list.filter(({ message }) => message.includes("intro"));
    if (pages.length > 0) {
      assert.equal(
        mentions(report.errors).length,
        1,
        `a page renders a group (${pages.join(", ")}), so a missing intro must fail the lint, not warn`,
      );
    } else {
      assert.equal(mentions(report.warnings).length, 1, "no page renders a group yet, so the debt is still a warning");
    }
  });
});

describe("content-lint: schema errors stop the run", () => {
  it("reports the loader's message instead of throwing", () => {
    const { report } = sandbox(({ content }) => {
      const path = lessonPath(content, "07-vlookup-exact");
      writeJson(path, { ...readJson(path), slug: "Not Kebab" });
    });
    assert.equal(report.ok, false);
    assert.equal(report.errors.length, 1);
    assert.match(report.errors[0].message, /slug "Not Kebab" must be lowercase-kebab/);
    assert.equal(report.errors[0].where, null, "the loader already names the file");
  });
});

describe("content-lint: CLI", () => {
  const CLI = join(ROOT, "packages", "content-lint", "cli.js");

  it("exits 0 on the real corpus and prints the fixture tally", () => {
    const run = spawnSync(process.execPath, [CLI, "check"], { encoding: "utf8" });
    assert.equal(run.status, 0, run.stdout + run.stderr);
    assert.match(run.stdout, /content: 10 of 88 catalogued lessons, 16 groups, 10 screens, 154 fixtures replayed/);
    assert.match(run.stdout, /✓ content passes/);
  });

  it("exits 1 when a fixture disagrees with the grader", () => {
    const { dir } = sandbox(({ fixtures }) => {
      const path = fixturePath(fixtures, "01-sum-basics");
      const fixture = readJson(path);
      writeJson(path, { ...fixture, accepted: [...fixture.accepted, "=SUM(B2:B3)"] });
    }, { persist: true });
    try {
      const run = spawnSync(
        process.execPath,
        [CLI, "check", "--content", join(dir, "content"), "--fixtures", join(dir, "fixtures")],
        { encoding: "utf8" },
      );
      assert.equal(run.status, 1, run.stdout);
      assert.match(run.stdout, /✖ 1 error/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("prints one line per fixture for a lesson", () => {
    const run = spawnSync(process.execPath, [CLI, "fixtures", "--lesson", "6"], { encoding: "utf8" });
    assert.equal(run.status, 0, run.stdout + run.stderr);
    assert.match(run.stdout, /06-round-markup — ROUND: money to two decimals/);
    assert.match(run.stdout, /✓ =ROUND\(SUM\(B2:B4\)\*1\.08,2\)\s+accepted/);
    assert.match(run.stdout, /· =ROUND\(B2\*1\.08,2\)\s+rejected \(func-sum\)/);
  });
});

describe("content-lint: the route list matches the site", () => {
  it("uses the bases the two builds actually publish", () => {
    const [canonical, legacy] = LESSON_BASES;
    const site = readFileSync(join(ROOT, "lib", "site.js"), "utf8");
    const config = readFileSync(join(ROOT, "next.config.mjs"), "utf8");
    assert.match(site, new RegExp(`LESSON_BASE = "${canonical}"`), "lib/site.js serves a different lesson base");
    assert.match(
      config,
      new RegExp(`source: "${legacy}/:slug", destination: "${canonical}/:slug"`),
      "the legacy base is not redirected onto the canonical one",
    );
  });
});

describe("content-lint: replay", () => {
  it("returns the rows `fixtures` prints, with declared and reported rules side by side", () => {
    const content = loadContent(CONTENT);
    const lesson = content.exercises.find((entry) => entry.id === "01-sum-basics");
    const [screen] = replayFixtures(lesson, { fixturesDir: FIXTURES });
    assert.equal(screen.rows.length, readJson(join(FIXTURES, "01-sum-basics.json")).accepted.length + readJson(join(FIXTURES, "01-sum-basics.json")).rejected.length);
    for (const row of screen.rows) {
      assert.equal(row.result.ok, row.expected === "accept", row.formula);
      if (row.expected === "reject") assert.equal(row.result.rule, row.declared, row.formula);
    }
  });
});

describe("content-lint: missing directories", () => {
  it("fails cleanly when the fixture directory is absent", () => {
    const dir = mkdtempSync(join(tmpdir(), "es-lint-"));
    cpSync(CONTENT, join(dir, "content"), { recursive: true });
    try {
      const report = lintContent(join(dir, "content"), { fixturesDir: join(dir, "nope") });
      assert.equal(report.ok, false);
      assert.equal(report.errors.length, 10, "every lesson is missing its fixtures");
      assert.ok(!existsSync(join(dir, "nope")));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
