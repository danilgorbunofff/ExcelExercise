import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { SCHEMA_VERSION, normalizeLesson, referenceOf, revealOf, screenAt } from "../packages/content/index.js";
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

/** A screen whose answer is shown in a picture: no grid, no rules, just the spellings it accepts. */
const PICTURE = {
  id: "picture-a",
  type: "picture",
  prompt: "Which range should the third argument read?",
  image: "images/xlookup-third-argument.svg",
  alt: "A sheet with a formula bar above it and the third argument underlined.",
  answers: ["B2:B6"],
  hints: { value: "The price lives in column B." },
};

/** A screen answered on the keyboard: one shortcut, in any spelling of it. */
const CHORD = {
  id: "chord-a",
  type: "chord",
  prompt: "Which shortcut inserts a row above the selected cell?",
  keys: ["Mod+Shift+Plus"],
  hints: { value: "Row and column commands live on the Home tab." },
};

/** A screen answered with presses in order: Excel's ribbon access keys. */
const SEQUENCE = {
  id: "sequence-a",
  type: "sequence",
  prompt: "Which keys open the ribbon's number formats without the mouse?",
  steps: ["Alt", "H", "O"],
  hints: { value: "Alt puts the focus on the ribbon, then the tab, then the command." },
};

/** A screen answered from a spreadsheet the lesson ships, with no formula, keys or image of its own. */
const WORKBOOK = {
  id: "book-a",
  type: "workbook",
  prompt: "Open the workbook. What does C4 total?",
  answers: ["7.5"],
  hints: { value: "C4 multiplies the units in column B by the price in C2." },
  sheet: { name: "Orders", startCell: "A1", rows: [["Item", "Units"], ["Widget", 3]] },
};

const workbook = (overrides = {}) => ({ ...WORKBOOK, ...overrides });

/** A lesson with no formula screen names a shortcut where a formula lesson names its formula. */
const SHORTCUT_DOCS = { ...V1.docs, reference: "Mod+Shift+Plus" };

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
        "reference",
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
          screens: [
            screenFrom(V1, { id: "warm-up", reference: "=SUM(B2:B4)" }),
            screenFrom(V1, { id: "main", answerCell: "B5", reference: "=SUM(B2:B4)*2" }),
          ],
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
      assert.equal(referenceOf(lesson, screenAt(lesson, 1)), "=SUM(B2:B4)*2");
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

  describe("a picture screen", () => {
    const picture = (overrides = {}) =>
      v2({ screens: [screenFrom(V1, { reference: V1.docs.reference }), { ...PICTURE, ...overrides }] });
    const throws = (raw, pattern) => assert.throws(() => normalizeLesson(raw, FILE), pattern);

    it("normalises to the answers it accepts, with no grid and no rules", () => {
      const lesson = normalizeLesson(picture(), FILE);
      const screen = screenAt(lesson, 1);

      assert.deepEqual(Object.keys(screen).sort(), ["alt", "answers", "expect", "hints", "id", "image", "prompt", "type"]);
      assert.equal(screen.reference, undefined);
      assert.equal(screen.answerCell, undefined);
      assert.equal(screen.grid, undefined);
      assert.deepEqual(screen.answers, ["B2:B6"]);
      // The player prints `expect.value` when a screen is solved, so it is the first accepted spelling.
      assert.deepEqual(screen.expect, { value: "B2:B6" });
      assert.equal(revealOf(lesson, screen), "B2:B6");
    });

    it("trims the answers it keeps", () => {
      const lesson = normalizeLesson(picture({ answers: ["  B2:B6  ", " the price column "] }), FILE);
      assert.deepEqual(screenAt(lesson, 1).answers, ["B2:B6", "the price column"]);
    });

    it("does not need a reference even when the lesson has several screens", () => {
      // The rule that a multi-screen lesson repeats its reveal per screen is a formula-screen rule.
      assert.doesNotThrow(() => normalizeLesson(picture(), FILE));
    });

    it("rejects an image that is not a path in content/", () => {
      throws(picture({ image: "https://cdn.example.com/sheet.png" }), /image .* must be a path like images\/name\.svg/);
      throws(picture({ image: "images/Sheet With Spaces.png" }), /must be a path like images\/name\.svg/);
    });

    it("rejects a screen with no alt text and one with no answers", () => {
      throws(picture({ alt: "" }), /screens\[1\]\.alt must be a non-empty string/);
      throws(picture({ answers: [] }), /screens\[1\]\.answers must be a non-empty array/);
    });

    it("rejects two spellings that normalise to the same answer", () => {
      throws(
        picture({ answers: ["B2:B6", "$b$2:$b$6"] }),
        /screens\[1\]\.answers\[1\] repeats answers\[0\] once normalised/,
      );
    });

    it("rejects the formula screen's fields and its reveal", () => {
      throws(picture({ grid: V1.grid }), /grid belongs to a formula screen/);
      throws(picture({ answerCell: "B7" }), /answerCell belongs to a formula screen/);
      throws(picture({ expect: { value: 1 } }), /expect belongs to a formula screen/);
      throws(picture({ reference: "=SUM(B2:B6)" }), /reference is a formula screen's reveal/);
    });

    it("rejects a hint filed under a rule a picture screen never reports", () => {
      throws(picture({ hints: { error: "no" } }), /hints\.error is not a failure a picture screen reports/);
    });

    it("keeps the answer fields off a formula screen", () => {
      throws(
        v2({ screens: [screenFrom(V1, { answers: ["B5"] })] }),
        /answers belongs to a picture screen/,
      );
      throws(
        v2({ screens: [screenFrom(V1, { image: PICTURE.image })] }),
        /image belongs to a picture screen/,
      );
    });
  });

  describe("a chord screen", () => {
    const chord = (overrides = {}) => v2({ docs: SHORTCUT_DOCS, screens: [{ ...CHORD, ...overrides }] });
    const throws = (raw, pattern) => assert.throws(() => normalizeLesson(raw, FILE), pattern);

    it("normalises to the keys it accepts, with no grid and no rules", () => {
      const lesson = normalizeLesson(chord(), FILE);
      const screen = screenAt(lesson, 0);

      assert.deepEqual(Object.keys(screen).sort(), ["expect", "hints", "id", "keys", "prompt", "type"]);
      assert.deepEqual(screen.keys, ["Mod+Shift+Plus"]);
      // One string for every solved message and every reveal, whatever the screen type.
      assert.deepEqual(screen.expect, { value: "Ctrl + Shift + +" });
      assert.equal(revealOf(lesson, screen), "Ctrl + Shift + +");
    });

    it("keeps alternative spellings of the same shortcut", () => {
      const screen = screenAt(normalizeLesson(chord({ keys: ["Ctrl+L", "Shift+F10"] }), FILE), 0);
      assert.deepEqual(screen.keys, ["Ctrl+L", "Shift+F10"]);
      assert.equal(screen.expect.value, "Ctrl + L or Shift + F10", "the first spelling leads the reveal");
    });

    it("rejects a shortcut the player could never match", () => {
      throws(chord({ keys: ["Ctrl+"] }), /screens\[0\]\.keys\[0\] "Ctrl\+" has an empty key or modifier/);
      throws(chord({ keys: ["Hyper+L"] }), /keys\[0\] "Hyper\+L" names "hyper"/);
      throws(chord({ keys: [""] }), /screens\[0\]\.keys\[0\] must be a non-empty string/);
      throws(chord({ keys: [] }), /screens\[0\]\.keys must be a non-empty array/);
    });

    it("rejects two spellings that are the same shortcut", () => {
      throws(chord({ keys: ["Ctrl+L", "ctrl+l"] }), /screens\[0\]\.keys\[1\] repeats screens\[0\]\.keys\[0\]/);
    });

    it("rejects the fields the other screen types own", () => {
      throws(chord({ grid: V1.grid }), /grid belongs to a formula screen — a chord screen is graded by its keys alone/);
      throws(chord({ answers: ["B2"] }), /answers belongs to a picture screen/);
      throws(chord({ steps: ["Alt"] }), /steps belongs to a sequence screen/);
      throws(chord({ reference: "=SUM(A1)" }), /reference is a formula screen's reveal/);
    });

    it("rejects a hint filed under a rule a chord screen never reports", () => {
      throws(chord({ hints: { error: "no" } }), /hints\.error is not a failure a chord screen reports/);
    });

    it("keeps a chord's keys off a formula screen and a picture screen", () => {
      assert.throws(
        () => normalizeLesson(v2({ screens: [screenFrom(V1, { keys: ["Mod+L"] })] }), FILE),
        /keys belongs to a chord or sequence screen — a formula screen is graded by its grid/,
      );
      assert.throws(
        () => normalizeLesson(v2({ screens: [{ ...PICTURE, keys: ["Mod+L"] }] }), FILE),
        /keys belongs to a chord or sequence screen — a picture screen is graded by its answers alone/,
      );
    });
  });

  describe("a sequence screen", () => {
    const sequence = (overrides = {}) => v2({ docs: SHORTCUT_DOCS, screens: [{ ...SEQUENCE, ...overrides }] });
    const throws = (raw, pattern) => assert.throws(() => normalizeLesson(raw, FILE), pattern);

    it("normalises to the presses in order, with no grid and no rules", () => {
      const lesson = normalizeLesson(sequence(), FILE);
      const screen = screenAt(lesson, 0);

      assert.deepEqual(Object.keys(screen).sort(), ["expect", "hints", "id", "prompt", "steps", "type"]);
      assert.deepEqual(screen.steps, ["Alt", "H", "O"]);
      assert.deepEqual(screen.expect, { value: "Alt then H then O" });
      assert.equal(revealOf(lesson, screen), "Alt then H then O");
    });

    it("accepts a step that is a chord, and one that is a modifier alone", () => {
      const screen = screenAt(normalizeLesson(sequence({ steps: ["Ctrl+A", "Ctrl+C"] }), FILE), 0);
      assert.deepEqual(screen.steps, ["Ctrl+A", "Ctrl+C"]);
      assert.equal(screen.expect.value, "Ctrl + A then Ctrl + C");
    });

    it("rejects a step that is not a press at all", () => {
      throws(sequence({ steps: [] }), /screens\[0\]\.steps must be a non-empty array/);
      throws(sequence({ steps: ["Alt", "NotAKey"] }), /steps\[1\] "NotAKey" ends on "notakey"/);
      throws(sequence({ steps: ["Mod"] }), /steps\[0\] "Mod" is the platform's primary modifier alone/);
    });

    it("rejects a step that repeats an earlier one", () => {
      throws(sequence({ steps: ["Alt", "alt"] }), /screens\[0\]\.steps\[1\] repeats screens\[0\]\.steps\[0\]/);
    });

    it("rejects the fields the other screen types own", () => {
      throws(sequence({ keys: ["Mod+L"] }), /keys belongs to a chord screen/);
      throws(sequence({ require: V1.require }), /require belongs to a formula screen/);
      throws(sequence({ image: PICTURE.image }), /image belongs to a picture screen/);
    });
  });

  describe("docs for a lesson with no formula screen", () => {
    it("names a shortcut instead of a formula", () => {
      const lesson = normalizeLesson(v2({ docs: SHORTCUT_DOCS, screens: [CHORD] }), FILE);
      assert.equal(lesson.docs.reference, "Mod+Shift+Plus");
    });

    it("leaves the reference unconstrained on a lesson of workbooks alone", () => {
      // A workbook lesson works no formula and presses no keys, so its docs reference is prose the
      // page prints as-is: demanding a formula there would be a rule the page never renders.
      const docs = { ...V1.docs, reference: "Sheet1, A2:A4" };
      const screen = {
        id: "book-a",
        type: "workbook",
        prompt: "Open the workbook and total A2:A4.",
        answers: ["41"],
        sheet: { name: "Sheet1", startCell: "A1", rows: [["Item"], ["Total"]] },
      };
      assert.equal(normalizeLesson(v2({ docs, screens: [screen] }), FILE).docs.reference, "Sheet1, A2:A4");
    });

    it("rejects a reference that is neither, and still demands = when a formula screen exists", () => {
      const shortcutDocs = { ...V1.docs, reference: "NotAKey" };
      assert.throws(
        () => normalizeLesson(v2({ docs: shortcutDocs, screens: [CHORD] }), FILE),
        /docs\.reference "NotAKey" ends on "notakey"/,
      );
      // A lesson with a formula screen keeps the stricter rule, so a typo cannot slip through as a chord.
      assert.throws(
        () => normalizeLesson(v2({ docs: shortcutDocs, screens: [CHORD, screenFrom(V1)] }), FILE),
        /docs\.reference must be a formula starting with =/,
      );
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

    it("rejects a workbook screen that ships no sheet", () => {
      // Nothing else about the screen is wrong, so the message has to name the missing sheet.
      const screen = { id: "book-a", type: "workbook", prompt: "Open the workbook and total A2:A4.", answers: ["41"] };
      throws(v2({ screens: [screen] }), /screens\[0\]\.sheet must be an object with a name, a startCell and rows/);
    });

    it("rejects a sheet on a screen that cannot render it", () => {
      // The sheet would ship as a file while the formula screen dropped it, so this fails at the type
      // boundary instead of leaving an author wondering where their workbook went.
      const sheet = { name: "Sheet1", startCell: "A1", rows: [["Item"]] };
      throws(v2({ screens: [screenFrom(V1, { sheet })] }), /screens\[0\]\.sheet belongs to a workbook screen/);
    });

    it("rejects a workbook screen that reveals a formula", () => {
      throws(
        v2({ screens: [workbook({ reference: "=SUM(B2:B4)" })] }),
        /screens\[0\]\.reference is a formula screen's reveal/,
      );
    });

    it("rejects a sheet whose rows are not the same width", () => {
      throws(
        v2({ screens: [workbook({ sheet: { name: "Sheet1", startCell: "A1", rows: [["Item", "Units"], ["Total"]] } })] }),
        /screens\[0\]\.sheet\.rows\[1\] has 1 cells, expected 2/,
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
