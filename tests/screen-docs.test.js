/**
 * The notes one screen brings, on a real lesson page.
 *
 * The last drill of the track teaches two XLOOKUP variants on two screens, and the second screen
 * carries its own syntax and formula: the lesson-level docs describe the first one, so a screen with
 * nothing of its own would be teaching the wrong function. The page is rendered from the shipped
 * catalog, because that lesson is the case the feature exists for — a screen's notes are read where
 * the work is, not in a drawer two screens further down.
 */
import assert from "node:assert/strict";
import { join } from "node:path";
import { describe, it } from "node:test";

import { readIcons } from "../legacy/src/site/assets.mjs";
import { siteConfig } from "../legacy/src/site/config.mjs";
import { loadContent } from "../legacy/src/site/content.mjs";
import { renderExercisePage } from "../legacy/src/site/exercise-page.mjs";

const ROOT = join(import.meta.dirname, "..");
const SLUG = "xlookup-search-from-the-bottom";
const { track, index } = loadContent(join(ROOT, "legacy/content"));
const entry = index.find((item) => item.slug === SLUG);
assert.ok(entry, `the catalog has no lesson ${SLUG}`);

const html = renderExercisePage({
  config: siteConfig({ SITE_BUILT_AT: "2026-10-28" }),
  track,
  index,
  entry,
  icons: readIcons(join(ROOT, "legacy/vendor/icons")),
  clientAvailable: true,
});

/** One screen's panel, from its opening tag to the next screen's. */
function panel(position) {
  const start = html.indexOf(`<div data-screen="${position}"`);
  assert.notEqual(start, -1, `the page has no screen ${position}`);
  const end = html.indexOf(`<div data-screen="${position + 1}"`, start);
  return html.slice(start, end === -1 ? html.length : end);
}

describe("a screen with notes of its own", () => {
  it("renders them inside that screen's panel, above the sheet", () => {
    const second = panel(2);
    assert.ok(second.includes('class="screen-docs"'), "the second screen carries no notes");
    assert.ok(second.includes("<code>=XLOOKUP(lookup_value, lookup_array, return_array"), "the syntax is missing");
    assert.ok(second.includes("walks up."), "the explanation is missing");
    // The formula it works is the one this screen asks for, not the first screen's.
    assert.ok(
      second.includes('<pre class="reference"><code>=XLOOKUP(A8,A2:A6,B2:B6,,0,-1)</code></pre>'),
      "the awaited formula is not the one the screen asks for",
    );
    assert.ok(
      second.indexOf('class="screen-docs"') < second.indexOf('id="sheet-1"'),
      "the notes render below the sheet they explain",
    );
  });

  it("says which group of notes it is, for a reader who lands on it out of order", () => {
    assert.match(panel(2), /<aside class="screen-docs" aria-label="About this screen">/);
  });

  it("leaves a screen without notes as it was", () => {
    // Notes are optional: the first screen is described by the lesson block itself.
    assert.equal(panel(1).includes("screen-docs"), false, "a screen with no notes rendered a box anyway");
    assert.equal((html.match(/class="screen-docs"/g) ?? []).length, 1, "more than one screen rendered notes");
  });

  it("hides with the screen it belongs to, so it never flashes in", () => {
    // The notes belong to a panel the player reveals by unhiding it: no script writes them, and the
    // lesson opens on screen 1 with screen 2's notes already out of the flow.
    assert.match(panel(2), /^<div data-screen="2" hidden>/);
    assert.match(panel(1), /^<div data-screen="1">/);
  });

  it("does not duplicate the notes into the drawer or the payload", () => {
    assert.equal((html.match(/id="docs"/g) ?? []).length, 1, "the page grew a second docs block");
    const payload = JSON.parse(html.match(/<script type="application\/json" id="exercise-data">([\s\S]*?)<\/script>/)[1]);
    assert.equal(payload.screens[1].docs, undefined, "the client was shipped prose it never renders");
    assert.equal(payload.screens[1].reference, "=XLOOKUP(A8,A2:A6,B2:B6,,0,-1)");
  });

  it("tells the client how many misses open the answer", () => {
    const payload = JSON.parse(html.match(/<script type="application\/json" id="exercise-data">([\s\S]*?)<\/script>/)[1]);
    assert.equal(payload.track.showAnswerAfter, track.showAnswerAfter);
    assert.equal(payload.track.showAnswerAfter, 3);
  });
});
