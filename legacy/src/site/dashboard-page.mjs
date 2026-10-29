/**
 * `/learn` — the dashboard. Server-rendered structure, client-filled numbers: every lesson, its group
 * and its badge slot are in the HTML, so a reader without JavaScript still gets the whole track and a
 * crawler gets a real page. The island (`assets/client/dashboard.js`) then reads the progress record out
 * of `localStorage` and paints the counts, the badges and the up-next recommendation.
 *
 * The page is `noindex`: what it shows depends on one browser's storage, so there is nothing for a
 * search engine to rank and nothing worth advertising in a sitemap.
 */

import { attrs, esc, inlineIcon, jsonScript } from "./html.mjs";
import { BADGE_LABELS, nextCopy, summaryLine } from "./packages.mjs";
import { renderByline, renderDocument } from "./shell.mjs";

function renderRow({ entry, icons }) {
  const number = String(entry.number).padStart(2, "0");
  const trial = entry.free
    ? ""
    : ` <span class="chip chip-trial">${inlineIcon(icons.lock, { size: 11, className: "icon icon-lock" })}Trial</span>`;
  return `            <li${attrs({
    class: "lesson-row",
    "data-lesson": entry.exercise.id,
    "data-badge": "not_started",
    "data-gated": entry.free ? "false" : "true",
  })}>
              <a class="lesson-link" href="${esc(entry.path)}">
                <span class="row-num" aria-hidden="true">${number}</span>
                <span class="row-body">
                  <span class="row-title">${esc(entry.exercise.title)}${trial}</span>
                  <span class="row-outcome">${esc(entry.exercise.docs.outcome)}</span>
                </span>
                <span class="row-meta"><span class="badge-pill" data-badge-for>${BADGE_LABELS.not_started}</span></span>
              </a>
            </li>`;
}

function renderGroups({ groups, icons }) {
  return groups
    .map(
      (group) => `        <section class="dash-group" id="group-${esc(group.id)}" aria-labelledby="group-${esc(
        group.id,
      )}-heading">
          <div class="dash-group-head">
            <h2 id="group-${esc(group.id)}-heading">${esc(group.title)}</h2>
            <p class="dash-group-count"><span data-group-count="${esc(group.id)}">0 of ${
              group.entries.length
            }</span> complete</p>
          </div>
          <p class="dash-group-intro">${esc(group.intro ?? "")}</p>
          <ol class="lesson-list">
${group.entries.map((entry) => renderRow({ entry, icons })).join("\n")}
          </ol>
        </section>`,
    )
    .join("\n");
}

/** The data the island needs, and nothing else: the plan in order, with the group each lesson is in. */
function planPayload(index) {
  return {
    plan: index.map((entry) => ({
      id: entry.exercise.id,
      number: entry.number,
      title: entry.exercise.title,
      path: entry.path,
      group: entry.group,
    })),
  };
}

export function prepareDashboardPage({ config, track, index, icons = {}, clientAvailable = false }) {
  const groups = track.groups
    .map((group) => ({ ...group, entries: index.filter((entry) => entry.group === group.id) }))
    .filter((group) => group.entries.length > 0);

  const first = index[0];
  const upNext = nextCopy({ next: planPayload(index).plan[0], nextReason: "start" });
  const total = index.length;

  const body = `<main class="shell dashboard" id="main">
      <div class="page-head">
        <p class="eyebrow">Your progress</p>
        <h1>Where you are</h1>
        <p class="lede">Every drill you finish is remembered in this browser and nowhere else. This page reads that record and tells you what to open next.</p>
        ${renderByline({ config, index })}
      </div>

      <section class="dash-pulse" aria-labelledby="dash-pulse-heading">
        <h2 class="visually-hidden" id="dash-pulse-heading">How far along you are</h2>
        <p class="dash-count"><strong id="dash-complete">0</strong> of <span id="dash-total">${total}</span> drills complete</p>
        <div class="rail-track" aria-hidden="true"><span class="rail-fill" id="dash-fill"></span></div>
        <p class="dash-note" id="dash-note">${esc(summaryLine({ completed: 0, total }))}</p>
        <noscript><p class="gate-note">Finishing a drill needs JavaScript, and so does reading this page's numbers. The drills themselves are listed below.</p></noscript>
      </section>

      <section class="dash-next" aria-labelledby="dash-next-heading">
        <h2 id="dash-next-heading">Up next</h2>
        <p class="dash-next-cta"><a class="btn btn-primary" id="dash-next-link" href="${esc(
          first.path,
        )}"><span id="dash-next-label">${esc(upNext.label)}</span>${inlineIcon(icons["arrow-right"], {
          size: 16,
        })}</a></p>
        <p class="dash-next-why" id="dash-next-why">${esc(upNext.why)}</p>
      </section>

      <p class="gate-note dash-legend">Stale is a drill you finished over two weeks ago. Needs practice is one that took a hint, or more than one try.</p>

${renderGroups({ groups, icons })}

      <section class="dash-recent-section" aria-labelledby="dash-recent-heading">
        <h2 id="dash-recent-heading">Recently finished</h2>
        <ol class="dash-recent" id="dash-recent"><li class="dash-recent-empty">Nothing finished yet. The first drill is one formula and about two minutes.</li></ol>
      </section>

      <section class="dash-reset" id="dash-reset-section" aria-labelledby="dash-reset-heading" hidden>
        <h2 id="dash-reset-heading">Start clean</h2>
        <p>Progress lives only in this browser, so resetting deletes it for good. There is no copy anywhere to restore.</p>
        <p class="cta-row"><button class="btn" type="button" id="dash-reset">Reset progress</button></p>
        <p class="gate-note" id="dash-reset-note" role="status" aria-live="polite"></p>
      </section>

      <script type="application/json" id="dashboard-data">${jsonScript(planPayload(index))}</script>
    </main>${clientAvailable ? '\n  <script type="module" src="/assets/client/dashboard.js"></script>' : ""}`;

  return {
    body,
    page: {
      path: "/learn",
      title: "Your progress",
      description: "What you have finished, what wants another look, and which drill to open next.",
      counter: `${total} drills`,
      bodyClass: "dashboard-page",
      skipLabel: "Skip to the dashboard",
      noindex: true,
    },
  };
}

export function renderDashboardPage(args) {
  const { body, page } = prepareDashboardPage(args);
  return renderDocument({ config: args.config, page, body, icons: args.icons });
}
