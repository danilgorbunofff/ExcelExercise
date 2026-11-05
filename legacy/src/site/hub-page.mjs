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
import { offerLine, renewalLine } from "./offer.mjs";
import { renderQuestions } from "./questions.mjs";
import { breadcrumbJsonLd, jsonLd, renderBreadcrumbs } from "./seo.mjs";
import { renderDocument } from "./shell.mjs";

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
          <p class="project-meta">${esc(group.entries.length)} exercise${group.entries.length === 1 ? "" : "s"}</p>
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
    { href: "/", label: "Excel exercises" },
    { href: "/excel-exercises", label: "Excel exercises" },
  ];

  const body = `<main class="shell hub" id="main">
      ${renderBreadcrumbs({ trail })}

      <div class="page-head">
        <p class="eyebrow">Excel exercises</p>
        <h1>Excel exercises with instant answers</h1>
        <p class="lede">${esc(index.length)} spreadsheet tasks, sorted by the skill each one teaches. Type a formula, find out what is wrong, and move on. There is nothing to install, and you do not need an account to start.</p>
      </div>

      <section aria-labelledby="picking-heading">
        <h2 id="picking-heading">Pick the skill you need</h2>
        <p>Each group is a run of exercises that build on each other. Start at the top of a group, or jump to the exercise you came for.</p>
${renderGroupCards({ groups })}
      </section>

      <section class="how how-strip" aria-labelledby="how-heading">
        <h2 id="how-heading">How an exercise works</h2>
        <ol class="how-steps">
          <li><strong>Type the formula.</strong> Each task names a cell and gives you the numbers already in the sheet.</li>
          <li><strong>Get told what is wrong.</strong> The checker reads the function, the cell references and the result, so a right number from the wrong range still fails.</li>
          <li><strong>Read the reason.</strong> A rejected answer names the rule it broke, so you know what to change.</li>
        </ol>
      </section>

      <p class="cta-row"><a class="btn btn-primary" href="${esc(first.path)}">Start with ${esc(first.exercise.title)}${inlineIcon(icons["arrow-right"], { size: 16 })}</a></p>

${renderQuestions({
        heading: "Questions before you start",
        questions: [
          {
            question: "Are the exercises free?",
            answers: [
              `${esc(track.freeLessonCount)} of the ${esc(index.length)} are free, with the grading and the notes. The free ones are spread through the whole track, not taken from the front, and the <a href="/start">start page</a> puts them in the order to take them.`,
              esc(offerLine({ free: track.freeLessonCount, total: index.length })),
              esc(renewalLine()),
            ],
          },
          {
            question: "Do I need Excel installed?",
            answer:
              "No. The sheet is on the page and the checking runs in your browser. The notes cover Excel and Google Sheets, and they say where the two differ. A workbook exercise gives you a file to open in Excel, Sheets or LibreOffice.",
          },
          {
            question: "How is an answer checked?",
            answer:
              'The formula is what gets checked. A right total from the wrong function or the wrong range is rejected, and the reason you get names the rule it broke. The <a href="/about">about page</a> explains how the checker works.',
          },
        ],
      })}

    </main>`;

  return {
    body,
    page: {
      path: "/excel-exercises",
      title: "Excel exercises",
      description: `Hand-checked Excel exercises for ${groups.length} skills: SUM, IF, VLOOKUP, COUNTIF and more. Type a formula, get told exactly what is wrong.`,
      bodyClass: "hub",
      skipLabel: "exercises",
      jsonLd: jsonLd(breadcrumbJsonLd({ config, trail })),
    },
  };
}

export function prepareAboutPage({ config, track, index, icons = {} }) {
  const trail = [
    { href: "/", label: "Excel exercises" },
    { href: "/about", label: "About" },
  ];
  const code = config.contact ? config.contact.trim().replace(/^mailto:/i, "") : "";

  // "Who runs it" is a fact about the deployment, not copy: it appears only when a build was handed a
  // name, because an unnamed placeholder would read as the company this site is not.
  const operator = config.author
    ? `\n      <section aria-labelledby="operator-heading">
        <h2 id="operator-heading">Who runs it</h2>
        <p>${esc(config.author)} writes, checks and maintains every exercise here. It is one person, and the address in the footer reaches them${
          code ? `: <a href="mailto:${esc(code)}">${esc(code)}</a>` : ""
        }.</p>
      </section>`
    : "";

  const body = `<main class="shell hub" id="main">
      ${renderBreadcrumbs({ trail })}

      <div class="page-head">
        <p class="eyebrow">About</p>
        <h1>About ${esc(config.name)}</h1>
        <p class="lede">A practice site for spreadsheet formulas. Short tasks, a checker that tells you what went wrong, and nothing to install.</p>
      </div>
      ${operator}

      <section aria-labelledby="what-heading">
        <h2 id="what-heading">What this is</h2>
        <p>${esc(index.length)} exercises across ${esc(track.groups.length)} skills. Each one is a single job you would meet in a real workbook. Total a column, flag the rows that miss a target, or look a price up from another sheet.</p>
        <p>The exercises are ordered, so a group builds from its first exercise to its last. The ${esc(
          track.freeLessonCount,
        )} free exercises are open from start to finish, with their notes and their explanations. The rest open with a paid plan.</p>
      </section>

      <section aria-labelledby="grading-heading">
        <h2 id="grading-heading">How the checking works</h2>
        <p>Grading runs in your browser. The checker reads the formula itself, not only the number it returns: it confirms the function you used and the cells you referred to. That is why typing the answer by hand is rejected, and why a correct total from the wrong range still fails.</p>
        <p>Nothing you type is uploaded. The formula is checked on the page, so the site never receives your answers. Clearing your browser data clears the progress it holds.</p>
      </section>

      <section aria-labelledby="reader-heading">
        <h2 id="reader-heading">Who it is for</h2>
        <p>Written for the person who already opens a spreadsheet and wants the formulas to come back without looking them up. You can type SUM without thinking, then stall on XLOOKUP's fourth argument, or on a COUNTIFS that returns zero.</p>
        <p><strong>Not for</strong> someone who has never used a spreadsheet, and not a course: there are no videos and no chapters to work through in order. It is also not for macros, Power Query or VBA, and not for Google Sheets or LibreOffice. The grader follows Excel's rules and one locale, so a formula that works elsewhere may be marked wrong here.</p>
      </section>

      <section aria-labelledby="made-heading">
        <h2 id="made-heading">How the exercises are written</h2>
        <p>Each exercise is written by hand around one function or one habit, then tested. The expected formula has to pass, and a wrong one has to fail with a reason you can act on. Every screen names the function, the range or the cell it checks, and a rejected answer points at the rule that failed.</p>
        <p>The notes name the syntax, the traps, and the error codes the function really returns. Where Excel and Google Sheets differ, they say so. No filler paragraphs, no invented statistics, and no claims about Excel that the checker cannot back up.</p>
      </section>

      <section aria-labelledby="cost-heading">
        <h2 id="cost-heading">What it costs</h2>
        <ul class="how-steps">
          <li><strong>Free.</strong> The ${esc(track.freeLessonCount)} exercises on the <a href="/start">start page</a>, with their notes and answer explanations. No card and no email.</li>
          <li><strong>Paid.</strong> The rest of the track, for as long as a term runs. The <a href="/pricing">pricing page</a> has the full terms.</li>
        </ul>
        <p>${esc(offerLine({ free: track.freeLessonCount, total: index.length }))}</p>
        <p>${esc(renewalLine())}</p>
        <p>${esc(config.name)} is not affiliated with Microsoft. Excel is their product; the exercises and the checker are not.</p>
      </section>

    </main>`;

  return {
    body,
    page: {
      path: "/about",
      title: "About",
      description: `What ${config.name} is, how the formula checker grades an answer, and how the exercises are written and tested.`,
      bodyClass: "hub",
      skipLabel: "page",
      jsonLd: jsonLd(breadcrumbJsonLd({ config, trail })),
    },
  };
}

export function renderExercisesHub(args) {
  const { body, page } = prepareExercisesHub(args);
  return renderDocument({
    config: args.config,
    page,
    body,
    icons: args.icons,
    projectsAvailable: args.projectsAvailable,
    appPagesAvailable: args.appPagesAvailable,
  });
}

export function renderAboutPage(args) {
  const { body, page } = prepareAboutPage(args);
  return renderDocument({
    config: args.config,
    page,
    body,
    icons: args.icons,
    projectsAvailable: args.projectsAvailable,
    appPagesAvailable: args.appPagesAvailable,
  });
}
