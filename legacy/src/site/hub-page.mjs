/**
 * Two pages that exist to be found rather than to be navigated to: `/excel-exercises`, the catalogue
 * with the words a learner actually searches for, and `/about`, the page that says who made this and
 * how the grading works. Both are static, both are indexable, and both link to the group hubs — which
 * is how a crawler reaches the 88 lessons from the front door.
 *
 * No icon, badge, subtitle and button on one card: a group card is a title, one line about the skill,
 * and a count. That is the whole card.
 */

import { esc, inlineIcon } from "./html.mjs";
import { dashboardGroups } from "./dashboard-page.mjs";
import { breadcrumbJsonLd, jsonLd, renderBreadcrumbs } from "./seo.mjs";
import { renderByline, renderDocument, renderWaysOut } from "./shell.mjs";

/** The first sentence of a group intro, for a card. Intros are authored, so sentence one is the hook. */
function firstSentence(text) {
  const flat = (text ?? "").replace(/\s+/g, " ").trim();
  const end = flat.search(/\.\s/);
  return end === -1 ? flat : flat.slice(0, end + 1);
}

function renderGroupCards({ groups }) {
  const cards = groups
    .map(
      (group) => `        <li class="project-card">
          <p class="project-meta">${esc(group.entries.length)} drill${group.entries.length === 1 ? "" : "s"}</p>
          <h3 class="project-title"><a class="project-link" href="/learn/groups/${esc(group.id)}">${esc(group.title)}</a></h3>
          <p class="project-outcome">${esc(group.summary ?? firstSentence(group.intro))}</p>
        </li>`,
    )
    .join("\n");
  return `      <ul class="project-list">
${cards}
      </ul>`;
}

export function prepareExercisesHub({
  config,
  track,
  index,
  icons = {},
  projectsAvailable = false,
  appPagesAvailable = false,
}) {
  const groups = dashboardGroups({ track, index });
  const first = index[0];
  const trail = [
    { href: "/", label: "Excel drills" },
    { href: "/excel-exercises", label: "Excel exercises" },
  ];

  const body = `<main class="shell hub" id="main">
      ${renderBreadcrumbs({ trail })}

      <div class="page-head">
        <p class="eyebrow">Excel exercises</p>
        <h1>Excel exercises with instant answers</h1>
        <p class="lede">${esc(index.length)} spreadsheet tasks, sorted by the skill each one teaches. Type a formula, find out exactly what is wrong, move on. No signup, no download, nothing to install.</p>
        ${renderByline({ config, index, extra: `${groups.length} groups` })}
      </div>

      <section aria-labelledby="picking-heading">
        <h2 id="picking-heading">Pick the skill you need</h2>
        <p>Every group below is a short run of drills in the order they build on each other. Start at the top of a group or jump to the drill you came for.</p>
${renderGroupCards({ groups })}
      </section>

      <section class="how how-strip" aria-labelledby="how-heading">
        <h2 id="how-heading">How a drill works</h2>
        <ol class="how-steps">
          <li><strong>Type the formula.</strong> Each task names a cell and gives you the numbers already in the sheet.</li>
          <li><strong>Get graded on the formula, not just the total.</strong> The checker looks for the function and the cell references you were asked for, so a lucky hardcode does not pass.</li>
          <li><strong>Read the one that is wrong.</strong> A rejected answer tells you which rule it broke, in the words your own manager would use.</li>
        </ol>
        <p class="how-note">Progress stays in your browser. There is no account to create and no email to give.</p>
      </section>

      <p class="cta-row"><a class="btn btn-primary" href="${esc(first.path)}">Start with ${esc(first.title)}${inlineIcon(icons["arrow-right"], { size: 16 })}</a></p>

      <section class="faq" aria-labelledby="questions-heading">
        <h2 id="questions-heading">Questions people ask before starting</h2>
        <h3>Are the exercises free?</h3>
        <p>Yes for the first ${esc(track.freeLessonCount)} drills, including the grading and the notes. The rest of the track is a one-off payment, listed on the <a href="/pricing">pricing page</a>.</p>
        <h3>Do I need Excel installed?</h3>
        <p>No. The sheet is on the page and the checking runs in your browser. The notes describe the same formulas in Excel, Google Sheets and LibreOffice, and the workbook drills give you a file to take into a real spreadsheet.</p>
        <h3>Are the answers checked, or just the total?</h3>
        <p>Checked properly. A formula that reaches the right number with the wrong function or the wrong range is rejected, and the reason you get names the rule it broke. The <a href="/about">about page</a> explains how that works.</p>
      </section>

      ${renderWaysOut({ variant: "home", projectsAvailable, appPagesAvailable })}
    </main>`;

  return {
    body,
    page: {
      path: "/excel-exercises",
      title: "Excel exercises",
      description: `Hand-checked Excel exercises for ${groups.length} skills: SUM, IF, VLOOKUP, COUNTIF and more. Type a formula, get told exactly what is wrong.`,
      counter: `${index.length} drills`,
      bodyClass: "hub",
      skipLabel: "exercises",
      jsonLd: jsonLd(breadcrumbJsonLd({ config, trail })),
    },
  };
}

export function prepareAboutPage({ config, track, index, icons = {} }) {
  const trail = [
    { href: "/", label: "Excel drills" },
    { href: "/about", label: "About" },
  ];
  const contact = config.contact
    ? `\n        <li><strong>Write to us.</strong> <a href="mailto:${esc(config.contact)}">${esc(config.contact)}</a> for corrections, a drill that will not pass, or a function you want covered.</li>`
    : "";

  const body = `<main class="shell hub" id="main">
      ${renderBreadcrumbs({ trail })}

      <div class="page-head">
        <p class="eyebrow">About</p>
        <h1>About ${esc(config.name)}</h1>
        <p class="lede">A practice site for spreadsheet formulas. Short tasks, a checker that explains itself, and no account between you and the first drill.</p>
        ${renderByline({ config, index })}
      </div>

      <section aria-labelledby="what-heading">
        <h2 id="what-heading">What this is</h2>
        <p>${esc(index.length)} drills across ${esc(track.groups.length)} skills. Each one is a single job of the kind that turns up in a real workbook: total a column, flag rows that miss a target, look a price up from another sheet, clean a column of pasted text.</p>
        <p>The drills are ordered. Nothing unlocks behind a paywall that hides the explanation, and the notes under each sheet stay readable whether you answer it or not.</p>
      </section>

      <section aria-labelledby="grading-heading">
        <h2 id="grading-heading">How the checking works</h2>
        <p>Grading runs in your browser. Your formula is parsed, not evaluated as a screenshot: the checker confirms the function you used, the cells you referred to, and the number you produced. That is why typing the answer by hand is rejected and why a correct total from the wrong range is still wrong.</p>
        <p>Nothing you type is uploaded. There is no server that stores your answers and no account to lose access to, which also means clearing your browser data clears your progress.</p>
      </section>

      <section aria-labelledby="made-heading">
        <h2 id="made-heading">How the drills are written</h2>
        <p>Each drill is written by hand around one function or one habit, then tested: the expected formula has to pass, and the five to ten mistaken formulas a learner actually types have to fail with a useful reason. Those mistaken answers are kept in the content, so the explanation you get on a wrong answer is authored rather than guessed.</p>
        <p>The notes name the syntax, the traps, and the error codes the function really returns. No filler paragraphs, no invented statistics, and no claims about Excel that the checker cannot back up.</p>
      </section>

      <section aria-labelledby="cost-heading">
        <h2 id="cost-heading">What it costs</h2>
        <ul class="how-steps">
          <li><strong>Free.</strong> The first ${esc(track.freeLessonCount)} drills, every explanation, and the grading. No card, no email.</li>
          <li><strong>Paid.</strong> The rest of the track, once, if you want it. The price is on the <a href="/pricing">pricing page</a> and there is nothing recurring in it.</li>${contact}
        </ul>
      </section>

      ${renderWaysOut({ variant: "home" })}
    </main>`;

  return {
    body,
    page: {
      path: "/about",
      title: "About",
      description: `What ${config.name} is, how the formula checker grades an answer, and how the drills are written and tested.`,
      counter: `${index.length} drills`,
      bodyClass: "hub",
      skipLabel: "page",
      jsonLd: jsonLd(breadcrumbJsonLd({ config, trail })),
    },
  };
}

export function renderExercisesHub(args) {
  const { body, page } = prepareExercisesHub(args);
  return renderDocument({ config: args.config, page, body, icons: args.icons });
}

export function renderAboutPage(args) {
  const { body, page } = prepareAboutPage(args);
  return renderDocument({ config: args.config, page, body, icons: args.icons });
}
