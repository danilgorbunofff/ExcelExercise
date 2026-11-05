/**
 * The one place that decides which URLs this site asks a search engine to index, and the structured
 * data that describes them.
 *
 * Both builds import this module (`legacy/src/build.mjs` for `dist/`, `app/sitemap.js` for the ported
 * app), so "what is in the sitemap" cannot be answered two different ways. It lives under `legacy/`
 * because `legacy/` is deployed as a folder on its own: the static build may not import `lib/`.
 *
 * Rules kept here, deliberately:
 * - A page is listable only if it has a route in both builds.
 * - `noindex` pages are never listed: `/learn`, `/pricing`, the signed-in surfaces.
 * - Order is by importance, and `priority` is written down rather than derived, because a sitemap is
 *   a hint about the shape of the site and that shape is an editorial decision.
 */

import { PLANS, PRICE_CURRENCY } from "./offer.mjs";
import { esc, inlineIcon, jsonScript } from "./html.mjs";

/**
 * URLs that are not lessons or groups. `null` means the page does not exist yet in a build, so callers
 * pass the set they publish. Every entry is a path, not a URL: the origin comes from `config`.
 */
export const EXTRA_PAGES = {
  start: { path: "/start", priority: "0.9" },
  exercises: { path: "/excel-exercises", priority: "0.9" },
  functions: { path: "/excel-functions", priority: "0.8" },
  formulas: { path: "/formulas", priority: "0.8" },
  shortcuts: { path: "/shortcuts", priority: "0.8" },
  search: { path: "/search", priority: "0.5" },
  about: { path: "/about", priority: "0.4" },
  privacy: { path: "/privacy", priority: "0.3" },
  terms: { path: "/terms", priority: "0.3" },
};

/** The two pages that are legal in nature. Both builds publish them, so they are not optional. */
const LEGAL = ["privacy", "terms"];

/**
 * The non-lesson pages both builds publish, in sitemap order.
 *
 * It lives here because the order and the membership have to be identical in three callers — the static
 * build, `legacy/src/verify.mjs` and `app/sitemap.js` — and the check scripts compare their lists entry
 * for entry. Three hand-kept copies drifted once already: adding `/search` to one of them made the
 * sitemap assertion fail with a length mismatch that named nothing.
 */
export function extraKeys({ articles = [], formulas = [], shortcuts = [] } = {}) {
  const hubs = [
    "start",
    "exercises",
    ...(articles.length > 0 ? ["functions"] : []),
    ...(formulas.length > 0 ? ["formulas"] : []),
    ...(shortcuts.length > 0 ? ["shortcuts"] : []),
    "search",
  ];
  return [...hubs, "about", ...LEGAL];
}

/** A group's own page. The same path in both builds: `/learn` is a Next route and a static folder. */
export function groupPath(id) {
  return `/learn/groups/${id}`;
}

/**
 * One line of prose under ~155 characters, ending on a word rather than mid-syllable. A description
 * longer than that is truncated by search engines, and a description cut mid-word reads like a bug.
 */
export function clampDescription(text, max = 155) {
  const flat = String(text ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max - 3);
  const space = cut.lastIndexOf(" ");
  return `${(space > cut.length * 0.6 ? cut.slice(0, space) : cut).replace(/[,.;:]$/, "")}...`;
}

/**
 * A page title that fits the 60 characters a search result shows, site name included. A title the page
 * authors itself is written to length; the ones built from a lesson or a formula heading are not,
 * because a heading is allowed to be a whole clause. When the heading will not fit, the trailing clause
 * goes before a word is cut: "Count only the numbers, and see what COUNT skips" becomes "Count only the
 * numbers", not "Count only the numbers, and see what COUNT".
 *
 * The site name is passed in because `renderHead` composes the two, and it composes them in the other
 * order on the home page — so the budget is the caller's fact, not this function's assumption.
 */
export function clampTitle(text, { siteName = "", separator = " · ", max = 60 } = {}) {
  const flat = String(text ?? "")
    .replace(/\s+/g, " ")
    .trim();
  const budget = max - (siteName ? siteName.length + separator.length : 0);
  if (flat.length <= budget) return flat;
  const cut = flat.slice(0, budget);
  const clause = Math.max(cut.lastIndexOf(", "), cut.lastIndexOf(": "), cut.lastIndexOf("; "));
  if (clause >= 12) return cut.slice(0, clause);
  const space = cut.lastIndexOf(" ");
  return (space >= 12 ? cut.slice(0, space) : cut).replace(/[,;:.]$/, "");
}

/**
 * The sitemap as data, in the order a crawler should read it: the front door, the two hub pages, the
 * group hubs, the 86 lessons, the articles, then the legal pages. Each item carries its own lastmod so
 * a lesson rewritten today does not claim the whole site changed.
 */
export function indexablePaths({ config, index = [], groups = [], articles = [], formulas = [], shortcuts = [], extra = LEGAL }) {
  const fallback = config.builtAt;
  const items = [
    { path: "/", priority: "1.0", lastModified: fallback },
    ...extra.map((key) => {
      const page = EXTRA_PAGES[key];
      if (!page) throw new Error(`indexablePaths: unknown extra page "${key}"`);
      return { path: page.path, priority: page.priority, lastModified: fallback };
    }),
    ...groups.map((group) => ({
      path: groupPath(group.id),
      priority: "0.7",
      lastModified: group.updated ?? fallback,
    })),
    ...index.map((entry) => ({
      path: entry.path,
      priority: entry.number <= 10 ? "0.9" : "0.8",
      lastModified: entry.exercise.updated ?? fallback,
    })),
    ...articles.map((article) => ({
      path: article.path,
      priority: "0.7",
      lastModified: article.updated ?? fallback,
    })),
    // Callers pass either the parsed page, which carries `slug`, or a `{ path, updated }` row.
    ...formulas.map((formula) => ({
      path: formula.path ?? `/formulas/${formula.slug}`,
      priority: "0.7",
      lastModified: formula.updated ?? fallback,
    })),
    ...shortcuts.map((shortcut) => ({
      path: shortcut.path ?? `/shortcuts/${shortcut.slug}`,
      priority: "0.7",
      lastModified: shortcut.updated ?? fallback,
    })),
  ];

  const seen = new Set();
  for (const item of items) {
    if (seen.has(item.path)) throw new Error(`indexablePaths: "${item.path}" is listed twice`);
    seen.add(item.path);
  }
  return items;
}

/**
 * A breadcrumb trail as markup. It is a list of links and the current page, so the visual order and
 * the `BreadcrumbList` are written from one array and cannot disagree.
 */
export function renderBreadcrumbs({ trail, label = "Breadcrumb" }) {
  if (!Array.isArray(trail) || trail.length === 0) return "";
  const items = trail
    .map(({ href, label: text }, position) => {
      const last = position === trail.length - 1;
      const inner = last
        ? `<span aria-current="page">${esc(text)}</span>`
        : `<a href="${esc(href)}">${esc(text)}</a>`;
      return `        <li>${inner}</li>`;
    })
    .join("\n");
  return `<nav class="crumbs" aria-label="${esc(label)}">
      <ol>
${items}
      </ol>
    </nav>`;
}

/** The trail a lesson page shows: where it sits, with the group hub as the working link. */
export function lessonTrail({ entry, group }) {
  const trail = [{ href: "/", label: "Excel exercises" }];
  if (group) trail.push({ href: groupPath(group.id), label: group.title });
  trail.push({ href: entry.path, label: entry.exercise.title });
  return trail;
}

/**
 * The site itself, named once. `Organization` and `WebSite` are separate nodes because they answer
 * different questions ("who publishes this" and "what is this site"), and both are referenced by the
 * nodes the other pages emit.
 */
export function siteJsonLd({ config, track }) {
  return [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      "@id": `${config.baseUrl}/#organization`,
      name: config.name,
      url: `${config.baseUrl}/`,
      logo: `${config.baseUrl}/assets/favicon.svg`,
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "@id": `${config.baseUrl}/#website`,
      name: config.name,
      url: `${config.baseUrl}/`,
      description: track.promise,
      inLanguage: config.inLanguage,
      publisher: { "@id": `${config.baseUrl}/#organization` },
    },
  ];
}

/** The course node every lesson is `isPartOf`, emitted once on the home page. */
export function courseJsonLd({ config, track, index }) {
  return {
    "@context": "https://schema.org",
    "@type": "Course",
    "@id": `${config.baseUrl}/#${track.id}`,
    name: track.title,
    description: track.promise,
    url: `${config.baseUrl}/`,
    inLanguage: config.inLanguage,
    provider: { "@id": `${config.baseUrl}/#organization` },
    isAccessibleForFree: true,
    // No `hasPart`: the 86 lessons would be 86 URLs of head on every page, and each lesson already
    // declares this node as its `isPartOf`. `numberOfCredits` is left out too — it means ECTS, not
    // "how many exercises are in here".
    // `teaches` is a one-line label. The explanation is only a fallback, and it is now several
    // paragraphs, so its line breaks are flattened before they reach a JSON-LD string.
    teaches: [
      ...new Set(
        index
          .map((entry) => entry.exercise.docs.teaches ?? entry.exercise.docs.explain)
          .filter(Boolean)
          .map((text) => String(text).replace(/\s+/g, " ").trim()),
      ),
    ].slice(0, 5),
  };
}

/**
 * The app itself: what the home page is the front door to. `offers` is not typed into this file — the
 * amounts and currency come from `offer.mjs`'s `PLANS`, the same array the pricing page prints, so the
 * markup cannot promise a price the store does not charge, and cannot go on promising a term the
 * pricing page stopped selling. One `Offer` per term, because a reader comparing search results is
 * comparing terms: a single price here would silently pick one of the three for them.
 */
export function applicationJsonLd({ config }) {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "@id": `${config.baseUrl}/#app`,
    name: config.name,
    applicationCategory: "EducationalApplication",
    operatingSystem: "Web",
    url: `${config.baseUrl}/`,
    description:
      "An Excel formula grader that runs in the browser: type a formula into the sheet and it names the rule the answer broke.",
    inLanguage: config.inLanguage,
    publisher: { "@id": `${config.baseUrl}/#organization` },
    offers: PLANS.map((plan) => ({
      "@type": "Offer",
      price: plan.amount,
      priceCurrency: PRICE_CURRENCY,
      url: `${config.baseUrl}/pricing`,
      category: "subscription",
      description: `${plan.label} of the whole track for $${plan.amount}.`,
    })),
  };
}

/** `BreadcrumbList` for the same trail the page renders. `position` is 1-based, as the spec wants. */
export function breadcrumbJsonLd({ config, trail }) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map(({ href, label }, position) => ({
      "@type": "ListItem",
      position: position + 1,
      name: label,
      item: `${config.baseUrl}${href}`,
    })),
  };
}

/** An exercise note as an article. `about` names the function, which is what a reader searched for. */
export function articleJsonLd({ config, article }) {
  const node = {
    "@context": "https://schema.org",
    "@type": "Article",
    mainEntityOfPage: { "@type": "WebPage", "@id": `${config.baseUrl}${article.path}` },
    headline: article.heading,
    description: article.description,
    url: `${config.baseUrl}${article.path}`,
    inLanguage: config.inLanguage,
    dateModified: article.updated ?? config.builtAt,
    datePublished: article.published ?? article.updated ?? config.builtAt,
    author: { "@id": `${config.baseUrl}/#organization` },
    publisher: { "@id": `${config.baseUrl}/#organization` },
  };
  if (article.function) node.about = { "@type": "DefinedTerm", name: article.function };
  return node;
}

/** One `<script type="application/ld+json">` body. Accepts an array so a page can emit a graph. */
export function jsonLd(...nodes) {
  const flat = nodes.flat().filter(Boolean);
  const value = flat.length === 1 ? flat[0] : { "@context": "https://schema.org", "@graph": flat.map(({ "@context": _ignored, ...rest }) => rest) };
  return jsonScript(value);
}

export { inlineIcon };
