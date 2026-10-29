import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { SCHEMA_VERSION, normalizeLesson, screenAt } from "../packages/content/index.js";
import { readRawLesson, toV1 } from "./lessons.js";

const FILE = "01-sum-basics.json";
/** The same drill written both ways: a v1 lesson (drill flat, fixtures in a sidecar) and the file on disk. */
const V2 = readRawLesson(FILE);
const V1 = toV1(V2);

/** The fields a screen owns in v2, lifted off the v1 lesson so both versions describe the same drill. */
const SCREEN_FIELDS = [
  "prompt",
  "grid",
  "answerCell",
  "expect",
  "require",
  "forbid",
  "requireRef",
  "rules",
  "hints",
  "fixtures",
];

function screenFrom(raw, overrides = {}) {
  const screen = { id: "formula-a", type: "formula" };
  for (const field of SCREEN_FIELDS) if (raw[field] !== undefined) screen[field] = raw[field];
  return { ...screen, ...overrides };
}

/** A v2 lesson carries its drill on the screens and nowhere else — the loader rejects both halves. */
function v2({ screens = [screenFrom(V1)], ...overrides } = {}) {
  const lesson = { ...V1, schemaVersion: 2, ...overrides, screens };
  for (const field of SCREEN_FIELDS) delete lesson[field];
  return lesson;
}

describe("lesson schema v2", () => {
  describe("the v1 compatibility window", () => {
    it("lifts a flat lesson into exactly one formula screen", () => {
      const lesson = normalizeLesson(V1, FILE);

      assert.equal(lesson.schemaVersion, 1);
      assert.equal(lesson.screens.length, 1);
      assert.deepEqual(Object.keys(lesson.screens[0]).sort(), [
        "answerCell",
        "expect",
        "fixtures",
        "forbid",
        "grid",
        "hints",
        "id",
        "prompt",
        "require",
        "requireRef",
        "rules",
        "type",
      ]);
      assert.equal(lesson.screens[0].id, "formula-1");
      assert.equal(lesson.screens[0].type, "formula");
    });

    it("keeps the drill a v1 lesson describes, field for field", () => {
      const screen = normalizeLesson(V1, FILE).screens[0];

      assert.equal(screen.prompt, V1.prompt);
      assert.deepEqual(screen.grid, V1.grid);
      assert.equal(screen.answerCell, V1.answerCell);
      assert.deepEqual(screen.expect, V1.expect);
      assert.deepEqual(screen.require, V1.require);
    });

    it("leaves no per-screen copy at the top level, so nothing can drift", () => {
      const lesson = normalizeLesson(V1, FILE);

      assert.deepEqual(Object.keys(lesson).sort(), [
        "docs",
        "id",
        "level",
        "schemaVersion",
        "screens",
        "slug",
        "title",
      ]);
      assert.equal(lesson.prompt, undefined);
      assert.equal(lesson.answerCell, undefined);
    });
  });

  describe("a v2 lesson", () => {
    it("reads screens from a file with no per-screen field at the top level", () => {
      const lesson = normalizeLesson(v2(), FILE);

      assert.equal(lesson.screens[0].id, "formula-a");
      assert.equal(lesson.screens[0].prompt, V1.prompt);
      assert.equal(lesson.prompt, undefined);
    });

    it("keeps every screen, in order, with its own id and type", () => {
      const lesson = normalizeLesson(
        v2({
          screens: [screenFrom(V1, { id: "warm-up" }), screenFrom(V1, { id: "main", answerCell: "B5" })],
        }),
        FILE,
      );

      assert.equal(lesson.schemaVersion, SCHEMA_VERSION);
      assert.deepEqual(
        lesson.screens.map((screen) => screen.id),
        ["warm-up", "main"],
      );
      assert.equal(screenAt(lesson, 1).answerCell, "B5");
      assert.equal(screenAt(lesson, 0).id, "warm-up");
    });

    it("defaults the optional rule lists so a renderer can read them unguarded", () => {
      const bare = screenFrom(V1, { id: "bare" });
      for (const field of ["forbid", "rules", "hints", "requireRef", "fixtures"]) delete bare[field];

      const lesson = normalizeLesson(v2({ screens: [bare] }), FILE);

      assert.deepEqual(lesson.screens[0].forbid, []);
      assert.deepEqual(lesson.screens[0].rules, []);
      assert.deepEqual(lesson.screens[0].hints, {});
    });

    it("allows the longer prompt the plan reserves for v2 screens", () => {
      // 200 characters: past the v1 160 layout ceiling, inside the v2 220 one.
      const long = "=SUM(A1:A9) totals the column. ".repeat(6).padEnd(200, "x");
      assert.equal(long.length, 200);

      assert.equal(normalizeLesson(v2({ screens: [screenFrom(V1, { prompt: long })] }), FILE).screens[0].prompt, long);

      const asV1 = { ...V1, prompt: long };
      assert.throws(() => normalizeLesson(asV1, FILE), /prompt is 200 characters, limit is 160/);
    });
  });

  describe("rejections", () => {
    const throws = (raw, pattern) => assert.throws(() => normalizeLesson(raw, FILE), pattern);

    it("rejects a schemaVersion it cannot read", () => {
      throws(v2({ schemaVersion: 3 }), /schemaVersion 3 is not 1 or 2/);
    });

    it("rejects screens on a lesson that is not version 2", () => {
      const raws = [
        { ...V1, screens: [screenFrom(V1)] }, // author added screens, forgot the version
        { ...V1, schemaVersion: 1, screens: [screenFrom(V1)] },
      ];
      for (const raw of raws) throws(raw, /screens require schemaVersion 2 .*the screens are ignored/);
    });

    it("rejects a v2 lesson that also keeps a flat copy of a screen field", () => {
      throws({ ...v2(), prompt: "STALE FLAT PROMPT" }, /prompt belongs on a screen once schemaVersion 2 is set/);
      throws({ ...v2(), answerCell: V1.answerCell }, /answerCell belongs on a screen once schemaVersion 2 is set/);
    });

    it("rejects a v2 lesson with no screens", () => {
      const raw = v2();
      delete raw.screens;

      throws(raw, /screens must be a non-empty array \(schemaVersion 2\)/);
    });

    it("rejects duplicate screen ids", () => {
      throws(
        v2({ screens: [screenFrom(V1), screenFrom(V1)] }),
        /screens\[1\]\.id "formula-a" is a duplicate/,
      );
    });

    it("rejects a type outside the schema", () => {
      throws(v2({ screens: [screenFrom(V1, { type: "video" })] }), /screens\[0\]\.type "video" is not one of/);
    });

    it("rejects a known type that cannot be graded yet", () => {
      throws(
        v2({ screens: [screenFrom(V1, { type: "picture" })] }),
        /type "picture" does not render yet — only formula screens can be graded today/,
      );
    });

    it("names the failing screen when a screen is malformed", () => {
      throws(v2({ screens: [screenFrom(V1), screenFrom(V1, { id: "second", require: [] })] }), /screens\[1\]\.require/);
    });

    it("rejects fixtures that are not a list of formulas", () => {
      throws(v2({ screens: [screenFrom(V1, { fixtures: [] })] }), /fixtures must be an object/);
      throws(
        v2({ screens: [screenFrom(V1, { fixtures: { accept: ["=SUM(A1)", ""], reject: [] } })] }),
        /fixtures\.accept\[1\] must be a non-empty string/,
      );
      throws(
        v2({ screens: [screenFrom(V1, { fixtures: { accept: [], reject: [{ why: "no formula" }] } })] }),
        /fixtures\.reject\[0\] must be a non-empty string/,
      );
    });

    it("reads a rejection written with its rule and reason", () => {
      const screen = screenFrom(V1, {
        fixtures: { accept: ["=SUM(B2:B4)"], reject: [{ formula: "=B2+B3", rule: "func-sum", why: "adds by hand" }] },
      });
      const fixtures = normalizeLesson(v2({ screens: [screen] }), FILE).screens[0].fixtures;
      assert.deepEqual(fixtures.reject, [{ formula: "=B2+B3", rule: "func-sum", why: "adds by hand" }]);
    });
  });

  describe("screenAt", () => {
    it("answers null past the last screen instead of throwing", () => {
      const lesson = normalizeLesson(V1, FILE);

      assert.equal(screenAt(lesson, 0).id, "formula-1");
      assert.equal(screenAt(lesson, 1), null);
      assert.equal(screenAt(lesson, -1), null);
    });
  });
});
