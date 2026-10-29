/**
 * A shortcut lesson, rendered the way the build renders one.
 *
 * Chord and sequence screens are authored content, and no catalog lesson uses them yet, so the only
 * way to prove the server half — the markup the client binds to, the payload the client reads, the
 * formula bar and the docs on a lesson with no formula — is to render a lesson that has them. The
 * content directory is copied to a temp root and one lesson swapped for a shortcut lesson, so the
 * shipped catalog, its counts and its goldens stay untouched.
 */
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";

import { readIcons } from "../legacy/src/site/assets.mjs";
import { siteConfig } from "../legacy/src/site/config.mjs";
import { loadContent } from "../legacy/src/site/content.mjs";
import { renderExercisePage } from "../legacy/src/site/exercise-page.mjs";

const ROOT = join(import.meta.dirname, "..");
const CONTENT = join(ROOT, "legacy/content");
const LESSON = "01-sum-basics.json";

/** The shipped lesson, rewritten as a shortcut lesson: same docs, screens that ask for keys. */
function shortcutLesson() {
  const raw = JSON.parse(readFileSync(join(CONTENT, "exercises", LESSON), "utf8"));
  return {
    ...raw,
    title: "Filter without the mouse",
    docs: {
      ...raw.docs,
      syntax: "Ctrl + Shift + L",
      reference: "Ctrl+Shift+L",
      teaches: "Toggle filters on a range with the keyboard",
      outcome: "Filter a column without reaching for a menu",
    },
    screens: [
      {
        id: "chord-1",
        type: "chord",
        prompt: "Turn on filters for the table without touching the mouse.",
        keys: ["ctrl+shift+l"],
        hints: { value: "Filters are the last item of the Data tab's ribbon group." },
      },
      {
        id: "sequence-1",
        type: "sequence",
        prompt: "Reach the number-format menu from the ribbon's access keys.",
        steps: ["alt", "h", "n", "o"],
        hints: { value: "Alt opens the ribbon, then one letter per tab and per item." },
      },
    ],
  };
}

describe("a shortcut lesson page", () => {
  let work;
  let html;

  before(() => {
    work = mkdtempSync(join(tmpdir(), "es-keys-"));
    cpSync(CONTENT, join(work, "content"), { recursive: true });
    writeFileSync(join(work, "content/exercises", LESSON), `${JSON.stringify(shortcutLesson(), null, 2)}\n`);

    const { track, index } = loadContent(join(work, "content"));
    const entry = index.find((item) => item.slug === "sum-basics");
    assert.ok(entry, "the fixture lesson is not in the catalog");
    html = renderExercisePage({
      config: siteConfig({ SITE_BUILT_AT: "2026-10-28" }),
      track,
      index,
      entry,
      icons: readIcons(join(ROOT, "legacy/vendor/icons")),
      clientAvailable: true,
    });
  });

  after(() => {
    rmSync(work, { recursive: true, force: true });
  });

  it("renders the shortcut in place of the sheet", () => {
    assert.ok(html.includes("keys-body"), "the shell does not carry the keys class");
    assert.ok(html.includes('class="keys-panel"'), "no keyboard panel");
    assert.ok(html.includes('tabindex="0"'), "the panel cannot take focus, so the first press lands in the bar");
    // A formula screen's grid and target cell have no counterpart here.
    assert.ok(html.includes("keys-chords"), "the chord list is missing");
    assert.ok(html.includes("keys-steps"), "the sequence list is missing");
  });

  it("publishes every press as a cap the client can relabel", () => {
    // `.press` is what `paintKeys` re-labels: one per chord in the list, one per sequence step.
    const presses = [...html.matchAll(/class="press" data-press="(\d+)"[^>]*aria-label="([^"]+)"/g)].map((match) => match[2]);
    assert.deepEqual(presses, ["Ctrl + Shift + L", "Alt", "H", "N", "O"]);
    assert.ok(html.includes('<kbd class="keycap">Ctrl</kbd>'), "the chord is not printed in words");
    assert.ok(html.includes('<kbd class="keycap">Shift</kbd>'), "the chord lost a key");
  });

  it("ships the presses in the payload and no grid to grade them with", () => {
    const payload = JSON.parse(html.match(/<script type="application\/json" id="exercise-data">([\s\S]*?)<\/script>/)[1]);
    const [chord, sequence] = payload.screens;
    assert.equal(chord.type, "chord");
    assert.deepEqual(chord.keys, ["ctrl+shift+l"]);
    assert.equal(chord.grid, undefined, "a chord screen must not ship a grid");
    assert.equal(chord.answerCell, undefined, "a chord screen has no answer cell");
    assert.equal(chord.expect.value, "Ctrl + Shift + L", "the reveal is not spelled out");
    assert.equal(sequence.type, "sequence");
    assert.deepEqual(sequence.steps, ["alt", "h", "n", "o"]);
    assert.equal(sequence.expect.value, "Alt then H then N then O", "the reveal is not spelled out in order");
  });

  it("tells the learner to answer with the keys", () => {
    assert.ok(html.includes("answer with"), "the head note does not name the keyboard");
    assert.ok(html.includes("or type it in the bar"), "the typed fallback is not offered");
  });

  it("hides the worked example, because a shortcut lesson works no formula", () => {
    assert.ok(html.includes('id="docs-worked" hidden'), "the worked example is showing on a lesson with no formula");
  });
});
