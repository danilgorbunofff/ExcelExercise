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

import { esc, inlineIcon, jsonScript } from "./html.mjs";

/**
 * URLs that are not lessons or groups. `null` means the page does not exist yet in a build, so callers
 * pass the set they publish. Every entry is a path, not a URL: the origin comes from `config`.
 */
export const EXTRA_PAGES = {
  exercises: { path: "/excel-exercises", priority: "0.9" },
  functions: { path: "/excel-functions", priority: "0.8" },
  about: { path: "/about", priority: "0.4" },
  privacy: { path: "/privacy", priority: "0.3" },
  terms: { path: "/terms", priority: "0.3" },
};

/** The two pages that are legal in nature. Both builds publish them, so they are not optional. */
const LEGAL = ["privacy", "terms"];

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
  const cut = flat.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[,.;:]$/, "")}…`;
}

/**
 * The sitemap as data, in the order a crawler should read it: the front door, the two hub pages, the
 * group hubs, the 88 lessons, the articles, then the legal pages. Each item carries its own lastmod so
 * a lesson rewritten today does not claim the whole site changed.
 */
export function indexablePaths({ config, index = [], groups = [], articles = [], extra = LEGAL }) {
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
  const trail = [{ href: "/", label: "Excel drills" }];
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
    // No `hasPart`: the 88 lessons would be 88 URLs of head on every page, and each lesson already
    // declares this node as its `isPartOf`. `numberOfCredits` is left out too — it means ECTS, not
    // "how many drills are in here".
    teaches: [...new Set(index.map((entry) => entry.exercise.docs.teaches ?? entry.exercise.docs.explain).filter(Boolean))].slice(0, 5),
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
