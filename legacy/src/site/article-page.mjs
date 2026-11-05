/**
 * One function note, and the hub that lists them. A note is written content, so it renders as prose
 * first: the answer, the syntax, worked examples, the mistakes, what else does the job, then the exercises
 * at the point where the reader has just been told to practise. The exercises are islands on the page, not
 * the page, and each one is its own form: three exercises that share one input would grade one answer
 * three times.
 */

import { esc, jsonScript } from "./html.mjs";
import { renderBlocks } from "./markdown.mjs";
import { renderQuestions } from "./questions.mjs";
import { articleJsonLd, breadcrumbJsonLd, clampTitle, groupPath, jsonLd, renderBreadcrumbs } from "./seo.mjs";
import { renderDocument } from "./shell.mjs";
import { screenPayload } from "./exercise-page.mjs";
import { workbookFile } from "./sheet.mjs";

export const ARTICLE_BASE = "/excel-functions";

const articlePath = (slug) => `${ARTICLE_BASE}/${slug}`;

const articleTrail = (article) => [
  { href: "/", label: "Home" },
  { href: ARTICLE_BASE, label: "Excel functions" },
  { href: articlePath(article.slug), label: article.function },
];

/** Every `<h2>` in the body, in order, for the on-this-page list. */
function sectionsOf(blocks) {
  return blocks
    .filter((block) => block.type === "h2")
    .map((block) => ({ id: block.id, text: block.text }));
}

/**
 * The body, with the exercise spliced in after the practice prose rather than replacing it: a reader who
 * wants to be told what to type gets the paragraph, and a reader who wants to type gets the input.
 */
function renderArticleBody({ article, exercise = "" }) {
  const practice = article.blocks.findIndex((block) => block.type === "h2" && block.id === "practice");
  if (practice === -1) return renderBlocks(article.blocks);
  const after = article.blocks.findIndex((block, position) => position > practice && block.type === "h2");
  const cut = after === -1 ? article.blocks.length : after;
  return `${renderBlocks(article.blocks.slice(0, cut))}${exercise}${renderBlocks(article.blocks.slice(cut))}`;
}

/**
 * One exercise island. Server-rendered and complete: the prompt, the answer cell, the visible label, the
 * hint in the document and the answer in a `<details>`. Only the grading is client-side.
 *
 * The guidance fades on purpose. The first exercise is the one the note just explained, so its answer sits
 * open: the reader checks the shape of a correct formula before typing. The second is closed, one click
 * away. From the third on there is no answer on the page until the reader has missed twice, because by
 * then the answer is the thing being practised.
 *
 * Every id carries the island's position. Three forms cannot share `article-answer`, and the client
 * finds each island's parts from its own form rather than from the document.
 */
export function renderArticleDrill({ entry, screen, payload, position, total }) {
  if (!entry || !screen) return "";
  const n = position + 1;
  const id = (name) => `${name}-${n}`;
  const cell = screen.answerCell ? `Cell ${screen.answerCell}` : "The answer cell";
  const last = n === total;
  const guidance =
    position === 0
      ? `<details class="article-drill-solution" id="${id("article-solution")}" open>`
      : position === 1
        ? `<details class="article-drill-solution" id="${id("article-solution")}">`
        : `<details class="article-drill-solution" id="${id("article-solution")}" data-reveal="2" hidden>`;
  return `<section class="article-drill" data-drill="${n}" aria-labelledby="${id("article-drill-heading")}">
          <h2 class="article-drill-title" id="${id("article-drill-heading")}">Try it: exercise ${n} of ${total}</h2>
          <p class="article-drill-prompt">${esc(screen.prompt ?? entry.exercise.title)}</p>
          <form class="article-drill-form" id="${id("article-drill-form")}" data-drill="${n}" novalidate>
            <label class="article-drill-label" for="${id("article-answer")}">${esc(cell)} holds</label>
            <input class="article-drill-input" id="${id("article-answer")}" name="answer" type="text" inputmode="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" aria-describedby="${id("article-feedback")}">
            <div class="article-drill-actions">
              <button type="submit" class="btn btn-primary">Check answer</button>
              <button type="button" class="btn btn-ghost" id="${id("article-hint")}" aria-expanded="false" aria-controls="${id("article-hint-text")}">Show a hint</button>
            </div>
          </form>
          <p class="article-hint" id="${id("article-hint-text")}" hidden>${esc(screen.hints?.value ?? "")}</p>
          <p class="article-drill-feedback" id="${id("article-feedback")}" role="status" aria-live="polite"></p>
          ${guidance}
            <summary>Show the answer</summary>
            <pre><code>${esc(`${cell} holds ${screen.expect?.value ?? ""}`)}</code></pre>
          </details>
          <p class="article-drill-more"><a href="${esc(entry.path)}">${
            last ? "Do the whole exercise" : "Open this exercise in the lesson"
          } (${esc(entry.exercise.title)})</a></p>
          ${workbookFile({
            slug: entry.slug,
            screen,
            label: "Download the sheet for this exercise",
            meta: screen.answerCell ? "Two tabs: the grid, and the answer." : "It opens in Excel, Sheets or LibreOffice.",
          })}
          <script type="application/json" id="${id("article-data")}">${jsonScript(payload)}</script>
        </section>`;
}

/** The problem pages this note answers: a question asked in a search box, answered by the note. */
function problemsOf({ article, formulas }) {
  const parts = String(article.function ?? "")
    .split(/[/\s]+/)
    .filter(Boolean);
  return formulas.filter((formula) => parts.includes(formula.function));
}

/**
 * Same-group lessons, the problem pages this note answers, and sibling notes: the directions a reader
 * can go when this one is done. The problem links are generated rather than written into the note, so
 * adding a page to the silo puts a link on every note that explains its function.
 */
function renderArticleRelated({ article, entry, index, articles, track, problems = [] }) {
  const group = entry ? track.groups.find((candidate) => candidate.id === entry.group) ?? null : null;
  const near = entry
    ? index
        .filter((item) => item.group === entry.group && item.exercise.id !== entry.exercise.id)
        .sort((a, b) => Math.abs(a.number - entry.number) - Math.abs(b.number - entry.number))
        .slice(0, 2)
    : [];
  const siblings = articles.filter((candidate) => candidate.slug !== article.slug).slice(0, 3);
  const problemLinks = problems
    .map(
      (problem) =>
        `            <li><a href="/formulas/${esc(problem.slug)}">${esc(problem.question)}</a></li>`,
    )
    .join("\n");

  const lessonLinks = near
    .map((item) => `            <li><a href="${esc(item.path)}">${esc(item.exercise.title)}</a></li>`)
    .join("\n");
  const articleLinks = siblings
    .map(
      (candidate) =>
        `            <li><a href="${esc(articlePath(candidate.slug))}">${esc(candidate.title)}</a></li>`,
    )
    .join("\n");

  return `<nav class="ways" aria-labelledby="article-related-heading">
          <h2 class="ways-title" id="article-related-heading">Where to go next</h2>
          <ul class="ways-list ways-list-links">
${group ? `            <li><a href="${esc(groupPath(group.id))}">All Excel exercises in ${esc(group.title)}</a></li>\n` : ""}${
            lessonLinks ? `${lessonLinks}\n` : ""
          }${problemLinks ? `${problemLinks}\n` : ""}${articleLinks ? `${articleLinks}\n` : ""}            <li><a href="/excel-exercises">Every Excel exercise</a></li>
          </ul>
        </nav>`;
}

/**
 * The exercises a note borrows, in the order the note lists them. Each one is the lesson's first screen:
 * the note has one screen of space per exercise, and the first screen is the one the lesson opens with, so
 * the reader who follows the link arrives at the same formula they just typed.
 */
export function drilledIslands({ slugs, index }) {
  const islands = [];
  for (const slug of slugs) {
    const entry = index.find((item) => item.slug === slug) ?? null;
    const screen = entry?.exercise.screens?.[0] ?? null;
    if (!entry || !screen) continue;
    // The island grades with the same grader the lesson uses, so it is handed the same screen payload
    // the lesson client gets: one screen, already trimmed to what grading and teaching need.
    const payload = { slug: entry.slug, path: entry.path, screen: screenPayload(entry.exercise, screen, 0) };
    islands.push({ entry, screen, payload });
  }
  return islands;
}

/**
 * One article page. The note is about a function; its exercises are about that function used on a real
 * sheet, so the two are linked by slug, not by copy. The first exercise decides where the note sits in the
 * track, which is what the "Where to go next" links are built from.
 */
export function prepareArticlePage({
  config,
  track,
  index,
  articles,
  article,
  entry = null,
  formulas = [],
  clientAvailable = false,
}) {
  const pageArticle = {
    ...article,
    heading: article.title,
    path: articlePath(article.slug),
    description: article.description,
  };
  const islands = drilledIslands({ slugs: article.drills ?? (article.exercise ? [article.exercise] : []), index });
  const first = islands[0]?.entry ?? entry;
  const trail = articleTrail(pageArticle);

  const exercise = islands
    .map((island, position) =>
      renderArticleDrill({ ...island, position, total: islands.length }),
    )
    .join("\n          ");

  const sections = sectionsOf(article.blocks);
  const toc = sections.length
    ? `        <nav class="article-toc" aria-labelledby="article-toc-heading">
          <h2 class="article-toc-title" id="article-toc-heading">On this page</h2>
          <ul class="article-toc-list">
${sections.map((item) => `            <li><a href="#${esc(item.id)}">${esc(item.text)}</a></li>`).join("\n")}
          </ul>
        </nav>`
    : "";

  const body = `<main class="shell" id="main">
      <div class="page-head">
        ${renderBreadcrumbs({ trail })}
        <h1>${esc(article.title)}</h1>
        <p class="lede">${esc(article.summary)}</p>
        <pre class="syntax" aria-label="Syntax"><code>${esc(article.syntax)}</code></pre>
      </div>

      <div class="layout">
        <div class="col-main">
          <article class="docs note">
${toc}
${renderArticleBody({ article, exercise, feedback: null })}
          </article>

          ${renderArticleRelated({
            article: pageArticle,
            entry: first,
            index,
            articles,
            track,
            problems: problemsOf({ article, formulas }),
          })}
        </div>
      </div>
    </main>${clientAvailable && islands.length ? '\n  <script type="module" src="/assets/client/article-drill.js"></script>' : ""}`;

  return {
    body,
    page: {
      path: pageArticle.path,
      title: clampTitle(article.title, { siteName: config.name }),
      description: article.description,
      isHome: false,
      bodyClass: "article",
      updated: article.updated,
      jsonLd: jsonLd(articleJsonLd({ config, article: pageArticle }), breadcrumbJsonLd({ config, trail })),
    },
  };
}

export function renderArticlePage(args) {
  const { body, page } = prepareArticlePage(args);
  return renderDocument({ config: args.config, page, body, icons: args.icons });
}

/** The hub: what a note is, every note, then the exercises. A list page, not a landing page. */
export function prepareFunctionsHub({ config, articles, index = [], formulas = [] }) {
  const cards = articles
    .map(
      (article) => `            <li class="article-card">
              <a class="article-card-title" href="${esc(articlePath(article.slug))}">${esc(article.title)}</a>
              <p class="article-card-note">${esc(article.summary)}</p>
            </li>`,
    )
    .join("\n");

  // The problem silo is the other way into this material: a reader who arrives with a question rather
  // than a function name. Listed here so the notes hub is not a dead end for them.
  const problemCards = formulas
    .map(
      (formula) => `            <li class="article-card">
              <a class="article-card-title" href="/formulas/${esc(formula.slug)}">${esc(formula.question)}</a>
              <p class="article-card-note">${esc(formula.summary)}</p>
            </li>`,
    )
    .join("\n");

  const body = `<main class="shell hub" id="main">
      <div class="page-head">
        ${renderBreadcrumbs({ trail: [{ href: "/", label: "Home" }] })}
        <h1>Excel functions, explained in plain words</h1>
        <p class="lede">Each note says what a function does, shows it in a formula, and names where that formula goes wrong. Every note carries an exercise you can try on the page.</p>
      </div>

      <section aria-labelledby="notes-heading">
        <h2 id="notes-heading">Every function note</h2>
        <ul class="article-list">
${cards}
        </ul>
      </section>

      ${
        formulas.length > 0
          ? `<section aria-labelledby="problems-heading">
        <h2 id="problems-heading">The questions these notes answer</h2>
        <p>Each page starts from a question and gives one formula that answers it. It ends on the same exercise the note uses.</p>
        <ul class="article-list">
${problemCards}
        </ul>
        <p><a href="/formulas">Every Excel problem page</a></p>
      </section>

      `
          : ""
      }<section aria-labelledby="practice-heading">
        <h2 id="practice-heading">Practise on the exercise track</h2>
        <p>Reading a formula does not make you remember it. Each note carries an exercise from the ${esc(
          String(index.length),
        )}-exercise track, so you type the formula on a sheet that answers back.</p>
        <ul class="ways-list">
          <li><a href="/excel-exercises">Start with the first exercise</a></li>
          <li><a href="/learn">See the whole track</a></li>
        </ul>
      </section>

${renderQuestions({
        questions: [
          {
            question: "Do I need Excel installed to follow a note?",
            answer:
              "No. The sheet in each exercise is drawn by the page, and it grades what you type. Open Excel when you want to try the same thing on your own file.",
          },
          {
            question: "Are these notes beginner level?",
            answer:
              "They start at the first formula and stay in the order the track uses them. If a note assumes something, it points at the exercise that teaches it.",
          },
        ],
      })}
    </main>`;

  const trail = [{ href: "/", label: "Home" }];
  return {
    body,
    page: {
      path: ARTICLE_BASE,
      title: "Excel functions, explained in plain words",
      description:
        "Plain-language notes on the Excel functions that do most of the work, each ending in an exercise you can try on the page. No signup.",
      isHome: false,
      bodyClass: "hub",
      updated: config.builtAt,
      jsonLd: jsonLd(
        {
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: "Excel function notes",
          numberOfItems: articles.length,
          itemListElement: articles.map((article, position) => ({
            "@type": "ListItem",
            position: position + 1,
            name: article.title,
            url: `${config.baseUrl}${articlePath(article.slug)}`,
          })),
        },
        breadcrumbJsonLd({ config, trail }),
      ),
    },
  };
}

export function renderFunctionsHub(args) {
  const { body, page } = prepareFunctionsHub(args);
  return renderDocument({ config: args.config, page, body, icons: args.icons });
}
