/**
 * Renders the parts of a lesson that are also the contract with the phase-5 client:
 * the sheet grid, the formula bar, the feedback region, and the docs block.
 * Everything is server-rendered so the page is readable (and indexable) before any
 * JavaScript arrives. The client only ever fills these in; it never builds structure.
 */

import { addressOf, chordText, indexToCol, labelsOf, parseChord, parsePress, parseRef, referenceOf } from "./packages.mjs";
import { attrs, esc, formatCell, inlineIcon } from "./html.mjs";

function splitCell(address) {
  const parsed = parseRef(address);
  if (!parsed) throw new Error(`sheet: "${address}" is not a cell address`);
  return parsed;
}

/**
 * The sheet: column letters, row numbers, read-only data, one target cell. `id` is per screen,
 * because a lesson may show several sheets and two elements cannot share an id.
 */
export function renderSheet(exercise, screen, { icons = {}, id = "sheet-grid" } = {}) {
  const start = splitCell(screen.grid.startCell);
  const rows = screen.grid.rows;
  const width = rows[0].length;

  const columnHeaders = Array.from({ length: width }, (_, offset) => {
    const letter = indexToCol(start.colIndex + offset);
    return `<th scope="col" role="columnheader" class="col-head">${esc(letter)}</th>`;
  });

  const body = rows.map((row, rowOffset) => {
    const rowNumber = start.row + rowOffset;
    const cells = row.map((value, colOffset) => {
      const address = addressOf(start.colIndex + colOffset, rowNumber);
      if (address === screen.answerCell) {
        return `<td${attrs({
          class: "cell cell-target",
          role: "gridcell",
          "data-cell": address,
          "data-kind": "target",
          tabindex: "0",
          "aria-selected": "true",
          "aria-label": `Answer cell ${address}, empty`,
        })}></td>`;
      }
      const numeric = typeof value === "number" ? " num" : "";
      return `<td${attrs({ class: `cell${numeric}`, role: "gridcell", "data-cell": address, "data-kind": "data" })}>${esc(
        formatCell(value),
      )}</td>`;
    });
    return `<tr role="row"><th scope="row" role="rowheader" class="row-head">${rowNumber}</th>${cells.join("")}</tr>`;
  });

  return `<table${attrs({
    id,
    class: "sheet-grid",
    role: "grid",
    "aria-label": `${exercise.docs.dataset}, read-only data`,
    "aria-rowcount": rows.length + 1,
    // The row-header column is a real column on screen, so it counts here too.
    "aria-colcount": width + 1,
  })}>
          <thead>
            <tr role="row"><td class="corner" aria-hidden="true"></td>${columnHeaders.join("")}</tr>
          </thead>
          <tbody>
            ${body.join("\n            ")}
          </tbody>
        </table>`;
}

/**
 * A picture screen's image. `alt` is the question rather than a caption, so there is no `figcaption`
 * repeating it: a screen reader reads the figure's image and gets the whole prompt in one turn. The
 * image is first-party — `build.mjs` copies `content/images/` onto `/assets/img/`, where this points.
 */
export function imageUrl(path) {
  return `/assets/img/${path.slice("images/".length)}`;
}

export function renderPicture(screen, { position = 0 } = {}) {
  return `<figure class="picture" id="picture-${position}">
                  <img${attrs({
                    class: "picture-img",
                    src: imageUrl(screen.image),
                    alt: screen.alt,
                    loading: "lazy",
                    decoding: "async",
                  })}>
                </figure>`;
}

/**
 * The keycaps of one press, in the order they are held. `data-press` is how the client finds them
 * again: it re-labels every cap for the keyboard in front of the learner, because the server renders
 * the words a Windows keyboard would print.
 */
function renderKeycaps(chord, { press, role }) {
  const caps = labelsOf(chord)
    .map((label) => `<kbd class="keycap">${esc(label)}</kbd>`)
    .join('<span class="key-plus" aria-hidden="true">+</span>');
  return `<span class="press" data-press="${press}" role="${role}" aria-label="${esc(chordText(chord))}">${caps}</span>`;
}

/**
 * A shortcut screen: the presses to make, in the order a learner makes them. The panel is the
 * question's body, so it takes the sheet's place — and it is focusable, because the keys only reach
 * the page while the panel, not the bar, has the focus. Typing in the bar still grades the same
 * shortcut for a browser that will not deliver the keys, and the panel's note says so up front.
 */
export function renderKeys(screen, { position = 0 } = {}) {
  const parse = screen.type === "chord" ? parseChord : parsePress;
  const presses = (screen.type === "chord" ? screen.keys : screen.steps).map(parse);

  if (screen.type === "chord") {
    // Alternative spellings of one shortcut: the learner presses one of them, so they read as "or".
    const chords = presses
      .map((chord, index) => renderKeycaps(chord, { press: index, role: "none" }))
      .join('<span class="key-or">or</span>');
    return `<div class="keys-panel" id="keys-${position}" tabindex="0" role="group" aria-label="Press the shortcut, or type it in the bar">
                  <div class="keys-chords">${chords}</div>
                  <p class="keys-note" id="keys-note-${position}">Press it, or type it in the bar.</p>
                </div>`;
  }

  const steps = presses
    .map(
      (chord, index) =>
        `<li class="keys-step" data-step="${index}">${renderKeycaps(chord, {
          press: index,
          role: "none",
        })}</li>`,
    )
    .join("");
  return `<div class="keys-panel keys-panel-sequence" id="keys-${position}" tabindex="0" role="group" aria-label="Press the keys in order, or type them in the bar">
                  <ol class="keys-steps">${steps}</ol>
                  <p class="keys-note" id="keys-note-${position}">Press the keys in order, or type them in the bar.</p>
                </div>`;
}

/**
 * The formula bar: target chip, input, Check. No control is named, so a submit
 * without JavaScript reloads the page instead of leaking the draft into the URL.
 * A picture screen has no target cell, so the chip keeps its place in the DOM but goes dark:
 * the client toggles it per screen, and removing it would shift the bar on every switch.
 */
export function renderFormulaBar(screen, { icons = {} } = {}) {
  // Only a formula screen answers in a cell; a picture screen answers in words and a shortcut screen
  // in keys. The chip keeps its place in the DOM on all three and goes dark, because the client
  // toggles it per screen and removing it would shift the bar on every switch.
  const hasCell = screen.type === "formula";
  const typed = screen.type === "picture" ? "Type your answer" : "Type the shortcut";
  const label =
    screen.type === "picture"
      ? "Your answer"
      : hasCell
        ? `Your formula for ${screen.answerCell}`
        : screen.type === "sequence"
          ? "Type the keys in order"
          : "Type the shortcut";
  return `<form class="formula-bar" id="formula-bar" method="get">
          <span class="ref-chip" id="ref-chip"${hasCell ? "" : " hidden"}>${esc(screen.answerCell ?? "")}</span>
          <span class="fx" aria-hidden="true">fx</span>
          <input${attrs({
            id: "formula",
            class: "formula-input",
            type: "text",
            inputmode: "text",
            autocomplete: "off",
            autocapitalize: "none",
            autocorrect: "off",
            spellcheck: "false",
            placeholder: hasCell ? "=..." : typed,
            "aria-label": label,
            "aria-describedby": "feedback",
          })}>
          <button class="btn btn-check" id="check" type="submit">${inlineIcon(icons.check, {
            size: 16,
          })}<span>Check</span></button>
        </form>`;
}

/** Reserve the space now so the page does not jump when a verdict appears. */
export function renderFeedback() {
  return `<div class="feedback" id="feedback" role="status" aria-live="polite">
          <p class="feedback-head" id="feedback-head"></p>
          <p class="feedback-body" id="feedback-body"></p>
        </div>`;
}

export function renderHint({ icons = {} } = {}) {
  return `<div class="hint-row">
          <button${attrs({
            type: "button",
            class: "link-btn",
            id: "hint",
            "aria-expanded": "false",
            "aria-controls": "hint-text",
          })}>${inlineIcon(icons.lightbulb, { size: 16 })}<span>Show a hint</span></button>
          <button type="button" class="link-btn link-btn-quiet" id="show-answer" hidden>Show me the answer</button>
          <p class="hint-text" id="hint-text" hidden></p>
        </div>
        <div class="solution" id="solution" hidden>
          <p class="solution-label">Reference answer</p>
          <pre><code id="solution-code"></code></pre>
        </div>`;
}

/**
 * The docs block: what it does, syntax, a worked example, what goes wrong, at work.
 * The worked example is a formula, so it is built from the first formula screen rather than from the
 * screen the page happens to open on — and it starts hidden when the lesson has no formula screen at
 * all, or opens on a screen that is not one.
 */
export function renderDocs(exercise, screen) {
  const docs = exercise.docs;
  const worked = exercise.screens.find((candidate) => candidate.type === "formula") ?? null;
  const reference = worked ? referenceOf(exercise, worked) : exercise.docs.reference;
  const workedHidden = worked === null || screen.type !== "formula";
  const errorRows = docs.errors
    .map((entry) => `            <tr><th scope="row"><code>${esc(entry.code)}</code></th><td>${esc(entry.text)}</td></tr>`)
    .join("\n");

  return `<section class="docs" id="docs" aria-labelledby="docs-what">
        <h2 id="docs-what">What it does</h2>
        <p>${esc(docs.explain)}</p>

        <h2 id="docs-syntax">Syntax</h2>
        <pre class="syntax"><code>${esc(docs.syntax)}</code></pre>

        <h2 id="docs-example">Worked example</h2>
        <div class="worked" id="docs-worked"${workedHidden ? " hidden" : ""}>
          <p>On <em>${esc(docs.dataset)}</em>, <code id="docs-example-code">${esc(reference)}</code> returns <strong id="docs-example-value">${esc(
            worked === null ? "" : formatCell(worked.expect.value),
          )}</strong>.</p>
          <pre class="reference"><code id="docs-reference">${esc(reference)}</code></pre>
        </div>

        <h2 id="docs-errors">Common errors</h2>
        <table class="error-table">
          <caption class="visually-hidden">Error codes for ${esc(docs.teaches)}</caption>
          <thead><tr><th scope="col">Error</th><th scope="col">What it means and how to fix it</th></tr></thead>
          <tbody>
${errorRows}
          </tbody>
        </table>

        <h2 id="docs-work">At work</h2>
        <p>${esc(docs.atWork)}</p>
      </section>`;
}
