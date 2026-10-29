import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, describe, it } from "node:test";

import { build } from "../legacy/src/build.mjs";
import { verify } from "../legacy/src/verify.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ENV = { SITE_URL: "https://drills.example", SITE_BUILT_AT: "2026-10-28" };
const LESSON = "excel/sum-basics.html";

/** Copy the built site so a test can break one file without disturbing the others. */
function copyOf(dist) {
  const copy = mkdtempSync(join(tmpdir(), "es-verify-"));
  cpSync(dist, copy, { recursive: true });
  return copy;
}

function mutate(copy, file, change) {
  const path = join(copy, file);
  const before = readFileSync(path, "utf8");
  const after = change(before);
  assert.notEqual(after, before, `the mutation of ${file} changed nothing`);
  writeFileSync(path, after);
}

describe("verify", () => {
  let dist;
  let result;

  before(() => {
    dist = mkdtempSync(join(tmpdir(), "es-verify-dist-"));
    build({ out: dist, env: ENV, quiet: true });
    result = verify({ dist, env: ENV });
  });

  after(() => {
    rmSync(dist, { recursive: true, force: true });
  });

  it("passes on a clean build", () => {
    assert.deepEqual(result.failures, []);
    assert.ok(result.checks > 100, `expected a thorough check, got ${result.checks}`);
  });

  it("counts every authored lesson page in the catalog", () => {
    const track = JSON.parse(readFileSync(join(ROOT, "legacy/content/track.json"), "utf8"));
    assert.equal(result.pages, track.lessons.filter((lesson) => lesson.id).length);
  });

  it("fails loudly when there is no build to read", () => {
    const missing = verify({ dist: join(tmpdir(), "es-verify-nothing-here"), env: ENV });
    assert.equal(missing.checks, 0);
    assert.equal(missing.failures.length, 1);
    assert.match(missing.failures[0], /npm run build/);
  });

  it("catches a page that lost its docs block", () => {
    const copy = copyOf(dist);
    try {
      mutate(copy, LESSON, (html) => html.replace('id="docs-errors"', 'id="docs-errors-gone"'));
      const failures = verify({ dist: copy, env: ENV }).failures;
      assert.equal(failures.length, 1);
      assert.match(failures[0], /sum-basics\.html docs-errors section/);
    } finally {
      rmSync(copy, { recursive: true, force: true });
    }
  });

  it("catches an empty reference answer", () => {
    const copy = copyOf(dist);
    try {
      mutate(copy, LESSON, (html) => html.replace(/<pre class="reference"><code>[^<]*<\/code><\/pre>/, ""));
      const failures = verify({ dist: copy, env: ENV }).failures;
      assert.equal(failures.length, 1);
      assert.match(failures[0], /sum-basics\.html reference answer/);
    } finally {
      rmSync(copy, { recursive: true, force: true });
    }
  });

  it("catches a payload that no longer parses", () => {
    const copy = copyOf(dist);
    try {
      mutate(copy, LESSON, (html) =>
        html.replace(/(<script type="application\/json" id="exercise-data">)[\s\S]*?(<\/script>)/, '$1{"id":$2'),
      );
      const failures = verify({ dist: copy, env: ENV }).failures;
      assert.ok(failures.some((failure) => /#exercise-data is not valid JSON/.test(failure)), failures.join("\n"));
    } finally {
      rmSync(copy, { recursive: true, force: true });
    }
  });

  it("catches a payload that drifted from the content", () => {
    const copy = copyOf(dist);
    try {
      mutate(copy, LESSON, (html) => html.replace('"answerCell":"B5"', '"answerCell":"B9"'));
      const failures = verify({ dist: copy, env: ENV }).failures;
      assert.equal(failures.length, 1);
      assert.match(failures[0], /payload answerCell is "B9"/);
    } finally {
      rmSync(copy, { recursive: true, force: true });
    }
  });

  it("catches a sitemap that lost a lesson", () => {
    const copy = copyOf(dist);
    try {
      mutate(copy, "sitemap.xml", (xml) =>
        xml.replace(/\s*<url>\s*<loc>[^<]*sum-basics<\/loc>[\s\S]*?<\/url>/, ""),
      );
      const failures = verify({ dist: copy, env: ENV }).failures;
      assert.ok(failures.some((failure) => /sitemap\.xml lists 10 URLs, expected 11/.test(failure)), failures.join("\n"));
      assert.ok(failures.some((failure) => /does not list \/excel\/sum-basics/.test(failure)), failures.join("\n"));
    } finally {
      rmSync(copy, { recursive: true, force: true });
    }
  });

  it("catches a page that lost its task statement", () => {
    const copy = copyOf(dist);
    try {
      // The prompt text also lives in #exercise-data, so only the element can prove the
      // visible task statement survived.
      mutate(copy, LESSON, (html) => html.replace('<p class="task">', '<p class="task-gone">'));
      const failures = verify({ dist: copy, env: ENV }).failures;
      assert.equal(failures.length, 1);
      assert.match(failures[0], /sum-basics\.html prompt/);
    } finally {
      rmSync(copy, { recursive: true, force: true });
    }
  });

  it("catches an index whose heading drifted", () => {
    const copy = copyOf(dist);
    try {
      mutate(copy, "index.html", (html) => html.replace("<h1>Excel formula drills</h1>", "<h1>Drills</h1>"));
      const failures = verify({ dist: copy, env: ENV }).failures;
      assert.equal(failures.length, 1);
      assert.match(failures[0], /index\.html heading/);
    } finally {
      rmSync(copy, { recursive: true, force: true });
    }
  });

  it("catches a third-party origin the build gate missed", () => {
    const copy = copyOf(dist);
    try {
      mutate(copy, LESSON, (html) =>
        html.replace("</head>", '<link rel="stylesheet" href="https://cdn.example.net/x.css">\n</head>'),
      );
      const failures = verify({ dist: copy, env: ENV }).failures;
      assert.equal(failures.length, 1);
      assert.match(failures[0], /cdn\.example\.net/);
    } finally {
      rmSync(copy, { recursive: true, force: true });
    }
  });

  it("catches a protocol-relative origin in a lesson page", () => {
    const copy = copyOf(dist);
    try {
      mutate(copy, LESSON, (html) => html.replace("</head>", '<link rel="stylesheet" href="//cdn.example.net/x.css">\n</head>'));
      const failures = verify({ dist: copy, env: ENV }).failures;
      assert.equal(failures.length, 1);
      assert.match(failures[0], /\/\/cdn\.example\.net/);
    } finally {
      rmSync(copy, { recursive: true, force: true });
    }
  });

  it("catches a protocol-relative origin on the index", () => {
    const copy = copyOf(dist);
    try {
      mutate(copy, "index.html", (html) => html.replace("</head>", '<script src="//cdn.example.net/x.js"></script>\n</head>'));
      const failures = verify({ dist: copy, env: ENV }).failures;
      assert.equal(failures.length, 1);
      assert.match(failures[0], /index\.html refers to/);
    } finally {
      rmSync(copy, { recursive: true, force: true });
    }
  });
});
