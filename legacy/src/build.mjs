#!/usr/bin/env node
/**
 * The static build. Reads content, renders every page, writes `dist/`, and refuses to
 * ship anything that contradicts the content or points at another origin.
 *
 *   node src/build.mjs            # dist/ from the working tree
 *   SITE_URL=https://x.com node src/build.mjs
 *
 * There is no bundler and no dependency: the grader and the client are native ES
 * modules, the stylesheet is one concatenation, and the pages are strings.
 */

import { cpSync, existsSync, mkdirSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { FAVICON_SVG, buildStyles, readIcons, renderRobots, renderSitemap } from "./site/assets.mjs";
import { siteConfig } from "./site/config.mjs";
import { loadContent } from "./site/content.mjs";
import { renderExercisePage } from "./site/exercise-page.mjs";
import { renderIndexPage } from "./site/index-page.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

/** Origins that may appear in the HTML: our own, and the vocabulary URI JSON-LD requires. */
const ALLOWED_ORIGINS = ["https://schema.org"];

function writeFile(path, contents) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
  return contents.length;
}

export function removeDotFiles(dir) {
  let removed = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      removed += removeDotFiles(path);
    } else if (entry.name.startsWith(".")) {
      rmSync(path, { force: true });
      removed += 1;
    }
  }
  return removed;
}

function copyDir(from, to, { filter } = {}) {
  if (!existsSync(from)) return 0;
  mkdirSync(to, { recursive: true });
  const entries = readdirSync(from, { withFileTypes: true });
  let copied = 0;
  for (const entry of entries) {
    const source = join(from, entry.name);
    if (entry.name.startsWith(".")) continue;
    if (filter && !filter(entry.name)) continue;
    if (entry.isDirectory()) {
      copied += copyDir(source, join(to, entry.name), { filter });
    } else {
      cpSync(source, join(to, entry.name));
      copied += 1;
    }
  }
  return copied;
}

/** A page that loads a font, script or stylesheet from someone else is a page we do not ship. */
export function assertSelfContained(html, config, label) {
  const allowed = new Set([config.baseUrl, ...ALLOWED_ORIGINS]);
  const scheme = new URL(config.baseUrl).protocol;
  // `//host/x` fetches from host just as `https://host/x` does, so require the scheme to be
  // optional rather than absent from the match.
  for (const match of html.matchAll(/(?:https?:)?\/\/[^\s"'<>)]+/g)) {
    const url = match[0];
    const absolute = url.startsWith("//") ? `${scheme}${url}` : url;
    // Exact origin or a path under it: `https://site.example.evil.net` is not ours.
    if ([...allowed].some((origin) => absolute === origin || absolute.startsWith(`${origin}/`))) continue;
    throw new Error(`${label}: refers to ${url} — the site ships no third-party origins`);
  }
}

export function build({ root = ROOT, out, env = process.env, quiet = false } = {}) {
  const config = siteConfig(env);
  const dist = out ?? join(root, "dist");
  const contentDir = join(root, "content");
  const vendorDir = join(root, "vendor");

  // The build deletes `dist` before writing; it must never be the source tree or a parent.
  const outside = relative(resolve(dist), resolve(root));
  if (!outside || !outside.startsWith("..")) {
    throw new Error(`build: refusing to delete "${dist}" — it contains the source tree`);
  }

  const { track, exercises, index } = loadContent(contentDir);
  const icons = readIcons(join(vendorDir, "icons"));
  for (const required of ["check", "arrow-right", "lightbulb", "lock"]) {
    if (!icons[required]) throw new Error(`vendor/icons/${required}.svg is missing — the pages inline it`);
  }

  const clientMain = join(root, "src/client/drill.js");
  const clientAvailable = existsSync(clientMain);

  rmSync(dist, { recursive: true, force: true });
  mkdirSync(dist, { recursive: true });

  const pages = [];

  const indexHtml = renderIndexPage({ config, track, index, icons, clientAvailable });
  assertSelfContained(indexHtml, config, "index.html");
  pages.push({ file: "index.html", html: indexHtml });

  for (const entry of index) {
    const html = renderExercisePage({ config, track, index, entry, icons, clientAvailable });
    assertSelfContained(html, config, `${entry.slug}.html`);
    pages.push({ file: `excel/${entry.slug}.html`, html });
  }

  let bytes = 0;
  for (const page of pages) bytes += writeFile(join(dist, page.file), page.html);

  const { css, sources } = buildStyles({ vendorDir, stylesDir: join(root, "src/styles") });
  bytes += writeFile(join(dist, "assets/styles.css"), css);
  bytes += writeFile(join(dist, "assets/favicon.svg"), FAVICON_SVG);
  bytes += writeFile(join(dist, "sitemap.xml"), renderSitemap({ config, track, index }));
  bytes += writeFile(join(dist, "robots.txt"), renderRobots({ config }));

  const fonts = copyDir(join(vendorDir, "fonts"), join(dist, "assets/fonts"), { filter: (name) => name.endsWith(".woff2") });
  if (fonts === 0) throw new Error("vendor/fonts is empty — the pages preload two faces from it");

  // The grader lives in packages/grader but ships at assets/grader/, which is the path
  // client/drill.js imports (`../grader/index.js`) once it is copied to assets/client/.
  const graderSource = resolve(root, "../packages/grader");
  const grader = copyDir(graderSource, join(dist, "assets/grader"), { filter: (name) => name.endsWith(".js") });
  if (grader === 0) throw new Error(`${graderSource} is empty — the client cannot grade without it`);

  // Same contract for the session engine: packages/session ships at assets/session/, the
  // path client/drill.js imports (`../session/index.js`).
  const sessionSource = resolve(root, "../packages/session");
  const session = copyDir(sessionSource, join(dist, "assets/session"), { filter: (name) => name.endsWith(".js") });
  if (session === 0) throw new Error(`${sessionSource} is empty — the client cannot emit events without it`);

  const client = clientAvailable
    ? copyDir(join(root, "src/client"), join(dist, "assets/client"), { filter: (name) => name.endsWith(".js") })
    : 0;

  // Picture screens point at /assets/img/<name>; content/images/ is where the files are authored.
  // Optional, because no lesson has to ship one — but an empty directory means a broken <img>.
  const imagesSource = join(contentDir, "images");
  const images = existsSync(imagesSource)
    ? copyDir(imagesSource, join(dist, "assets/img"), { filter: (name) => /\.(svg|png)$/.test(name) })
    : 0;
  if (existsSync(imagesSource) && images === 0) {
    throw new Error(`${imagesSource} exists but holds no .svg or .png — a picture screen would render broken`);
  }

  // macOS drops .DS_Store into a freshly created directory; never ship it.
  removeDotFiles(dist);

  const warnings = [];
  if (!clientAvailable) warnings.push("src/client/drill.js does not exist yet: pages ship without the drill script (phase 5)");
  if (!existsSync(join(root, "src/styles"))) warnings.push("src/styles does not exist yet: styles.css is vendor CSS only (phase 5A)");

  const summary = {
    out: dist,
    pages: pages.length,
    lessons: exercises.length,
    cssSources: sources.map((file) => file.split("/").slice(-2).join("/")),
    fonts,
    grader,
    session,
    client,
    images,
    bytes,
    warnings,
  };

  if (!quiet) {
    const kb = (summary.bytes / 1024).toFixed(1);
    console.log(`built ${summary.pages} pages (${kb} kB of HTML+CSS) → ${dist}`);
    console.log(`  styles: ${summary.cssSources.length} sources concatenated`);
    console.log(
      `  assets: ${fonts} fonts, ${grader} grader modules, ${session} session modules, ${client} client modules, ${images} images`,
    );
    for (const warning of warnings) console.warn(`  warning: ${warning}`);
  }

  return summary;
}

/** True when this file is the script node was asked to run, symlinked paths included. */
function invokedDirectly() {
  if (process.argv[1] === undefined) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (invokedDirectly()) {
  try {
    build();
  } catch (error) {
    console.error(`build failed: ${error.message}`);
    process.exitCode = 1;
  }
}

export { ROOT };
