/**
 * The track index. It is the page a search engine lands on, so the promise, the level
 * grouping and every lesson link are in the HTML — not behind a progress bar that only
 * the client can draw.
 *
 * The roster is 86 links, and reading it as one list meant 14,000 pixels of page. They are still all
 * in the document, in `<details>`: a crawler and a reader without JavaScript get every lesson, and a
 * reader with eyes gets three level names and one open list instead of a wall.
 */

import { attrs, esc, inlineIcon } from "./html.mjs";
import { LEVELS } from "./content.mjs";
import { applicationJsonLd, courseJsonLd, jsonLd, siteJsonLd } from "./seo.mjs";
import { renderDocument } from "./shell.mjs";
import { renderSheet } from "./sheet.mjs";

/**
 * One row: number, title, outcome. The `teaches` column and the trailing arrow are gone — a roster's
 * job is choosing, not cataloguing, and both repeated what the title and the outcome already said.
 */
function renderLessonRow({ entry, icons }) {
  const { exercise } = entry;
  const number = String(entry.number).padStart(2, "0");
  const paid = entry.free
    ? ""
    : ` <span class="chip chip-paid">${inlineIcon(icons.lock, { size: 11, className: "icon icon-lock" })}Paid</span>`;
  return `            <li${attrs({
    class: "lesson-row",
    "data-lesson": exercise.id,
    "data-gated": entry.free ? "false" : "true",
  })}>
              <a class="lesson-link" href="${esc(entry.path)}">
                <span class="row-num" aria-hidden="true">${number}</span>
                <span class="row-body">
                  <span class="row-title">${esc(exercise.title)}${paid}</span>
                  <span class="row-outcome">${esc(exercise.docs.outcome)}</span>
                </span>
              </a>
            </li>`;
}

/**
 * Three levels, the first one open. `<summary>` is a native disclosure: keyboard operable, a 48px
 * target, and it costs no JavaScript — and a closed `<details>` still has its links in the HTML.
 */
function renderLevels({ index, icons }) {
  const groups = new Map();
  for (const entry of index) {
    if (!groups.has(entry.exercise.level)) groups.set(entry.exercise.level, []);
    groups.get(entry.exercise.level).push(entry);
  }

  return [...groups.entries()]
    .sort(([a], [b]) => a - b)
    .map(([level, entries], position) => {
      const headingId = `level-${level}`;
      return `        <details class="level"${position === 0 ? " open" : ""}>
          <summary class="level-sum">
            <h3 id="${headingId}">${esc(LEVELS[level])}</h3>
            <span class="level-count">${entries.length} exercise${entries.length === 1 ? "" : "s"}</span>
            ${inlineIcon(icons["arrow-right"], { size: 14, className: "icon level-chevron" })}
          </summary>
          <ol class="lesson-list">
${entries.map((entry) => renderLessonRow({ entry, icons })).join("\n")}
          </ol>
        </details>`;
    })
    .join("\n");
}

/**
 * The proof sheet: a real exercise's grid, in the page a stranger lands on. The promise above it is a
 * claim, and a claim about a spreadsheet is worth nothing without the spreadsheet. It renders as a
 * plain table (`interactive: false`) because it is a picture of the product, not an exercise: a focusable
 * answer cell here would be a control that does nothing.
 *
 * Every string is taken from the lesson's own fixtures — the accepted formula and the grader's own
 * sentence for a near miss — so the hero cannot drift from what the grader actually says.
 *
 * The bar is the page's spine, and it is deliberately *outside* the card: it runs the full width of
 * the shell, under the sheet and the note beside it, so the one piece of spreadsheet furniture the
 * reader is guaranteed to recognise becomes the line the rest of the page hangs from. The card keeps
 * its own head; the hole the bar leaves in it is closed by the card's border.
 */
function renderProof({ entry }) {
  const screen = entry.exercise.screens.find((candidate) => candidate.type === "formula");
  const accept = screen?.fixtures?.accept?.[0];
  const rejects = screen?.fixtures?.reject ?? [];
  // A near miss that runs and is judged on its approach says more than a typo: it is the difference
  // between "wrong" and "here is the rule you broke". Syntax and #DIV/0! are saved for last.
  const order = ["require-ref", "func-sum", "value"];
  const reject =
    order.map((rule) => rejects.find((candidate) => candidate.rule === rule)).find(Boolean) ?? rejects[0];
  if (!accept || !reject) return "";

  return `      <figure class="proof">
        <div class="sheet-card">
          <div class="sheet-head">
            <span class="sheet-name">${esc(entry.exercise.title)}</span>
            <span class="sheet-note">Exercise ${String(entry.number).padStart(2, "0")} · <code>${esc(
              screen.answerCell,
            )}</code></span>
          </div>
          <div class="sheet">
${renderSheet(entry.exercise, screen, { id: "proof-grid", interactive: false, targetCell: null })}
          </div>
        </div>
        <p class="spine">
          <span class="ref-chip">${esc(screen.answerCell)}</span>
          <span class="fx" aria-hidden="true">fx</span>
          <code class="proof-formula">${esc(accept)}</code>
          <span class="spine-status">Accepted</span>
        </p>
        <figcaption class="proof-note">
          <p class="proof-lead">Type <code>${esc(reject.formula)}</code> and the grader answers with the rule it broke:</p>
          <q>${esc(reject.why)}</q>
        </figcaption>
      </figure>

`;
}

/**
 * Which lesson the hero's proof sheet is drawn from. The proof prints a formula screen's own fixtures, so
 * it needs a lesson that has one: a front-of-track lesson with only a workbook screen (which the workbook
 * build test swaps in) would otherwise leave the sheet-card empty. The CTA is not affected — it opens
 * lesson 1, because the first thing a reader does is the first thing in the track. Exported so the
 * post-build verifier asks the same question the renderer asks instead of keeping a second copy of it.
 */
export function proofEntry(index) {
  return index.find((entry) => entry.exercise.screens.some((screen) => screen.type === "formula")) ?? null;
}

/** The index as `<main>` markup plus its head metadata; see `prepareExercisePage` for why. */
export function prepareIndexPage({
  config,
  track,
  index,
  icons = {},
  clientAvailable = false,
  projectsAvailable = false,
  appPagesAvailable = false,
}) {
  const first = index[0];
  const proof = proofEntry(index) ?? first;
  const gated = track.freeLessonCount < index.length;
  // The disclosure belongs next to the Paid chips it explains, not under the CTA. The free ones are a
  // curated set rather than a prefix of the list, so this points at the list that spells them out.
  // One statement of the offer, not two: the paragraph under the level list used to repeat the same
  // "come with the track" sentence straight after this one, and then link the pages that say it again.
  const gateNote = gated
    ? `${track.freeLessonCount} of the ${index.length} are free, with no account and no card. The other ${index.length - track.freeLessonCount} come with a paid plan.`
    : `All ${index.length} exercises are open. No signup, ever.`;

  // The front door, in one column: a poster line, one sentence, two actions, then the product — a real exercise's grid with its formula bar underneath, which is the only thing
  // on the page that is chrome and product at once. The grader's own sentence about a near miss sits
  // beside the sheet on desktop and under the bar below 1024px. Section rhythm is `--s-9`, then the
  // inventory, then the ways out. `main.home` carries the homepage-only composition; DESIGN.md holds
  // the system it belongs to.
  const body = `<main class="shell home" id="main">
      <div class="hero">
        <h1>${esc(track.title)}</h1>
        <p class="lede">${esc(track.promise)}</p>
        <p class="cta-row">
          <a class="btn btn-primary" href="${esc(first.path)}">Start exercise 1${inlineIcon(
            icons["arrow-right"],
            { size: 16 },
          )}</a>
          <a class="btn" href="/learn">Your progress</a>
        </p>
      </div>
${renderProof({ entry: proof })}
      <section class="how how-strip" aria-labelledby="how-heading">
        <h2 id="how-heading">How an exercise works</h2>
        <ol class="how-steps">
          <li>A small spreadsheet is drawn in the page. Nothing is uploaded, and there is no file to open.</li>
          <li>The task names the cell, and you type one formula in the formula bar under the sheet.</li>
          <li>Check it. The grader runs in this browser and names the rule the formula broke: the wrong function, the wrong range, or a typed number where a reference belongs.</li>
        </ol>
      </section>

      <section class="curriculum" aria-labelledby="curriculum-heading">
        <div class="curriculum-head">
          <div class="curriculum-intro">
            <h2 id="curriculum-heading">Browse the exercises</h2>
            <p class="gate-note">${esc(gateNote)}</p>
          </div>
          <div class="track-progress" id="track-progress" hidden>
            <div class="rail-track" aria-hidden="true"><span class="rail-fill" id="track-fill"></span></div>
            <p class="gate-note" id="track-progress-note"></p>
          </div>
        </div>
${renderLevels({ index, icons })}
      </section>
    </main>${clientAvailable ? '\n  <script type="module" src="/assets/client/drill.js"></script>' : ""}`;

  return {
    body,
    page: {
      path: "/",
      title: track.title,
      description: `${index.length} Excel formula exercises, graded in your browser. A wrong answer comes back with the rule it broke. ${track.freeLessonCount} are free, with no account and no card.`,
      isHome: true,
      bodyClass: "track",
      // One graph for the site and the course it publishes: `Organization` answers "who is behind
      // this", `WebSite` "what is this", `Course` "what can I learn here", and `SoftwareApplication`
      // "what do I get for the price". Every lesson's `LearningResource` points back at the course
      // node by `@id`, and the app node answers for the price a reader is actually charged.
      jsonLd: jsonLd(
        siteJsonLd({ config, track }),
        courseJsonLd({ config, track, index }),
        applicationJsonLd({ config }),
      ),
    },
  };
}

export function renderIndexPage(args) {
  const { body, page } = prepareIndexPage(args);
  return renderDocument({
    config: args.config,
    page,
    body,
    icons: args.icons,
    projectsAvailable: args.projectsAvailable,
    appPagesAvailable: args.appPagesAvailable,
  });
}
