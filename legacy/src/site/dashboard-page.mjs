/**
 * `/learn` — the dashboard. Server-rendered structure, client-filled numbers: every lesson, its group
 * and its badge slot are in the HTML, so a reader without JavaScript still gets the whole track and a
 * crawler gets a real page. The island (`assets/client/dashboard.js`) then reads the progress record out
 * of `localStorage` and paints the counts, the badges and the up-next recommendation.
 *
 * `/learn/groups/<id>` is the same page for one group: its intro, its drills, the same island. It is
 * the group's own hub — indexable, in the sitemap, and the page a search for "SUMIF exercises" should
 * land on — because what it says about the skill is the same for every reader. `/learn` stays
 * `noindex`: what it shows is one browser's storage, and there is nothing in it to rank.
 */

import { attrs, esc, inlineIcon, jsonScript } from "./html.mjs";
import { BADGE_LABELS, nextCopy, summaryLine } from "./packages.mjs";
import { breadcrumbJsonLd, clampDescription, groupPath, jsonLd, renderBreadcrumbs } from "./seo.mjs";
import { renderDocument, renderWaysOut } from "./shell.mjs";

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

/**
 * One group as a native disclosure. The title is the link to that group's own page and sits inside the
 * `<summary>`, so the 88 drill links stay in the document while one list is on screen; following the
 * link does not toggle the row (Chromium: the anchor's activation wins), and the summary itself still
 * toggles on click, Enter and Space.
 *
 * The count reads "5 drills" until a drill in it is finished, because "0 of 5" sixteen times over is
 * sixteen lines that say nothing.
 */
function renderTrackGroup({ group, icons }) {
  const id = esc(group.id);
  const total = group.entries.length;
  return `        <details class="dash-group" id="group-${id}" aria-labelledby="group-${id}-heading">
          <summary class="level-sum">
            <h2 id="group-${id}-heading">${esc(group.title)}</h2>
            <span class="level-count" data-group-count="${id}">${total} drill${total === 1 ? "" : "s"}</span>
            ${inlineIcon(icons["arrow-right"], { size: 14, className: "icon level-chevron" })}
          </summary>
          <p class="dash-group-about">
            <a class="dash-group-link" href="/learn/groups/${id}">About this group</a>
          </p>
          <ol class="lesson-list">
${group.entries.map((entry) => renderRow({ entry, icons })).join("\n")}
          </ol>
        </details>`;
}

/**
 * One group on its own page: the title is the page `<h1>` already, so the section drops the `<h2>`,
 * keeps the intro the dashboard no longer carries, and is named with `aria-label` instead.
 */
function renderGroup({ group, icons }) {
  const id = esc(group.id);
  return `        <section class="dash-group" id="group-${id}" aria-label="${esc(group.title)}">
          <p class="dash-group-count"><span data-group-count="${id}">0 of ${
            group.entries.length
          }</span> complete</p>
          <ol class="lesson-list">
${group.entries.map((entry) => renderRow({ entry, icons })).join("\n")}
          </ol>
        </section>`;
}

function renderGroups({ groups, icons }) {
  return `      <div class="dash-groups">
${groups.map((group) => renderTrackGroup({ group, icons })).join("\n")}
      </div>`;
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

export function prepareDashboardPage({
  config,
  track,
  index,
  icons = {},
  clientAvailable = false,
  projectsAvailable = false,
  appPagesAvailable = false,
  group,
}) {
  const groups = dashboardGroups({ track, index });
  const island = clientAvailable ? '\n  <script type="module" src="/assets/client/dashboard.js"></script>' : "";

  if (group !== undefined) {
    const single = groups.find((candidate) => candidate.id === group);
    if (!single) throw new Error(`prepareDashboardPage: no group "${group}" in the track`);

    // The first paragraph is the page's lede; the rest is the body. An intro is authored as two
    // paragraphs for exactly this split, so the page opens with a sentence rather than a wall.
    const [lede, ...rest] = (single.intro ?? "")
      .split(/\n{2,}/)
      .map((line) => line.trim())
      .filter(Boolean);
    const heading = `Excel exercises: ${single.title}`;
    const trail = [
      { href: "/", label: "Excel drills" },
      { href: "/excel-exercises", label: "Excel exercises" },
      { href: groupPath(single.id), label: heading },
    ];
    const drillList = {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: heading,
      numberOfItems: single.entries.length,
      itemListElement: single.entries.map((entry, position) => ({
        "@type": "ListItem",
        position: position + 1,
        name: entry.exercise.title,
        url: `${config.baseUrl}${entry.path}`,
      })),
    };

    const body = `<main class="shell dashboard" id="main">
      ${renderBreadcrumbs({ trail })}

      <div class="page-head">
        <p class="eyebrow">Excel exercises</p>
        <h1>${esc(heading)}</h1>
        ${lede ? `<p class="lede">${esc(lede)}</p>` : ""}
      </div>

${proseParagraphs(rest.join("\n\n"), "dash-group-intro")}

      <p class="dash-back"><a class="link-btn" href="/excel-exercises">All Excel exercises</a></p>

      <p class="gate-note dash-legend">Stale is a drill you finished over two weeks ago. Needs practice is one that took a hint, or more than one try.</p>

${renderGroup({ group: single, icons })}

      <script type="application/json" id="dashboard-data">${jsonScript(planPayload(index))}</script>
    </main>${island}`;

    return {
      body,
      page: {
        path: groupPath(single.id),
        title: heading,
        description:
          clampDescription(single.summary ?? lede) ||
          `The ${single.entries.length} ${single.title.toLowerCase()} drills in order, with the formula each one checks.`,
        counter: `${single.entries.length} drill${single.entries.length === 1 ? "" : "s"}`,
        bodyClass: "dashboard-page",
        skipLabel: "group",
        jsonLd: jsonLd(breadcrumbJsonLd({ config, trail }), drillList),
      },
    };
  }

  const first = index[0];
  const upNext = nextCopy({ next: planPayload(index).plan[0], nextReason: "start" });
  const total = index.length;

  const body = `<main class="shell dashboard" id="main">
      <div class="page-head">
        <h1>Your progress</h1>
        <p class="lede">Every drill you finish is remembered in this browser and nowhere else. This page reads that record and tells you what to open next.</p>
      </div>

      <div class="dash-pulse">
        <p class="dash-count"><strong id="dash-complete">0</strong> of <span id="dash-total">${total}</span> complete</p>
        <div class="rail-track" id="dash-rail" aria-hidden="true" hidden><span class="rail-fill" id="dash-fill"></span></div>
        <p class="dash-note" id="dash-note">${esc(summaryLine({ completed: 0, total }))}</p>
        <p class="dash-next-cta"><a class="btn btn-primary" id="dash-next-link" href="${esc(
          first.path,
        )}"><span id="dash-next-label">${esc(upNext.label)}</span>${inlineIcon(icons["arrow-right"], {
          size: 16,
        })}</a></p>
        <p class="dash-next-why" id="dash-next-why">${esc(upNext.why)}</p>
        <noscript><p class="gate-note">Finishing a drill needs JavaScript, and so does reading this page's numbers. The drills themselves are listed below.</p></noscript>
      </div>

      <p class="gate-note dash-legend" id="dash-legend" hidden>Stale is a drill you finished over two weeks ago. Needs practice is one that took a hint, or more than one try.</p>

${renderGroups({ groups, icons })}

      <section class="dash-recent-section" id="dash-recent-section" aria-labelledby="dash-recent-heading" hidden>
        <h2 id="dash-recent-heading">Recently finished</h2>
        <ol class="dash-recent" id="dash-recent"></ol>
      </section>

      <section class="dash-reset" id="dash-reset-section" aria-labelledby="dash-reset-heading" hidden>
        <h2 id="dash-reset-heading">Start clean</h2>
        <p>Progress lives only in this browser, so resetting deletes it for good. There is no copy anywhere to restore.</p>
        <p class="cta-row"><button class="btn" type="button" id="dash-reset">Reset progress</button></p>
        <p class="gate-note" id="dash-reset-note" role="status" aria-live="polite"></p>
      </section>

      ${renderWaysOut({ variant: "dashboard", projectsAvailable, appPagesAvailable, appUrl: config.appUrl })}

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
