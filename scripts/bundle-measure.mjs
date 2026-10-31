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
 * Needs a built tree: `legacy/dist` from `npm run build`, `.next` from `npm run next:build`.
 *
 *   node scripts/bundle-measure.mjs [url]        print every rule, reading the Next route over HTTP
 *   node scripts/bundle-measure.mjs --from-build print every rule from build output, no server
 *   node scripts/bundle-measure.mjs --assert --from-build
 *                                                the gate: fail when a budget is exceeded
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { gzipSync } from "node:zlib";

const ROOT = resolve(import.meta.dirname, "..");
const ROUTE = "/learn/excel/sum-basics";
const STATIC_PAGE = resolve(ROOT, "legacy/dist/excel/sum-basics.html");

// The two budgets, and why they are two. Phase 10 promises "JS < 150 KB gzip on the player route,
// first-party only"; that is rule D, the JavaScript the Next route itself ships, which a browser
// executes and nothing else. The drill engine is a separate promise with its own budget (rule B, the
// static lesson page), because both builds load the same `/assets/client/drill.js` and it belongs to
// neither router. Baselines are the measured values on 2026-10-31 with the headroom named beside them;
// a budget is a regression alarm, not an aspiration, so it is set just above what ships today.
const DAY = "2026-10-31";
const BUDGETS = [
  {
    rule: "B",
    label: "static lesson page (`drill.js` graph + `feedback.js`)",
    budget: 70_000,
    baseline: 65_883,
    note: `baseline ${DAY}, 6% headroom for a bug fix that costs bytes`,
  },
  {
    rule: "D",
    label: "Next lesson route, first-party JS a browser runs (phase 10's 150 kB)",
    budget: 150_000,
    baseline: 138_714,
    note: `baseline ${DAY}, phase 10's stated ceiling`,
  },
];

const args = process.argv.slice(2);
const assert = args.includes("--assert");
const fromBuild = args.includes("--from-build");
const urlArg = args.find((arg) => !arg.startsWith("--"));
const URL_UNDER_TEST = urlArg ?? `http://127.0.0.1:3000${ROUTE}`;

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

// Rule "B" and "D" are computed twice — once to print, once to assert — so the summed numbers are
// kept here rather than re-derived from the log.
const measured = {};

const show = (label, files) => {
  const [raw, zipped] = rollup(files);
  console.log(`${label}: ${files.length} files, ${raw} B raw / ${zipped} B gzip`);
  return [raw, zipped, files];
};

const drill = closure(resolve(ROOT, "legacy/dist/assets/client/drill.js"));
const feedback = resolve(ROOT, "legacy/dist/assets/client/feedback.js");

console.log("Static route — legacy/dist");
const a = show("A  drill.js entry graph", drill);
const b = show("B  lesson page (A + feedback.js)", [...drill, feedback]);
measured.B = { files: b[2], zipped: b[1] };
show("   /assets/styles.css", [resolve(ROOT, "legacy/dist/assets/styles.css")]);
show("   lesson HTML", [STATIC_PAGE]);

// Next 16's turbopack build does not emit `app-build-manifest.json` (the webpack builds did), so the
// route's chunk list comes out of the prerendered HTML the build left behind — which is also exactly
// what the browser was told to load, rather than a reconstruction of it.
function htmlForBuild() {
  const file = resolve(ROOT, ".next/server/app", `${ROUTE.replace(/^\//, "")}.html`);
  if (!existsSync(file)) {
    console.error(
      `No prerendered HTML for ${ROUTE} at ${relative(ROOT, file)}. Run \`npm run next:build\` first.`,
    );
    process.exit(2);
  }
  return bytes(file).toString("utf8");
}

const html = fromBuild ? htmlForBuild() : await (await fetch(URL_UNDER_TEST, { redirect: "follow" })).text();

console.log(`\nNext route — .next/static, ${fromBuild ? "listed by the prerendered HTML" : "resolved from the served HTML"}`);
const named = (extension) =>
  [...new Set(html.match(new RegExp(`/_next/static/[^"']+\\.${extension}`, "g")) ?? [])].map((url) =>
    resolve(ROOT, ".next/static", url.replace("/_next/static/", "")),
  );
const chunks = named("js");
const noModule = (html.match(/<script src="(\/_next\/static\/[^"]+\.js)" noModule=""/) ?? [])[1];
const skipped = noModule ? resolve(ROOT, ".next/static", noModule.replace("/_next/static/", "")) : null;
const c = show("C  every chunk the HTML names", chunks);
const d = show("D  C minus the noModule fallback (what Chromium runs)", chunks.filter((f) => f !== skipped));
measured.D = { files: d[2], zipped: d[1] };
const e = show("E  Next lesson page, executed (D + B)", [...chunks.filter((f) => f !== skipped), ...drill, feedback]);
const f = show("F  Next lesson page, every named script (C + B)", [...chunks, ...drill, feedback]);
show("   lesson CSS", named("css"));
console.log(`   lesson HTML: ${Buffer.byteLength(html)} B raw / ${gzip(Buffer.from(html))} B gzip`);

const ratio = ([raw, zipped]) =>
  `${(raw / b[0]).toFixed(2)}× raw, ${(zipped / b[1]).toFixed(2)}× gzip`;
console.log(`\nE against B (a browser's experience): ${ratio(e)}`);
console.log(`F against B (every named script): ${ratio(f)}`);
console.log(`A against C (the mixed rule that produced "3.4×"): ${(c[0] / a[0]).toFixed(2)}× raw, ${(c[1] / a[1]).toFixed(2)}× gzip`);

if (assert) {
  console.log("\nBudgets — gzip, first-party");
  let over = false;
  for (const entry of BUDGETS) {
    const found = measured[entry.rule];
    const verdict = found.zipped <= entry.budget ? "ok" : "OVER";
    console.log(
      `  ${entry.rule}  ${found.zipped} B ≤ ${entry.budget} B  ${verdict}   ${entry.label} (${entry.note})`,
    );
    if (verdict !== "OVER") continue;
    over = true;
    const biggest = found.files
      .map((file) => [relative(ROOT, file), gzip(bytes(file))])
      .sort((left, right) => right[1] - left[1])
      .slice(0, 12);
    console.log(`     ${entry.baseline} B → ${found.zipped} B (${found.zipped - entry.baseline} over baseline)\n`);
    for (const [file, zipped] of biggest) console.log(`     ${String(zipped).padStart(7)} B gzip  ${file}`);
  }
  if (over) process.exit(1);
}
