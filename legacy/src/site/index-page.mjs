/**
 * The track index. It is the page a search engine lands on, so the promise, the level
 * grouping and every lesson link are in the HTML — not behind a progress bar that only
 * the client can draw.
 *
 * The roster is 88 links, and reading it as one list meant 14,000 pixels of page. They are still all
 * in the document, in `<details>`: a crawler and a reader without JavaScript get every lesson, and a
 * reader with eyes gets three level names and one open list instead of a wall.
 */

import { attrs, esc, inlineIcon } from "./html.mjs";
import { LEVELS } from "./content.mjs";
import { courseJsonLd, jsonLd, siteJsonLd } from "./seo.mjs";
import { renderDocument, renderWaysOut } from "./shell.mjs";
import { renderSheet } from "./sheet.mjs";

/**
 * One row: number, title, outcome. The `teaches` column and the trailing arrow are gone — a roster's
 * job is choosing, not cataloguing, and both repeated what the title and the outcome already said.
 */
function renderLessonRow({ entry, icons }) {
  const { exercise } = entry;
  const number = String(entry.number).padStart(2, "0");
  const trial = entry.free
    ? ""
    : ` <span class="chip chip-trial">${inlineIcon(icons.lock, { size: 11, className: "icon icon-lock" })}Trial</span>`;
  return `            <li${attrs({
    class: "lesson-row",
    "data-lesson": exercise.id,
    "data-gated": entry.free ? "false" : "true",
  })}>
              <a class="lesson-link" href="${esc(entry.path)}">
                <span class="row-num" aria-hidden="true">${number}</span>
                <span class="row-body">
                  <span class="row-title">${esc(exercise.title)}${trial}</span>
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
            <span class="level-count">${entries.length} drill${entries.length === 1 ? "" : "s"}</span>
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
 * The proof sheet: a real drill's grid, in the page a stranger lands on. The promise above it is a
 * claim, and a claim about a spreadsheet is worth nothing without the spreadsheet. It renders as a
 * plain table (`interactive: false`) because it is a picture of the product, not a drill: a focusable
 * answer cell here would be a control that does nothing.
 *
 * Every string is taken from the lesson's own fixtures — the accepted formula and the grader's own
 * sentence for a near miss — so the hero cannot drift from what the grader actually says.
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
            <span class="sheet-note">Drill ${String(entry.number).padStart(2, "0")} · <code>${esc(
              screen.answerCell,
            )}</code></span>
          </div>
          <div class="sheet">
${renderSheet(entry.exercise, screen, { id: "proof-grid", interactive: false, targetCell: null })}
          </div>
          <p class="formula-bar">
            <span class="ref-chip">${esc(screen.answerCell)}</span>
            <span class="fx" aria-hidden="true">fx</span>
            <code class="proof-formula">${esc(accept)}</code>
          </p>
        </div>
        <figcaption class="proof-note">
          Try <code>${esc(reject.formula)}</code> and it answers with the rule, not a red cell:
          <q>${esc(reject.why)}</q>
        </figcaption>
      </figure>

`;
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
  const gated = track.freeLessonCount < index.length;
  // The one fact line under the CTA. It used to be a gate note plus a byline plus a progress line,
  // each saying the same two things in a different order.
  const facts = gated
    ? `${track.freeLessonCount} free, no signup · graded in your browser`
    : `All ${index.length} free, no signup · graded in your browser`;
  // The honest trial disclosure belongs next to the Trial chips it explains, not under the CTA.
  const gateNote = gated
    ? `Drills 1–${track.freeLessonCount} are open. The rest come with a free trial.`
    : `All ${index.length} drills are open. No signup, ever.`;

  const body = `<main class="shell" id="main">
      <div class="hero">
        <div class="hero-copy">
          <h1>${esc(track.title)}</h1>
          <p class="lede">${esc(track.promise)}</p>
          <p class="cta-row">
            <a class="btn btn-primary" href="${esc(first.path)}">Start drill 1${inlineIcon(
              icons["arrow-right"],
              { size: 16 },
            )}</a>
            <a class="btn" href="/learn">Your progress</a>
          </p>
          <p class="facts">${esc(facts)}</p>
        </div>
${renderProof({ entry: first })}      </div>

      <section class="how how-strip" aria-labelledby="how-heading">
        <h2 id="how-heading">How a drill works</h2>
        <ol class="how-steps">
          <li>Read the task above a small, real spreadsheet.</li>
          <li>Type one formula in the formula bar.</li>
          <li>Check it. The grader names the exact rule you missed, not just "wrong".</li>
        </ol>
      </section>

      <section class="curriculum" aria-labelledby="curriculum-heading">
        <div class="curriculum-head">
          <div class="curriculum-intro">
            <h2 id="curriculum-heading">Browse the drills</h2>
            <p class="gate-note">${esc(gateNote)}</p>
          </div>
          <div class="track-progress" id="track-progress" hidden>
            <div class="rail-track" aria-hidden="true"><span class="rail-fill" id="track-fill"></span></div>
            <p class="gate-note" id="track-progress-note"></p>
          </div>
        </div>
${renderLevels({ index, icons })}
      </section>

      ${renderWaysOut({ projectsAvailable, appPagesAvailable })}
    </main>${clientAvailable ? '\n  <script type="module" src="/assets/client/drill.js"></script>' : ""}`;

  return {
    body,
    page: {
      path: "/",
      title: track.title,
      description: track.promise,
      counter: `${index.length} drills`,
      isHome: true,
      bodyClass: "track",
      // One graph for the site and the course it publishes: `Organization` answers "who is behind
      // this", `WebSite` "what is this", `Course` "what can I learn here". Every lesson's
      // `LearningResource` points back at the course node by `@id`.
      jsonLd: jsonLd(siteJsonLd({ config, track }), courseJsonLd({ config, track, index })),
    },
  };
}

export function renderIndexPage(args) {
  const { body, page } = prepareIndexPage(args);
  return renderDocument({ config: args.config, page, body, icons: args.icons });
}
