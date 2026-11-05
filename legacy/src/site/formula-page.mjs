/**
 * One problem page, and the hub that lists them.
 *
 * A problem page answers a question in the order a person asks it: the formula, why it works, what
 * goes wrong, then the exercise. It is written content, so it renders as prose with the same exercise
 * islands a function note uses, borrowed from a lesson rather than restated here. The difference is
 * where the reader arrives from: a note is found by function name, a problem page by question, so the
 * sibling links are the navigation and the note link is the explanation.
 */

import { esc } from "./html.mjs";
import { renderBlocks } from "./markdown.mjs";
import { renderQuestions } from "./questions.mjs";
import { articleJsonLd, breadcrumbJsonLd, clampTitle, groupPath, jsonLd, renderBreadcrumbs } from "./seo.mjs";
import { renderDocument } from "./shell.mjs";
import { drilledIslands, renderArticleDrill } from "./article-page.mjs";

export const FORMULA_BASE = "/formulas";

const formulaPath = (slug) => `${FORMULA_BASE}/${slug}`;

const formulaTrail = (formula) => [
  { href: "/", label: "Home" },
  { href: FORMULA_BASE, label: "Excel problems" },
  { href: formulaPath(formula.slug), label: formula.title },
];

/** The family a problem belongs to, in the words a reader would use rather than the slug. */
const FAMILY_TITLES = {
  lookup: "Looking up a value",
  aggregate: "Adding up rows that match",
  count: "Counting rows and cells",
  round: "Rounding to a usable number",
};

export const familyTitle = (family) => FAMILY_TITLES[family] ?? family;

/** Every `<h2>` in the body, in order, for the on-this-page list. */
function sectionsOf(blocks) {
  return blocks
    .filter((block) => block.type === "h2")
    .map((block) => ({ id: block.id, text: block.text }));
}

/**
 * The body with the exercise spliced in after the practice prose. The page closes with its own sibling
 * links in an `h3` block, and the exercise belongs before those: a reader who has been told to practise
 * should meet the input before the "read this next" list.
 */
function renderFormulaBody({ formula, exercise = "" }) {
  if (!exercise) return renderBlocks(formula.blocks);
  const practice = formula.blocks.findIndex((block) => block.type === "h2" && block.id === "practice");
  const from = practice === -1 ? formula.blocks.length : practice;
  const after = formula.blocks.findIndex(
    (block, position) => position > from && (block.type === "h2" || block.type === "h3"),
  );
  const cut = after === -1 ? formula.blocks.length : after;
  return `${renderBlocks(formula.blocks.slice(0, cut))}${exercise}${renderBlocks(formula.blocks.slice(cut))}`;
}

/**
 * The two directions out of a problem page: the note that explains the function, and the neighbouring
 * problems. Neighbours are drawn from the same family first, because that is the next question the
 * reader is about to ask.
 */
function renderFormulaRelated({ formula, formulas, articles, index }) {
  const note = articles.find((article) =>
    String(article.function ?? "")
      .split(/[/\s]+/)
      .includes(formula.function),
  );
  const near = formulas
    .filter((candidate) => candidate.slug !== formula.slug)
    .sort((a, b) => Number(b.family === formula.family) - Number(a.family === formula.family))
    .slice(0, 3);
  const exercise = index.find((item) => item.slug === formula.drill) ?? null;
  const groupId = exercise?.group ?? null;

  const items = [
    note ? `            <li><a href="/excel-functions/${esc(note.slug)}">${esc(note.title)}</a></li>` : "",
    exercise ? `            <li><a href="${esc(exercise.path)}">${esc(exercise.exercise.title)}</a></li>` : "",
    groupId ? `            <li><a href="${esc(groupPath(groupId))}">More exercises like this one</a></li>` : "",
    ...near.map(
      (candidate) => `            <li><a href="${esc(formulaPath(candidate.slug))}">${esc(candidate.title)}</a></li>`,
    ),
    `            <li><a href="${FORMULA_BASE}">Every Excel problem page</a></li>`,
  ].filter(Boolean);

  return `<nav class="ways" aria-labelledby="formula-related-heading">
          <h2 class="ways-title" id="formula-related-heading">Where to go next</h2>
          <ul class="ways-list ways-list-links">
${items.join("\n")}
          </ul>
        </nav>`;
}

/**
 * One problem page. `formulas` is the whole silo, because the sibling links and the "Where to go next"
 * list are derived from it rather than written into the file: a page cannot point at a neighbour that was
 * never published, and a page added to the folder appears on every page it relates to.
 */
export function prepareFormulaPage({
  config,
  track,
  index,
  articles = [],
  formulas = [],
  formula,
  clientAvailable = false,
}) {
  const pageFormula = {
    ...formula,
    heading: formula.title,
    path: formulaPath(formula.slug),
    description: formula.description,
  };
  const islands = drilledIslands({ slugs: formula.drills, index });
  const trail = formulaTrail(pageFormula);

  const exercise = islands
    .map((island, position) => renderArticleDrill({ ...island, position, total: islands.length }))
    .join("\n          ");

  const sections = sectionsOf(formula.blocks);
  const toc = sections.length
    ? `        <nav class="article-toc" aria-labelledby="formula-toc-heading">
          <h2 class="article-toc-title" id="formula-toc-heading">On this page</h2>
          <ul class="article-toc-list">
${sections.map((item) => `            <li><a href="#${esc(item.id)}">${esc(item.text)}</a></li>`).join("\n")}
          </ul>
        </nav>`
    : "";

  const body = `<main class="shell" id="main">
      <div class="page-head">
        ${renderBreadcrumbs({ trail })}
        <h1>${esc(formula.title)}</h1>
        <p class="lede">${esc(formula.question)}</p>
      </div>

      <div class="layout">
        <div class="col-main">
          <article class="docs note">
${toc}
${renderFormulaBody({ formula, exercise })}
          </article>

          ${renderFormulaRelated({ formula: pageFormula, formulas, articles, index })}
        </div>
      </div>
    </main>${clientAvailable && islands.length ? '\n  <script type="module" src="/assets/client/article-drill.js"></script>' : ""}`;

  return {
    body,
    page: {
      path: pageFormula.path,
      title: clampTitle(formula.title, { siteName: config.name }),
      description: formula.description,
      isHome: false,
      bodyClass: "article",
      // The header's count needs a place in the set, the same way an exercise page says
      // "Exercise 12 of 86". A page built without the list (a unit test) omits the count instead of
      // printing an empty one.
      updated: formula.updated,
      jsonLd: jsonLd(articleJsonLd({ config, article: pageFormula }), breadcrumbJsonLd({ config, trail })),
    },
  };
}

export function renderFormulaPage(args) {
  const { body, page } = prepareFormulaPage(args);
  return renderDocument({ config: args.config, page, body, icons: args.icons });
}

/** The hub: one section per family, each a list of questions. A list page, not a landing page. */
export function prepareFormulasHub({ config, formulas, index = [], articles = [] }) {
  const families = [...new Set(formulas.map((formula) => formula.family))];
  const sections = families
    .map((family) => {
      const cards = formulas
        .filter((formula) => formula.family === family)
        .map(
          (formula) => `            <li class="article-card">
              <a class="article-card-title" href="${esc(formulaPath(formula.slug))}">${esc(formula.question)}</a>
              <p class="article-card-note">${esc(formula.summary)}</p>
            </li>`,
        )
        .join("\n");
      const id = `family-${family}`;
      return `      <section aria-labelledby="${id}">
        <h2 id="${id}">${esc(familyTitle(family))}</h2>
        <ul class="article-list">
${cards}
        </ul>
      </section>`;
    })
    .join("\n\n");

  const body = `<main class="shell hub" id="main">
      <div class="page-head">
        ${renderBreadcrumbs({ trail: [{ href: "/", label: "Home" }] })}
        <h1>Excel problems, answered with one formula</h1>
        <p class="lede">Each page takes a question you would type into a search box and gives the formula that answers it. Then it says why the formula works, and ends on an exercise that grades what you type.</p>
      </div>

${sections}

      <section aria-labelledby="practice-heading">
        <h2 id="practice-heading">Practise on the exercise track</h2>
        <p>Reading a formula does not make you remember it. Every page uses an exercise from the ${esc(
          String(index.length),
        )}-exercise track, so you type the formula on a sheet that answers back.</p>
        <ul class="ways-list">
          <li><a href="/excel-exercises">Start with the first exercise</a></li>
          <li><a href="/excel-functions">Read the function notes</a></li>
        </ul>
      </section>

${renderQuestions({
        questions: [
          {
            question: "Do I need Excel installed to try one of these?",
            answer:
              "No. The sheet in each exercise is drawn by the page, and it grades what you type. Open Excel when you want to try the same formula on your own file.",
          },
          {
            question: "Where does the answer come from?",
            answer:
              "Every page is built on an exercise from the track, so the formula shown is the one that exercise grades. A page that leans on a function note links to it.",
          },
        ],
      })}
    </main>`;

  const trail = [{ href: "/", label: "Home" }];
  return {
    body,
    page: {
      path: FORMULA_BASE,
      title: "Excel problems, answered with one formula",
      description:
        "Look up a value, count what a range holds, round to a whole crate. Each problem gets one formula, the reason it works, and an exercise you can try.",
      isHome: false,
      bodyClass: "hub",
      updated: config.builtAt,
      jsonLd: jsonLd(
        {
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: "Excel problem pages",
          numberOfItems: formulas.length,
          itemListElement: formulas.map((formula, position) => ({
            "@type": "ListItem",
            position: position + 1,
            name: formula.question,
            url: `${config.baseUrl}${formulaPath(formula.slug)}`,
          })),
        },
        breadcrumbJsonLd({ config, trail }),
      ),
    },
  };
}

export function renderFormulasHub(args) {
  const { body, page } = prepareFormulasHub(args);
  return renderDocument({ config: args.config, page, body, icons: args.icons });
}
