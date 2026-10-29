/**
 * The Next.js shell's view of the site: config, validated content, icons, all read from the same
 * sources `legacy/src/build.mjs` uses. Importing the legacy modules instead of re-deriving anything
 * keeps the two builds from drifting while both exist — phase 9 moves this to `content/` and JSX.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { readIcons } from "../legacy/src/site/assets.mjs";
import { siteConfig } from "../legacy/src/site/config.mjs";
import { loadContent } from "../legacy/src/site/content.mjs";

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
  site = {
    config,
    track,
    index: entries,
    icons: readIcons(join(ROOT, "legacy/vendor/icons")),
    clientAvailable: existsSync(join(ROOT, "legacy/src/client/drill.js")),
    dashboardAvailable: existsSync(join(ROOT, "legacy/src/client/dashboard.js")),
    entryFor: (slug) => entries.find((entry) => entry.slug === slug) ?? null,
  };
  return site;
}
