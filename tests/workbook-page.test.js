/**
 * A workbook lesson, rendered the way the build renders one.
 *
 * No catalog lesson ships a workbook yet, so the only proof of the server half — the download link,
 * the preview grid, the payload the client grades from, and the docs on a lesson with no formula — is
 * to render a lesson that has one. The content directory is copied to a temp root and one lesson
 * swapped for a workbook lesson, so the shipped catalog, its counts and its goldens stay untouched.
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

/** The shipped lesson, rewritten as a workbook lesson: same docs, screens that ship a sheet. */
function workbookLesson() {
  const raw = JSON.parse(readFileSync(join(CONTENT, "exercises", LESSON), "utf8"));
  return {
    ...raw,
    title: "Total a list you did not type",
    docs: {
      ...raw.docs,
      syntax: "=SUM(B2:B4)",
      // A workbook lesson works no formula on the page, so its reference is prose the page prints.
      reference: "Orders, D4",
      teaches: "Read a total out of a workbook you opened",
      outcome: "Check a total against the file you were sent",
    },
    screens: [
      {
        id: "book-total",
        type: "workbook",
        prompt: "Open the workbook. What does D4 total?",
        answers: ["17.5", "17.50"],
        hints: { value: "D4 adds the two totals above it; each one multiplies its units by its price." },
        sheet: {
          name: "Orders",
          startCell: "A1",
          rows: [
            ["Item", "Units", "Price", "Total"],
            ["Widget", 3, 2.5, "=B2*C2"],
            ["Gadget", 4, 2.5, "=B3*C3"],
            ["Total", null, null, "=SUM(D2:D3)"],
          ],
        },
      },
      {
        id: "book-price",
        type: "workbook",
        prompt: "In the same workbook, what does C2 hold?",
        answers: ["2.5"],
        hints: { value: "It is the price per unit the total was built from." },
        sheet: {
          name: "Orders",
          startCell: "A1",
          rows: [
            ["Item", "Units", "Price", "Total"],
            ["Widget", 3, 2.5, "=B2*C2"],
          ],
        },
      },
    ],
  };
}

function payloadOf(html) {
  return JSON.parse(html.match(/<script type="application\/json" id="exercise-data">([\s\S]*?)<\/script>/)[1]);
}

describe("a workbook lesson page", () => {
  let work;
  let html;

  before(() => {
    work = mkdtempSync(join(tmpdir(), "es-workbook-"));
    cpSync(CONTENT, join(work, "content"), { recursive: true });
    writeFileSync(join(work, "content/exercises", LESSON), `${JSON.stringify(workbookLesson(), null, 2)}\n`);

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

  it("links the file the build writes, in place of the sheet", () => {
    assert.ok(html.includes("workbook-body"), "the shell does not carry the workbook class");
    assert.ok(html.includes('href="/assets/files/sum-basics-book-total.xlsx"'), "the download link is missing");
    assert.ok(html.includes('href="/assets/files/sum-basics-book-price.xlsx"'), "the second screen's link is missing");
    // `download` keeps the file on the page's origin: a click saves it rather than guessing at a viewer.
    assert.match(html, /class="workbook-link" href="[^"]+\.xlsx" download>/);
  });

  it("previews the same rows, as a table rather than a drill grid", () => {
    // A preview is read-only data: if it were a `grid`, the drill's delegated handlers would treat a
    // click on a preview cell as selecting an answer cell the screen does not have.
    assert.ok(html.includes('id="workbook-grid-0"'), "the preview table is missing");
    assert.doesNotMatch(html, /id="workbook-grid-0"[^>]*role="grid"/, "the preview announces itself as an interactive grid");
    assert.doesNotMatch(html, /role="gridcell"[^>]*data-cell="D4"/, "a preview cell is exposed as a grid cell");
    assert.ok(html.includes('aria-label="Orders, preview of the workbook"'), "the preview has no accessible name");
  });

  it("shows the value the file shows, not the formula the row holds", () => {
    // The file recalculates `=SUM(D2:D3)` and opens on 17.5, so a preview that printed the formula text
    // would ask the learner to evaluate it in their head and would not be a preview of a workbook.
    assert.match(html, /data-cell="D4"[^>]*>17\.5</, "the preview prints the formula instead of the value it holds");
    assert.match(html, /data-cell="D2"[^>]*>7\.5</, "a formula that another formula sums was left unevaluated");
    // Scoped to the preview table: the docs legitimately print `=SUM(B2:B4)` as the syntax to learn.
    const grid = html.slice(html.indexOf('id="workbook-grid-0"'), html.indexOf("</table>", html.indexOf('id="workbook-grid-0"')));
    assert.doesNotMatch(grid, />=[A-Z]/, "a cell still reads as a formula");
    // The lesson is still about the formula, so the panel names the ones it computed.
    assert.ok(html.includes("D4 =SUM(D2:D3)"), "the preview hides the formula it computed");
    assert.ok(html.includes("D2 =B2*C2"), "the preview names only the top of a formula chain");
  });

  it("publishes the answers and the first expect, and no cell to fill", () => {
    const [first, second] = payloadOf(html).screens;
    assert.equal(first.type, "workbook");
    assert.deepEqual(first.answers, ["17.5", "17.50"]);
    assert.equal(first.expect.value, "17.5", "the reveal is not the first accepted answer");
    assert.equal(first.answerCell, undefined, "a workbook screen has no answer cell");
    assert.equal(first.grid, undefined, "a workbook screen does not ship a grid");
    assert.equal(first.sheet, undefined, "the client has no use for the rows: they are in the markup");
    assert.equal(second.id, "book-price");
  });

  it("says where the answer goes, and drops the cell chip", () => {
    assert.ok(
      html.includes('<code id="screen-answer-cell">the bar</code>'),
      "the note under the body does not point at the bar",
    );
    assert.match(html, /placeholder="Type your answer"/);
    assert.match(html, /id="ref-chip" hidden/);
  });

  it("hides the worked example, because a workbook lesson works no formula", () => {
    assert.ok(html.includes('id="docs-worked" hidden'), "the worked example is showing on a lesson with no formula");
    assert.ok(html.includes("<code id=\"docs-reference\">Orders, D4</code>"), "the reference is not printed as authored");
  });
});
