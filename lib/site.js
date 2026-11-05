/**
 * The Next.js shell's view of the site: config, validated content, icons, all read from the same
 * sources `legacy/src/build.mjs` uses. Importing the legacy modules instead of re-deriving anything
 * keeps the two builds from drifting while both exist — phase 9 moves this to `content/` and JSX.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { readIcons } from "../legacy/src/site/assets.mjs";
import { siteConfig } from "../legacy/src/site/config.mjs";
import { loadArticles, loadContent, loadFormulas, loadShortcuts } from "../legacy/src/site/content.mjs";

// `new URL("..", import.meta.url)` makes Turbopack try to bundle `..` as an asset; cwd is the repo.
const ROOT = process.cwd();

/**
 * The legacy build publishes lessons at `/excel/<slug>`; this app serves them at
 * `/learn/excel/<slug>` and keeps `/excel/*` as a redirect. Rendering the legacy paths from a Next
 * route would make every link and every `<link rel=canonical>` point at a redirect, so the paths are
 * rewritten once here, at the seam, and nowhere else.
 */
const LESSON_BASE = "/learn/excel";

function withNextPaths(entries) {
  return entries.map((entry) => ({
    ...entry,
    path: `${LESSON_BASE}/${entry.slug}`,
    prevPath: entry.prev ? `${LESSON_BASE}/${entry.prev.slug}` : "/",
    nextPath: entry.next ? `${LESSON_BASE}/${entry.next.slug}` : null,
  }));
}

let site;

/** Loaded once per server process: the content is authored JSON and cannot change under us. */
export function loadSite() {
  if (site) return site;
  const config = siteConfig();
  const { track, index } = loadContent(join(ROOT, "legacy/content"));
  const entries = withNextPaths(index);
  // The notes are not path-rewritten: `/excel-functions` is the same address on both builds, and the
  // only lesson link a note carries is the exercise it borrows, which comes from `entries` below.
  const articles = loadArticles(join(ROOT, "legacy/content"));
  // Problem pages keep their own paths on both builds: `/formulas/...` is the same address served by
  // `app/formulas/[slug]` and by the static build, so nothing here needs rewriting.
  const formulas = loadFormulas(join(ROOT, "legacy/content"));
  // Shortcut families are addressed the same way on both builds, so their paths are not rewritten
  // either. The one lesson-shaped thing they carry is the exercise they practise, and the practice button
  // takes that path from `index` — which is already rewritten above.
  const shortcuts = loadShortcuts(join(ROOT, "legacy/content"));
  site = {
    config,
    track,
    index: entries,
    icons: readIcons(join(ROOT, "legacy/vendor/icons")),
    clientAvailable: existsSync(join(ROOT, "legacy/src/client/drill.js")),
    dashboardAvailable: existsSync(join(ROOT, "legacy/src/client/dashboard.js")),
    articleDrillAvailable: existsSync(join(ROOT, "legacy/src/client/article-drill.js")),
    shortcutsAvailable: existsSync(join(ROOT, "legacy/src/client/shortcuts.js")),
    articles,
    formulas,
    shortcuts,
    entryFor: (slug) => entries.find((entry) => entry.slug === slug) ?? null,
    articleFor: (slug) => articles.find((article) => article.slug === slug) ?? null,
    formulaFor: (slug) => formulas.find((formula) => formula.slug === slug) ?? null,
    shortcutFor: (slug) => shortcuts.find((shortcut) => shortcut.slug === slug) ?? null,
  };
  return site;
}

/**
 * The exercise the free-path specs drive. Which exercises are free is `track.json`'s `freeLessons`, so the
 * spec names one of them and fails here — not by driving a walled page — when the list changes under it.
 */
const FREE_DRILL = "sum-basics";

export function freeDrill() {
  const loaded = loadSite();
  const entry = loaded.index.find((candidate) => candidate.slug === FREE_DRILL);
  if (!entry) throw new Error(`${FREE_DRILL} is not a published exercise`);
  if (!entry.free) {
    throw new Error(`${FREE_DRILL} is exercise ${entry.number}, which is not in the ${loaded.track.freeLessonCount} free exercises`);
  }
  return entry;
}
