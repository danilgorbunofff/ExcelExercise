/**
 * The bundle baseline, measured under named rules.
 *
 * "The lesson page is 52 kB" has been quoted three different ways: the static `drill.js` entry graph,
 * the static page (graph plus `feedback.js`), and the Next route under two more rules. Each number is
 * defensible alone and misleading next to another, so this prints every rule at once, with the file
 * list it summed, and the two ratios the phase-10 budgets compare.
 *
 * Both routes are measured from build output, not from a network trace, because a trace omits the
 * `noModule` fallback chunk that older browsers do download and counts nothing that Chrome skips:
 * rules C and D below differ by exactly that chunk.
 *
 * Needs a built tree: `legacy/dist` from `npm run build`, `.next` from `npm run next:build`, and the
 * Next server the browser specs already start (`next start` on 3000; override with the first argument).
 *
 *   node scripts/bundle-measure.mjs [url]
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { gzipSync } from "node:zlib";

const ROOT = resolve(import.meta.dirname, "..");
const URL_UNDER_TEST = process.argv[2] ?? "http://127.0.0.1:3000/learn/excel/sum-basics";
const STATIC_PAGE = resolve(ROOT, "legacy/dist/excel/sum-basics.html");

const gzip = (buffer) => gzipSync(buffer, { level: 6 }).length;
const bytes = (file) => readFileSync(file);

const rollup = (files) =>
  files.reduce(([raw, zipped], file) => {
    const buffer = bytes(file);
    return [raw + buffer.length, zipped + gzip(buffer)];
  }, [0, 0]);

/** Every module an ES module graph reaches, in load order. */
function closure(entry) {
  const seen = new Set();
  const walk = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    for (const match of bytes(file).toString("utf8").matchAll(/from\s+"([^"]+)"/g)) {
      const specifier = match[1];
      if (!specifier.startsWith(".")) continue;
      const next = resolve(dirname(file), specifier);
      if (existsSync(next)) walk(next);
    }
  };
  walk(entry);
  return [...seen];
}

const show = (label, files) => {
  const [raw, zipped] = rollup(files);
  console.log(`${label}: ${files.length} files, ${raw} B raw / ${zipped} B gzip`);
  return [raw, zipped];
};

const drill = closure(resolve(ROOT, "legacy/dist/assets/client/drill.js"));
const feedback = resolve(ROOT, "legacy/dist/assets/client/feedback.js");

console.log("Static route — legacy/dist");
const a = show("A  drill.js entry graph", drill);
const b = show("B  lesson page (A + feedback.js)", [...drill, feedback]);
show("   /assets/styles.css", [resolve(ROOT, "legacy/dist/assets/styles.css")]);
show("   lesson HTML", [STATIC_PAGE]);

console.log("\nNext route — .next/static, resolved from the served HTML");
const html = await (await fetch(URL_UNDER_TEST, { redirect: "follow" })).text();
const named = (extension) =>
  [...new Set(html.match(new RegExp(`/_next/static/[^"']+\\.${extension}`, "g")) ?? [])].map((url) =>
    resolve(ROOT, ".next/static", url.replace("/_next/static/", "")),
  );
const chunks = named("js");
const noModule = (html.match(/<script src="(\/_next\/static\/[^"]+\.js)" noModule=""/) ?? [])[1];
const skipped = noModule ? resolve(ROOT, ".next/static", noModule.replace("/_next/static/", "")) : null;
const c = show("C  every chunk the HTML names", chunks);
const d = show("D  C minus the noModule fallback (what Chromium runs)", chunks.filter((f) => f !== skipped));
const e = show("E  Next lesson page, executed (D + B)", [...chunks.filter((f) => f !== skipped), ...drill, feedback]);
const f = show("F  Next lesson page, every named script (C + B)", [...chunks, ...drill, feedback]);
show("   lesson CSS", named("css"));
console.log(`   lesson HTML: ${Buffer.byteLength(html)} B raw / ${gzip(Buffer.from(html))} B gzip`);

const ratio = ([raw, zipped]) =>
  `${(raw / b[0]).toFixed(2)}× raw, ${(zipped / b[1]).toFixed(2)}× gzip`;
console.log(`\nE against B (a browser's experience): ${ratio(e)}`);
console.log(`F against B (every named script): ${ratio(f)}`);
console.log(`A against C (the mixed rule that produced "3.4×"): ${(c[0] / a[0]).toFixed(2)}× raw, ${(c[1] / a[1]).toFixed(2)}× gzip`);
