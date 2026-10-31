/**
 * The origin is not a laptop.
 *
 * Every absolute URL this site emits — `<link rel=canonical>`, `og:url`, the sitemap's `<loc>`, the
 * JSON-LD `url` — is generated from `SITE_URL`, and `SITE_URL` falls back to `localhost:4173` when it
 * is unset. That fallback is what makes `npm run build` work on a laptop, and it is also how a
 * production artifact ships a canonical pointing at a machine nobody else can reach. A deploy that
 * does this looks complete and is invisible to search.
 *
 * So in production the fallback is refused: every emitted absolute URL must sit on `SITE_URL`'s
 * origin, and a build with no `SITE_URL` fails here rather than in a search console three weeks later.
 *
 *   SITE_ENV=production SITE_URL=https://excelsupreme.com node scripts/check-origin.mjs
 *   node scripts/check-origin.mjs                    # a laptop build is allowed to fall back
 *   node scripts/check-origin.mjs --root /tmp/build  # scan a different tree (the tests do this)
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { FALLBACK_BASE_URL, siteConfig } from "../legacy/src/site/config.mjs";

const TEXT = new Set([".html", ".xml", ".txt", ".json", ".webmanifest"]);
const IGNORED = new Set(["node_modules", "assets", "cache", "static", "chunks", "media"]);

const args = process.argv.slice(2);
const rootArg = args.indexOf("--root");
const ROOT = resolve(rootArg === -1 ? join(import.meta.dirname, "..") : args[rootArg + 1]);
const TREES = ["legacy/dist", ".next/server/app"];

function walk(dir, found = []) {
  if (!existsSync(dir)) return found;
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (!IGNORED.has(name)) walk(path, found);
      continue;
    }
    const dot = name.lastIndexOf(".");
    const extension = dot === -1 ? "" : name.slice(dot);
    if (TEXT.has(extension)) found.push(path);
  }
  return found;
}

/** Every absolute URL the file emits, tagged with what it is, so a failure names the tag. */
function emittedUrls(text) {
  const urls = [];
  const add = (kind, value) => {
    const decoded = value.replaceAll("&amp;", "&");
    if (/^https?:\/\//i.test(decoded)) urls.push([kind, decoded]);
  };
  for (const match of text.matchAll(/<link[^>]+rel="canonical"[^>]*href="([^"]+)"/gi)) add("canonical", match[1]);
  for (const match of text.matchAll(/<meta[^>]+property="og:url"[^>]*content="([^"]+)"/gi)) add("og:url", match[1]);
  for (const match of text.matchAll(/<meta[^>]+content="([^"]+)"[^>]*property="og:url"/gi)) add("og:url", match[1]);
  for (const match of text.matchAll(/<loc>([^<]+)<\/loc>/gi)) add("sitemap", match[1]);
  for (const match of text.matchAll(/"url"\s*:\s*"([^"]+)"/g)) add("json-ld", match[1]);
  return urls;
}

const production = process.env.SITE_ENV?.trim() === "production";
const files = TREES.flatMap((tree) => walk(join(ROOT, tree)));

if (files.length === 0) {
  console.error(`No build output under ${TREES.join(" or ")}. Run \`npm run build\` and \`npm run next:build\`.`);
  process.exit(2);
}

const offenders = [];
let seen = 0;
for (const file of files) {
  for (const [kind, url] of emittedUrls(readFileSync(file, "utf8"))) {
    seen += 1;
    if (!production) continue;
    offenders.push([relative(ROOT, file), kind, url]);
  }
}

console.log(`origin: ${seen} absolute URLs in ${files.length} files under ${TREES.join(" + ")}`);

if (!production) {
  // A laptop build is allowed to fall back, and saying so is the point of printing the count above.
  console.log(`origin: SITE_ENV is not "production", so ${FALLBACK_BASE_URL} is allowed here`);
  process.exit(0);
}

let expected;
try {
  // `siteConfig` throws on a missing or malformed SITE_URL, which is the failure being guarded.
  expected = siteConfig().baseUrl;
} catch (error) {
  console.error(`origin: ${error.message}`);
  console.error("origin: a production build must name SITE_URL; refusing the localhost fallback");
  process.exit(1);
}
if (expected === FALLBACK_BASE_URL) {
  console.error(`origin: SITE_URL is the fallback ${FALLBACK_BASE_URL} in a production build`);
  process.exit(1);
}

const wrong = offenders.filter(([, , url]) => new URL(url).origin !== expected);
for (const [file, kind, url] of wrong.slice(0, 40)) console.error(`  ${file}: ${kind} ${url}`);

if (wrong.length > 0) {
  const others = new Set(wrong.map(([, , url]) => new URL(url).origin));
  console.error(
    `\norigin: ${wrong.length} of ${seen} URLs do not use ${expected} (found ${[...others].join(", ")})`,
  );
  console.error(`origin: rebuild with SITE_URL=${expected} (both builds read it)`);
  process.exit(1);
}

console.log(`origin: every absolute URL uses ${expected}`);
