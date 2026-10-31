/**
 * One function note, and the hub that lists them. A note is written content, so it renders as prose
 * first: the answer, the syntax, worked examples, the mistakes, then a single drill at the point where
 * the reader has just been told to practise. The drill is an island on the page, not the page.
 */

import { esc, jsonScript } from "./html.mjs";
import { renderBlocks } from "./markdown.mjs";
import { articleJsonLd, breadcrumbJsonLd, groupPath, jsonLd, renderBreadcrumbs } from "./seo.mjs";
import { renderByline, renderDocument } from "./shell.mjs";
import { screenPayload } from "./exercise-page.mjs";

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
 * The body, with the drill spliced in after the practice prose rather than replacing it: a reader who
 * wants to be told what to type gets the paragraph, and a reader who wants to type gets the input.
 */
function renderArticleBody({ article, drill = "" }) {
  const practice = article.blocks.findIndex((block) => block.type === "h2" && block.id === "practice");
  if (practice === -1) return renderBlocks(article.blocks);
  const after = article.blocks.findIndex((block, position) => position > practice && block.type === "h2");
  const cut = after === -1 ? article.blocks.length : after;
  return `${renderBlocks(article.blocks.slice(0, cut))}${drill}${renderBlocks(article.blocks.slice(cut))}`;
}

/**
 * The drill markup. Server-rendered and complete: the prompt, the answer cell, the visible label, the
 * hint in the document and the answer in a `<details>`. Only the grading is client-side.
 */
function renderArticleDrill({ entry, screen, payload }) {
  if (!entry || !screen) return "";
  const cell = screen.answerCell ? `Cell ${screen.answerCell}` : "The answer cell";
  return `<section class="article-drill" aria-labelledby="article-drill-heading">
          <h2 class="article-drill-title" id="article-drill-heading">Try it on a drill</h2>
          <p class="article-drill-prompt">${esc(screen.prompt ?? entry.exercise.title)}</p>
          <form class="article-drill-form" id="article-drill-form" novalidate>
            <label class="article-drill-label" for="article-answer">${esc(cell)} holds</label>
            <input class="article-drill-input" id="article-answer" name="answer" type="text" inputmode="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" aria-describedby="article-feedback">
            <div class="article-drill-actions">
              <button type="submit" class="btn btn-primary">Check answer</button>
              <button type="button" class="btn btn-ghost" id="article-hint" aria-expanded="false" aria-controls="article-hint-text">Show a hint</button>
            </div>
          </form>
          <p class="article-hint" id="article-hint-text" hidden>${esc(screen.hints?.value ?? "")}</p>
          <p class="article-drill-feedback" id="article-feedback" role="status" aria-live="polite"></p>
          <details class="article-drill-solution">
            <summary>Show the answer</summary>
            <pre><code>${esc(`${cell} holds ${screen.expect?.value ?? ""}`)}</code></pre>
          </details>
          <p class="article-drill-more"><a href="${esc(entry.path)}">Do the whole drill: ${esc(
            entry.exercise.title,
          )}</a></p>
          <script type="application/json" id="article-data">${jsonScript(payload)}</script>
        </section>`;
}

/** Same-group lessons and sibling notes: the two directions a reader can go when this one is done. */
function renderArticleRelated({ article, entry, index, articles, track }) {
  const group = entry ? track.groups.find((candidate) => candidate.id === entry.group) ?? null : null;
  const near = entry
    ? index
        .filter((item) => item.group === entry.group && item.exercise.id !== entry.exercise.id)
        .sort((a, b) => Math.abs(a.number - entry.number) - Math.abs(b.number - entry.number))
        .slice(0, 2)
    : [];
  const siblings = articles.filter((candidate) => candidate.slug !== article.slug).slice(0, 3);

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
          <h2 class="ways-title" id="article-related-heading">Keep going</h2>
          <ul class="ways-list ways-list-links">
${group ? `            <li><a href="${esc(groupPath(group.id))}">All Excel exercises in ${esc(group.title)}</a></li>\n` : ""}${
            lessonLinks ? `${lessonLinks}\n` : ""
          }${articleLinks ? `${articleLinks}\n` : ""}            <li><a href="/excel-exercises">Every Excel exercise</a></li>
          </ul>
        </nav>`;
}

/**
 * One article page. `entry` is the lesson the note is written around: the note is about a function, the
 * drill is about that function used on a real sheet, so the two are linked by slug, not by copy.
 */
export function prepareArticlePage({ config, track, index, articles, article, entry = null, clientAvailable = false }) {
  const pageArticle = {
    ...article,
    heading: article.title,
    path: articlePath(article.slug),
    description: article.description,
  };
  const trail = articleTrail(pageArticle);
  const screen = entry ? entry.exercise.screens?.[0] ?? null : null;
  // The island grades with the same grader the lesson uses, so it is handed the same screen payload
  // the lesson client gets: one screen, already trimmed to what grading and teaching need.
  const payload = screen ? { slug: entry.slug, path: entry.path, screen: screenPayload(entry.exercise, screen, 0) } : null;

  const drill = payload ? renderArticleDrill({ entry, screen, payload }) : "";

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
        ${renderByline({ config, index: articles, updated: article.updated, noun: "notes" })}
      </div>

      <div class="layout">
        <div class="col-main">
          <article class="docs note">
${toc}
${renderArticleBody({ article, drill, feedback: null })}
          </article>

          ${renderArticleRelated({ article: pageArticle, entry, index, articles, track })}
        </div>
      </div>
    </main>${clientAvailable && payload ? '\n  <script type="module" src="/assets/client/article-drill.js"></script>' : ""}`;

  return {
    body,
    page: {
      path: pageArticle.path,
      title: article.title,
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

/** The hub: what a note is, every note, then the drills. A list page, not a landing page. */
export function prepareFunctionsHub({ config, articles, index = [] }) {
  const cards = articles
    .map(
      (article) => `            <li class="article-card">
              <a class="article-card-title" href="${esc(articlePath(article.slug))}">${esc(article.title)}</a>
              <p class="article-card-note">${esc(article.summary)}</p>
            </li>`,
    )
    .join("\n");

  const body = `<main class="shell hub" id="main">
      <div class="page-head">
        ${renderBreadcrumbs({ trail: [{ href: "/", label: "Home" }] })}
        <h1>Excel functions, explained in plain words</h1>
        <p class="lede">What each function does, what it looks like, where it goes wrong, and a drill you can try before you trust it.</p>
        ${renderByline({ config, index: articles, updated: config.builtAt, noun: "notes" })}
      </div>

      <section aria-labelledby="notes-heading">
        <h2 id="notes-heading">Every function note</h2>
        <ul class="article-list">
${cards}
        </ul>
      </section>

      <section aria-labelledby="practice-heading">
        <h2 id="practice-heading">Practise it, not just read it</h2>
        <p>Reading a formula does not make you remember it. Each note ends with a drill from the ${esc(
          String(index.length),
        )}-exercise track, so you type the formula on a sheet that answers back.</p>
        <ul class="ways-list">
          <li><a href="/excel-exercises">Start with the first exercise</a></li>
          <li><a href="/learn">See the whole track</a></li>
        </ul>
      </section>

      <section aria-labelledby="questions-heading">
        <h2 id="questions-heading">Common questions</h2>
        <h3>Do I need Excel installed to follow a note?</h3>
        <p>No. The sheet in each drill is drawn by the page, and it grades what you type. Open Excel when you want to try the same thing on your own file.</p>
        <h3>Are these notes beginner level?</h3>
        <p>They start at the first formula and stay in the order the track uses them. If a note assumes something, it points at the exercise that teaches it.</p>
      </section>
    </main>`;

  const trail = [{ href: "/", label: "Home" }];
  return {
    body,
    page: {
      path: ARTICLE_BASE,
      title: "Excel functions explained, with a drill for each",
      description:
        "Plain-language notes on the Excel functions that do most of the work, each ending in a drill you can try on the page. No signup.",
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
