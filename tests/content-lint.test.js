import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { LESSON_BASES, lintContent, replayFixtures } from "../packages/content-lint/index.js";
import { loadContent } from "../packages/content/index.js";

import { toV1 } from "./lessons.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CONTENT = join(ROOT, "legacy", "content");

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const writeJson = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);

const messages = (report) => report.errors.map(({ where, message }) => (where ? `${where}: ${message}` : message));

/**
 * Copies the real content into a temp directory so a test can break one thing and see exactly one
 * error. The shipped corpus carries its fixtures inline, so `fixtures` is a path that does not exist
 * unless a test creates it to prove the v1 sidecar contract still reads. Cleanup is unconditional.
 */
function sandbox(mutate, { persist = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "es-lint-"));
  const content = join(dir, "content");
  const fixtures = join(dir, "fixtures");
  cpSync(CONTENT, content, { recursive: true });
  mutate?.({ content, fixtures, dir });
  const report = lintContent(content, { fixturesDir: fixtures });
  if (!persist) rmSync(dir, { recursive: true, force: true });
  return { report, content, fixtures, dir };
}

const lessonPath = (content, id) => join(content, "exercises", `${id}.json`);

/** File numbers are dense, so the next lesson a scaffold can write is one past the count it finds. */
const nextNumber = (content) => readJson(join(content, "track.json")).lessons.filter((entry) => entry.id).length + 1;
const sidecarPath = (fixtures, id) => join(fixtures, `${id}.json`);

/** Rewrites one lesson, handing the test its first screen — where v2 keeps the prompt and fixtures. */
function editScreen(content, id, edit) {
  const path = lessonPath(content, id);
  const lesson = readJson(path);
  const [first, ...rest] = lesson.screens;
  writeJson(path, { ...lesson, screens: [edit(first), ...rest] });
}

function editFixtures(content, id, edit) {
  editScreen(content, id, (screen) => ({ ...screen, fixtures: edit(screen.fixtures) }));
}

/** Moves a lesson back to the v1 shape with its fixtures in a sidecar, for the deprecation window. */
function revertToV1(content, fixtures, id) {
  const lesson = readJson(lessonPath(content, id));
  const { accept, reject } = lesson.screens[0].fixtures;
  mkdirSync(fixtures, { recursive: true });
  writeJson(sidecarPath(fixtures, id), { accepted: accept, rejected: reject });
  writeJson(lessonPath(content, id), toV1(lesson));
  return sidecarPath(fixtures, id);
}

describe("content-lint: the real corpus", () => {
  const { report } = sandbox();

  it("passes, with every fixture agreeing with the grader", () => {
    assert.deepEqual(report.errors, []);
    assert.equal(report.ok, true);
  });

  it("replays the fixtures each screen declares inline", () => {
    const screens = readdirSync(join(CONTENT, "exercises"))
      .filter((name) => name.endsWith(".json"))
      .flatMap((name) => readJson(join(CONTENT, "exercises", name)).screens);
    const accepted = screens.reduce((sum, screen) => sum + screen.fixtures.accept.length, 0);
    const rejected = screens.reduce((sum, screen) => sum + screen.fixtures.reject.length, 0);
    assert.equal(report.stats.lessons, screens.length, "one lesson file per lesson");
    assert.equal(report.stats.screens, screens.length, "each lesson has one screen so far");
    assert.equal(report.stats.accepted, accepted);
    assert.equal(report.stats.rejected, rejected);
    assert.ok(accepted >= screens.length && rejected >= screens.length);
  });

  it("warns about nothing worse than prompt style", () => {
    assert.ok(report.warnings.every(({ message }) => /sentences/.test(message)), report.warnings.map(({ message }) => message).join("\n"));
  });

  it("ships an intro for every one of the sixteen groups", () => {
    const intros = readJson(join(CONTENT, "track.json")).groups.map(({ id, intro }) => ({ id, words: intro.trim().split(/\s+/).length }));
    assert.deepEqual(intros.filter(({ words }) => words < 150 || words > 250).map(({ id }) => id), [], "intros are 150–250 words: landing copy, not a caption");
    assert.equal(intros.length, 16);
  });

  it("reports the catalog the lessons sit in", () => {
    assert.equal(report.stats.groups, 16);
    assert.equal(report.stats.planned, 88 - report.stats.lessons, "every slot is either authored or planned");
  });
});

describe("content-lint: fixtures", () => {
  it("fails a screen with no fixtures at all", () => {
    const { report } = sandbox(({ content }) => {
      editScreen(content, "03-countif-open-tickets", ({ fixtures, ...screen }) => screen);
    });
    const found = messages(report);
    assert.equal(found.length, 1, found.join("\n"));
    assert.match(found[0], /has no fixtures/);
  });

  it("fails a screen below the six-and-six floor", () => {
    const { report } = sandbox(({ content }) => {
      editFixtures(content, "01-sum-basics", (fixtures) => ({ ...fixtures, accept: fixtures.accept.slice(0, 5) }));
    });
    assert.match(messages(report).join("\n"), /has 5 accepted fixtures, the floor is 6/);
  });

  it("fails a formula the lesson calls accepted but the grader rejects", () => {
    const { report } = sandbox(({ content }) => {
      editFixtures(content, "01-sum-basics", (fixtures) => ({ ...fixtures, accept: [...fixtures.accept, "=AVERAGE(B2:B4)"] }));
    });
    assert.match(messages(report).join("\n"), /accepts "=AVERAGE\(B2:B4\)" but the grader rejects it \(func-sum/);
  });

  it("fails a formula the lesson calls rejected but the grader accepts", () => {
    const { report } = sandbox(({ content }) => {
      editFixtures(content, "01-sum-basics", (fixtures) => ({
        ...fixtures,
        reject: [...fixtures.reject, { formula: "=SUM(B2:B4)", rule: "value", why: "wrong" }],
      }));
    });
    assert.match(messages(report).join("\n"), /rejects "=SUM\(B2:B4\)" but the grader accepts it/);
  });

  it("fails a rejection filed under a rule the grader does not report", () => {
    const { report } = sandbox(({ content }) => {
      editFixtures(content, "01-sum-basics", (fixtures) => ({
        ...fixtures,
        reject: fixtures.reject.map((entry, index) => (index === 1 ? { ...entry, rule: "value" } : entry)),
      }));
    });
    assert.match(messages(report).join("\n"), /filed under "value" but the grader reports "func-sum"/);
  });

  it("fails a rejection that does not ship its rule and reason", () => {
    const { report } = sandbox(({ content }) => {
      editFixtures(content, "01-sum-basics", (fixtures) => ({
        ...fixtures,
        reject: [...fixtures.reject.slice(1), "=B2+B4"],
      }));
    });
    assert.match(
      messages(report).join("\n"),
      /"=B2\+B4" needs \{ formula, rule, why \} with a why of at least 15 characters/,
    );
  });

  it("fails a rejection whose why is too short to explain anything", () => {
    const { report } = sandbox(({ content }) => {
      editFixtures(content, "01-sum-basics", (fixtures) => ({
        ...fixtures,
        reject: fixtures.reject.map((entry, index) => (index === 1 ? { ...entry, why: "wrong" } : entry)),
      }));
    });
    assert.match(messages(report).join("\n"), /a why of at least 15 characters/);
  });

  it("fails a rule the lesson can report that no fixture ever triggers", () => {
    const { report } = sandbox(({ content }) => {
      editFixtures(content, "01-sum-basics", (fixtures) => ({
        ...fixtures,
        reject: fixtures.reject.filter((entry) => entry.rule !== "func-sum"),
      }));
    });
    assert.match(messages(report).join("\n"), /never exercises the "func-sum" failure/);
  });

  it("fails a fixture file that belongs to no lesson", () => {
    const { report } = sandbox(({ fixtures }) => {
      mkdirSync(fixtures, { recursive: true });
      writeJson(sidecarPath(fixtures, "11-ghost"), { accepted: [], rejected: [] });
    });
    assert.match(messages(report).join("\n"), /tests\/fixtures\/11-ghost\.json: belongs to no lesson/);
  });

  it("refuses two sources of truth for one screen", () => {
    const { report } = sandbox(({ content, fixtures }) => {
      const { accept, reject } = readJson(lessonPath(content, "01-sum-basics")).screens[0].fixtures;
      mkdirSync(fixtures, { recursive: true });
      writeJson(sidecarPath(fixtures, "01-sum-basics"), { accepted: accept, rejected: reject });
    });
    assert.match(messages(report).join("\n"), /declares fixtures inline and in tests\/fixtures/);
  });

  it("reports an unreadable fixture file once, not as missing fixtures", () => {
    const { report } = sandbox(({ content, fixtures }) => {
      writeFileSync(revertToV1(content, fixtures, "01-sum-basics"), "{ not json");
    });
    const found = messages(report);
    assert.equal(found.length, 1, found.join("\n"));
    assert.match(found[0], /tests\/fixtures\/01-sum-basics\.json: is not readable JSON/);
  });
});

describe("content-lint: fixture sources", () => {
  it("still reads a v1 lesson whose fixtures live in a sidecar", () => {
    const { report } = sandbox(({ content, fixtures }) => revertToV1(content, fixtures, "01-sum-basics"));
    assert.deepEqual(report.errors, []);
    assert.equal(report.ok, true);
  });

  it("fails a v2 lesson whose fixtures are still in the sidecar", () => {
    const { report } = sandbox(({ content, fixtures }) => {
      const id = "01-sum-basics";
      const lesson = readJson(lessonPath(content, id));
      const { fixtures: moved, ...screen } = lesson.screens[0];
      mkdirSync(fixtures, { recursive: true });
      writeJson(sidecarPath(fixtures, id), { accepted: moved.accept, rejected: moved.reject });
      writeJson(lessonPath(content, id), { ...lesson, screens: [screen] });
    });
    assert.match(messages(report).join("\n"), /is schemaVersion 2 but its fixtures are still in tests\/fixtures/);
  });
});

describe("content-lint: prompts and links", () => {
  it("fails a prompt copy-pasted from another lesson", () => {
    const { report } = sandbox(({ content }) => {
      const first = readJson(lessonPath(content, "01-sum-basics")).screens[0].prompt;
      editScreen(content, "02-average-scores", (screen) => ({ ...screen, prompt: `  ${first.toUpperCase()} ` }));
    });
    assert.match(messages(report).join("\n"), /prompt is a duplicate of the one in content\/exercises\/01-sum-basics\.json/);
  });

  it("warns, but does not fail, when a prompt is two sentences", () => {
    const { report } = sandbox(({ content }) => {
      editScreen(content, "01-sum-basics", (screen) => ({ ...screen, prompt: "Add up the column. Keep it short." }));
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

  it("fails once when groups that hold published lessons lose their intro", () => {
    const { report } = sandbox(({ content }) => {
      editTrack(content, (track) => ({
        ...track,
        groups: track.groups.map(({ id, title }) => ({ id, title })),
      }));
    });
    const intros = report.errors.filter(({ message }) => message.includes("no intro"));
    assert.equal(intros.length, 1);
    assert.match(intros[0].message, /^9 groups with published lessons and no intro: sum, count, statistical, logical, rounding, lookup, index-match, text-search, capstone$/);
  });

  it("asks for no copy from a group whose lessons are all still planned", () => {
    const { report } = sandbox(({ content }) => {
      editTrack(content, (track) => ({
        ...track,
        groups: track.groups.map((group) => (group.id === "text-change" ? { id: group.id, title: group.title } : group)),
      }));
    });
    assert.deepEqual(report.errors, []);
    assert.equal(report.warnings.filter(({ message }) => message.includes("intro")).length, 0);
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
    const { stats } = lintContent(CONTENT);
    assert.match(
      run.stdout,
      new RegExp(
        `content: ${stats.lessons} of 88 catalogued lessons, 16 groups, ${stats.screens} screens, ${stats.accepted + stats.rejected} fixtures replayed`,
      ),
    );
    assert.match(run.stdout, /✓ content passes/);
  });

  it("exits 1 when a fixture disagrees with the grader", () => {
    const { dir } = sandbox(({ content }) => {
      editFixtures(content, "01-sum-basics", (fixtures) => ({ ...fixtures, accept: [...fixtures.accept, "=SUM(B2:B3)"] }));
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

describe("content-lint: the authoring CLI", () => {
  const CLI = join(ROOT, "packages", "content-lint", "cli.js");
  const run = (args, { content, fixtures }) =>
    spawnSync(process.execPath, [CLI, ...args, "--content", content, "--fixtures", fixtures], { encoding: "utf8" });

  /** A sandbox the CLI is allowed to write into, with cleanup whatever the assertions do. */
  function withSandbox(body, mutate) {
    const { dir } = sandbox(mutate, { persist: true });
    try {
      return body({ content: join(dir, "content"), fixtures: join(dir, "fixtures") });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  it("scaffolds a lesson that passes the gate with no edits", () => {
    withSandbox(({ content, fixtures }) => {
      const before = readJson(join(content, "track.json"));
      const slot = before.lessons.findIndex((entry) => !entry.id && entry.group === "lookup");
      const number = nextNumber(content);
      const created = run(["new", "--lesson", String(number), "--group", "lookup"], { content, fixtures });
      assert.equal(created.status, 0, created.stdout + created.stderr);
      assert.match(created.stdout, new RegExp(`✓ created content\\/exercises\\/${number}-[a-z0-9-]+\\.json`));
      assert.match(
        created.stdout,
        new RegExp(`takes catalog slot ${slot + 1}, published as lesson ${before.lessons.slice(0, slot).filter((entry) => entry.id).length + 1} of ${number}`),
      );

      const track = readJson(join(content, "track.json"));
      const id = track.lessons[slot].id;
      assert.match(id, new RegExp(`^${number}-`), "the file is named after the number it was given");
      assert.deepEqual(track.lessons[slot], { id, group: "lookup" }, "the slot became the authored lesson");

      const lesson = readJson(lessonPath(content, id));
      assert.equal(lesson.schemaVersion, 2, "new lessons ship in the v2 shape");
      assert.equal(lesson.title, before.lessons[slot].title, "the slot's title, not a copy");
      assert.equal(lesson.level, before.lessons[slot].level, "the slot's level");
      assert.equal(lesson.screens[0].fixtures.accept.length + lesson.screens[0].fixtures.reject.length, 13);
      for (const rejection of lesson.screens[0].fixtures.reject) {
        assert.equal(typeof rejection, "object", "a rejection ships its rule and reason, not a bare string");
        assert.ok(rejection.rule, `${rejection.formula}: rejection names the rule it expects`);
        assert.ok(rejection.why.length >= 15, `${rejection.formula}: the reason is a sentence`);
      }

      const check = run(["check"], { content, fixtures });
      assert.equal(check.status, 0, check.stdout);
      assert.match(check.stdout, new RegExp(`content: ${number} of 88 catalogued lessons, 16 groups, ${number} screens, `));
    });
  });

  it("takes the next free number when --lesson is omitted, and refuses one that skips it", () => {
    withSandbox(({ content, fixtures }) => {
      const number = nextNumber(content);
      const skipped = run(["new", "--lesson", String(number + 3)], { content, fixtures });
      assert.equal(skipped.status, 2);
      assert.match(skipped.stderr, new RegExp(`lesson ${number + 3} cannot be created — ${number} is the next free number`));

      const bare = run(["new"], { content, fixtures });
      assert.equal(bare.status, 0, bare.stdout + bare.stderr);
      assert.match(bare.stdout, new RegExp(`✓ created content\\/exercises\\/${number}-what-a-formula-actually-does\\.json`));
    });
  });

  it("refuses a group the catalog does not have", () => {
    withSandbox(({ content, fixtures }) => {
      const created = run(["new", "--group", "nope"], { content, fixtures });
      assert.equal(created.status, 2);
      assert.match(created.stderr, /no group "nope" — the catalog has intro, sum, count, statistical/);
      assert.ok(!existsSync(lessonPath(content, "11-nope")), "a refused scaffold writes nothing");
    });
  });

  it("refuses a group whose slots are all written", () => {
    withSandbox(
      ({ content, fixtures }) => {
        const created = run(["new", "--group", "rounding"], { content, fixtures });
        assert.equal(created.status, 2);
        assert.match(created.stderr, /group "rounding" has no planned slots left/);
      },
      ({ content }) => {
        const path = join(content, "track.json");
        const track = readJson(path);
        writeJson(path, { ...track, lessons: track.lessons.filter((entry) => entry.id || entry.group !== "rounding") });
      },
    );
  });

  it("previews a lesson as its page will read it", () => {
    withSandbox(({ content, fixtures }) => {
      const number = nextNumber(content);
      const created = run(["new", "--lesson", String(number), "--group", "lookup"], { content, fixtures });
      assert.equal(created.status, 0, created.stdout + created.stderr);
      const published = Number(/published as lesson (\d+) of/.exec(created.stdout)[1]);
      const preview = run(["preview", "--lesson", String(number)], { content, fixtures });
      assert.equal(preview.status, 0, preview.stdout + preview.stderr);
      assert.match(preview.stdout, new RegExp(`^${published}\\. .* — \\/learn\\/excel\\/`, "m"));
      assert.match(preview.stdout, /\[answer\]/, "the target cell is marked in the grid");
      assert.match(preview.stdout, /answer B4 · grid A1:B4/);
      assert.match(preview.stdout, /✓ =SUM\(B2:B3\)\s+accepted/);
      assert.match(preview.stdout, /· =SUM\(120,180\)\s+rejected \(require-ref\)/);
    });
  });

  it("previews a shipped lesson from its inline fixtures", () => {
    const preview = spawnSync(process.execPath, [CLI, "preview", "--lesson", "6"], { encoding: "utf8" });
    assert.equal(preview.status, 0, preview.stderr);
    assert.match(preview.stdout, /^6\. ROUND: money to two decimals — \/learn\/excel\/round-markup$/m);
    assert.match(preview.stdout, /· =ROUND\(B2\*1\.08,2\)\s+rejected \(func-sum\)/);
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
    const [screen] = replayFixtures(lesson);
    const { accept, reject } = lesson.screens[0].fixtures;
    assert.equal(screen.rows.length, accept.length + reject.length);
    for (const row of screen.rows) {
      assert.equal(row.result.ok, row.expected === "accept", row.formula);
      if (row.expected === "reject") assert.equal(row.result.rule, row.declared, row.formula);
    }
  });
});

describe("content-lint: missing directories", () => {
  it("needs no sidecar directory once every fixture is inline", () => {
    const dir = mkdtempSync(join(tmpdir(), "es-lint-"));
    cpSync(CONTENT, join(dir, "content"), { recursive: true });
    try {
      const report = lintContent(join(dir, "content"), { fixturesDir: join(dir, "nope") });
      assert.deepEqual(report.errors, []);
      assert.ok(!existsSync(join(dir, "nope")), "the linter must not create the directory it reads");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
