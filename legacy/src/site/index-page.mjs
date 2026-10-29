/**
 * The track index. It is the page a search engine lands on, so the promise, the level
 * grouping and every lesson link are in the HTML — not behind a progress bar that only
 * the client can draw.
 */

import { attrs, esc, inlineIcon, jsonScript } from "./html.mjs";
import { LEVELS } from "./content.mjs";
import { renderByline, renderDocument } from "./shell.mjs";

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
                <span class="row-meta"><span class="row-teaches">${esc(exercise.docs.teaches)}</span>${inlineIcon(
                  icons["arrow-right"],
                  { size: 14 },
                )}</span>
              </a>
            </li>`;
}

function renderLevels({ index, icons }) {
  const groups = new Map();
  for (const entry of index) {
    if (!groups.has(entry.exercise.level)) groups.set(entry.exercise.level, []);
    groups.get(entry.exercise.level).push(entry);
  }

  return [...groups.entries()]
    .sort(([a], [b]) => a - b)
    .map(([level, entries]) => {
      const headingId = `level-${level}`;
      return `        <section class="level" aria-labelledby="${headingId}">
          <h2 id="${headingId}">${esc(LEVELS[level])}<span class="level-count">${entries.length} drill${
            entries.length === 1 ? "" : "s"
          }</span></h2>
          <ol class="lesson-list">
${entries.map((entry) => renderLessonRow({ entry, icons })).join("\n")}
          </ol>
        </section>`;
    })
    .join("\n");
}

function courseJsonLd({ config, track, index }) {
  return {
    "@context": "https://schema.org",
    "@type": "Course",
    "@id": `${config.baseUrl}/#${track.id}`,
    name: track.title,
    description: track.promise,
    url: `${config.baseUrl}/`,
    inLanguage: config.inLanguage,
    provider: { "@type": "Organization", name: config.name, url: `${config.baseUrl}/` },
    hasPart: index.map((entry) => ({
      "@type": "LearningResource",
      name: entry.exercise.title,
      description: entry.exercise.docs.outcome,
      url: `${config.baseUrl}${entry.path}`,
      position: entry.number,
      isAccessibleForFree: entry.free,
    })),
  };
}

export function renderIndexPage({ config, track, index, icons = {}, clientAvailable = false }) {
  const first = index[0];
  const gatedFrom = track.freeLessonCount + 1;
  const gateNote =
    track.freeLessonCount < index.length
      ? `<p class="gate-note">Drills 1–${track.freeLessonCount} are open. Drills ${gatedFrom}–${index.length} open with a free trial.</p>`
      : `<p class="gate-note">All ${index.length} drills are open. No signup, ever.</p>`;

  const body = `<main class="shell" id="main">
      <div class="page-head">
        <p class="eyebrow">Excel track · ${index.length} drills</p>
        <h1>${esc(track.title)}</h1>
        <p class="lede">${esc(track.promise)}</p>
        ${renderByline({ config, index })}
      </div>

      <p class="cta-row">
        <a class="btn btn-primary" href="${esc(first.path)}">Start with drill 1 · ${esc(
          first.exercise.title,
        )}${inlineIcon(icons["arrow-right"], { size: 16 })}</a>
      </p>
      ${gateNote}
      <div class="track-progress" id="track-progress" hidden>
        <div class="rail-track" aria-hidden="true"><span class="rail-fill" id="track-fill"></span></div>
        <p class="gate-note" id="track-progress-note"></p>
      </div>

      <section class="how" aria-labelledby="how-heading">
        <h2 id="how-heading">How a drill works</h2>
        <ol class="how-steps">
          <li>Read the task above a small, real spreadsheet.</li>
          <li>Type one formula in the formula bar.</li>
          <li>Check it. The grader names the exact rule you missed, not just "wrong".</li>
        </ol>
        <p class="how-note">Everything runs in your browser: no account, no upload, no waiting for a server to score you.</p>
      </section>

${renderLevels({ index, icons })}
    </main>${clientAvailable ? '\n  <script type="module" src="/assets/client/drill.js"></script>' : ""}`;

  return renderDocument({
    config,
    icons,
    body,
    page: {
      path: "/",
      title: track.title,
      description: track.promise,
      counter: `${index.length} drills`,
      isHome: true,
      bodyClass: "track",
      jsonLd: jsonScript(courseJsonLd({ config, track, index })),
    },
  });
}
