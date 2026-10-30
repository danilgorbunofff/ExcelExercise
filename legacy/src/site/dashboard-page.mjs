/**
 * `/learn` — the dashboard. Server-rendered structure, client-filled numbers: every lesson, its group
 * and its badge slot are in the HTML, so a reader without JavaScript still gets the whole track and a
 * crawler gets a real page. The island (`assets/client/dashboard.js`) then reads the progress record out
 * of `localStorage` and paints the counts, the badges and the up-next recommendation.
 *
 * `/learn/groups/<id>` is the same page for one group: its drills, its count, the same island. The
 * island is safe there because every lookup it makes is guarded — it paints whatever the page has.
 *
 * Both are `noindex`: what they show depends on one browser's storage, so there is nothing for a search
 * engine to rank and nothing worth advertising in a sitemap.
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

/**
 * Intros are authored with a blank line between paragraphs; an HTML `<p>` would collapse the pair into
 * one wall of text, so each becomes its own.
 */
function proseParagraphs(text, className) {
  return (text ?? "")
    .split(/\n{2,}/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p class="${className}">${esc(line)}</p>`)
    .join("\n");
}

/** A meta description wants one line under ~155 characters; an intro is written for a page. */
function shortDescription(text) {
  const first = (text ?? "").split(/\n{2,}/)[0].replace(/\s+/g, " ").trim();
  return first.length <= 155 ? first : `${first.slice(0, 152)}…`;
}

/**
 * One group, with its drills. The dashboard renders this with its own heading; the group page has the
 * title as the page `<h1>` already, so it drops the `<h2>`, drops the repeated intro, and names the
 * section with `aria-label` instead.
 */
function renderGroup({ group, icons, heading = true }) {
  const id = esc(group.id);
  const label = heading ? `aria-labelledby="group-${id}-heading"` : `aria-label="${esc(group.title)}"`;
  const count = `<p class="dash-group-count"><span data-group-count="${id}">0 of ${
    group.entries.length
  }</span> complete</p>`;
  const title = `<a class="dash-group-link" href="/learn/groups/${id}">${esc(group.title)}</a>`;
  const head = heading ? `<h2 id="group-${id}-heading">${title}</h2>\n            ${count}` : count;
  const intro = heading ? `\n          ${proseParagraphs(group.intro, "dash-group-intro")}` : "";
  return `        <section class="dash-group" id="group-${id}" ${label}>
          <div class="dash-group-head">
            ${head}
          </div>${intro}
          <ol class="lesson-list">
${group.entries.map((entry) => renderRow({ entry, icons })).join("\n")}
          </ol>
        </section>`;
}

function renderGroups({ groups, icons }) {
  return groups.map((group) => renderGroup({ group, icons })).join("\n");
}

/**
 * The track's groups with their drills attached, in track order, minus any group left empty.
 * `/learn`, every `/learn/groups/<id>` page and `scripts/check-next-pages.mjs` all start here, so the
 * three cannot disagree about which groups exist.
 */
export function dashboardGroups({ track, index }) {
  return track.groups
    .map((group) => ({ ...group, entries: index.filter((entry) => entry.group === group.id) }))
    .filter((group) => group.entries.length > 0);
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

export function prepareDashboardPage({ config, track, index, icons = {}, clientAvailable = false, group }) {
  const groups = dashboardGroups({ track, index });
  const island = clientAvailable ? '\n  <script type="module" src="/assets/client/dashboard.js"></script>' : "";

  if (group !== undefined) {
    const single = groups.find((candidate) => candidate.id === group);
    if (!single) throw new Error(`prepareDashboardPage: no group "${group}" in the track`);

    const body = `<main class="shell dashboard" id="main">
      <p class="dash-back"><a class="link-btn" href="/learn">All groups</a></p>

      <div class="page-head">
        <p class="eyebrow">Group</p>
        <h1>${esc(single.title)}</h1>
      </div>

${proseParagraphs(single.intro, "dash-group-intro")}

      <p class="gate-note dash-legend">Stale is a drill you finished over two weeks ago. Needs practice is one that took a hint, or more than one try.</p>

${renderGroup({ group: single, icons, heading: false })}

      <script type="application/json" id="dashboard-data">${jsonScript(planPayload(index))}</script>
    </main>${island}`;

    return {
      body,
      page: {
        path: `/learn/groups/${single.id}`,
        title: single.title,
        description: shortDescription(single.intro) || `The ${single.entries.length} drills in ${single.title}, in order.`,
        counter: `${single.entries.length} drill${single.entries.length === 1 ? "" : "s"}`,
        bodyClass: "dashboard-page",
        skipLabel: "group",
        noindex: true,
      },
    };
  }

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
    </main>${island}`;

  return {
    body,
    page: {
      path: "/learn",
      title: "Your progress",
      description: "What you have finished, what wants another look, and which drill to open next.",
      counter: `${total} drills`,
      bodyClass: "dashboard-page",
      skipLabel: "dashboard",
      noindex: true,
    },
  };
}

export function renderDashboardPage(args) {
  const { body, page } = prepareDashboardPage(args);
  return renderDocument({ config: args.config, page, body, icons: args.icons });
}
