#!/usr/bin/env node
/**
 * `npm run review` — the launch review, run rather than asserted.
 *
 * The completeness review (`docs/plans/parity/reviews/completeness-*.md`) claims that every row it
 * marks **Proven** names a witness that fails without the capability. A claim like that decays the
 * moment a test is renamed or deleted, and nothing in `npm run check` notices: the suite is still
 * green, and the row still says Proven.
 *
 * So this script runs the gates and then checks the document against the run:
 *
 *   1. every gate passes, and any failure is reported with its output;
 *   2. every `tests/db/*.spec.js` file is listed in `db:check` — a spec the gate does not run is a
 *      spec that has never been seen to pass;
 *   3. every witness on a **Proven** row executed in this run: browser witnesses are matched against
 *      the test interval that contains the line in the Playwright JSON report, and unit witnesses
 *      against a test file the runner actually reported, with the line inside a `test(...)` body;
 *   4. every URL in either build's sitemap answers 200, and every internal link those pages carry
 *      points at a URL that does;
 *   5. no canonical sits on the fallback origin (`origin:check` in production mode).
 *
 * The output is a dated annex beside the review, never a rewrite of it: the review is authored
 * evidence, and this file is the machine's reading of it.
 */
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REVIEW_DIR = join(ROOT, ".review");
const PHASES = join(ROOT, "docs", "plans", "parity");

const args = new Set(process.argv.slice(2));
const skip = (name) => args.has(`--no-${name}`);
const REPORT = join(REVIEW_DIR, "annex.md");

/** The build is made the way CI makes it — production, on the real origin — because a canonical that
 *  still says `localhost` is exactly what `origin:check` exists to catch, and a development build hides it. */
const SHIPPED = { SITE_ENV: "production", SITE_URL: process.env.SITE_URL ?? "https://excelsupreme.com" };

/** Every gate this review depends on, in the order a person would run them. */
const steps = [
  {
    id: "unit",
    what: "the unit suite, with line coverage so a witness can be proved to have run",
    command: "node",
    args: [
      "--test",
      "--test-reporter=spec",
      "--test-reporter-destination=stdout",
      "--test-reporter=junit",
      `--test-reporter-destination=${join(REVIEW_DIR, "unit.xml")}`,
      "tests/**/*.test.js",
    ],
  },
  { id: "content", what: "the content factory gate and the legal copy", command: "npm", args: ["run", "content:check"] },
  { id: "build", what: "both builds, as production on the shipped origin", command: "npm", args: ["run", "next:build"], slow: true, env: SHIPPED },
  { id: "budget", what: "the byte budget", command: "npm", args: ["run", "budget"], env: SHIPPED },
  { id: "routes", what: "routes match the templates", command: "npm", args: ["run", "next:check"], env: SHIPPED },
  {
    id: "origin",
    what: "no canonical on the fallback origin",
    command: "npm",
    args: ["run", "origin:check"],
    env: SHIPPED,
  },
  { id: "secrets", what: "no secret in either build", command: "npm", args: ["run", "secret:check"], env: SHIPPED },
  { id: "static", what: "the static site crawls clean", command: "node", args: ["legacy/src/verify.mjs"], env: SHIPPED },
  {
    id: "browser",
    what: "the browser suite",
    command: "npx",
    args: ["playwright", "test", "--reporter=json"],
    env: { PLAYWRIGHT_JSON_OUTPUT_NAME: join(REVIEW_DIR, "playwright.json") },
    slow: true,
  },
  { id: "db", what: "the database suite (the layer no other gate reaches)", command: "npm", args: ["run", "db:check"], slow: true, optional: "db" },
  { id: "accounts", what: "the accounts browser suite", command: "npm", args: ["run", "e2e:accounts"], slow: true, optional: "accounts" },
];

function run({ command, args, env }) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(command, args, {
      cwd: ROOT,
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (chunk) => (out += chunk));
    child.stderr.on("data", (chunk) => (err += chunk));
    child.on("close", (code, signal) => {
      resolve({ code: code ?? (signal ? 1 : 0), signal, out, err, seconds: Math.round((Date.now() - started) / 1000) });
    });
  });
}

const tail = (text, lines = 25) => text.trimEnd().split("\n").slice(-lines).join("\n");

// --- the document -----------------------------------------------------------

/** Verdicts a row can carry, longest first so "Built, unproven" is not read as "Built". */
const VERDICTS = ["Built, unproven", "Built, unproven (half)", "Proven", "Absent", "Obsolete"];

/**
 * The three kinds of witness a row may name, and how far each one is from "a test fails without it":
 * `path:line` is a line inside a test that ran; `gate:<script>` is a gate this run executed green;
 * `artifact:<path>` is a file that exists, which is all a document or a config file can ever be.
 */
export const GATES = {
  test: "unit",
  "content:check": "content",
  build: "build",
  budget: "budget",
  "next:check": "routes",
  "origin:check": "origin",
  "secret:check": "secrets",
  e2e: "browser",
  "db:check": "db",
  "e2e:accounts": "accounts",
  verify: "static",
};

/** Every acceptance row in every phase doc, with the witnesses it names. */
export function parseEvidence(text, file) {
  const rows = [];
  for (const line of text.split("\n")) {
    if (!line.startsWith("|")) continue;
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    if (cells.length < 4) continue;
    const [id, criterion, verdict] = cells;
    if (!/^p\d+-\d+$/.test(id)) continue;
    if (!VERDICTS.includes(verdict)) continue;
    const witness = cells[3] ?? "";
    const paths = [...witness.matchAll(/`([^`:\s]+):([\d,]+)`/g)].flatMap((match) =>
      match[2].split(",").map((line) => ({ file: match[1], line: Number(line) })),
    );
    const tokens = [...witness.matchAll(/`([^`]+)`/g)].map((match) => match[1]);
    const gates = tokens.filter((token) => token.startsWith("gate:")).map((token) => token.slice(5));
    const artifacts = tokens.filter((token) => token.startsWith("artifact:")).map((token) => token.slice(9));
    rows.push({ id, criterion, verdict, witness, paths, gates, artifacts, file });
  }
  return rows;
}

/** The witnesses a run has to have executed: only the rows that claim to be proved. */
export const provenRows = (rows) => rows.filter((row) => row.verdict === "Proven");

/**
 * The test files the unit runner reported, as absolute paths. The JUnit report names the file on every
 * case, so a file missing here did not run, and a witness inside it is a claim about a suite that no
 * longer exists.
 */
export function parseJUnit(text) {
  return new Set([...text.matchAll(/file="([^"]+\.test\.js)"/g)].map((match) => match[1]));
}

/** Every `test(`/`it(` start line in a file, so a witness can be shown to sit inside one. */
export function testBlocks(source) {
  const starts = [];
  source.split("\n").forEach((line, index) => {
    if (/^\s*(it|test)(\.\w+)?\(/.test(line)) starts.push(index + 1);
  });
  return starts.map((start, index) => ({ start, end: starts[index + 1] ?? Number.MAX_SAFE_INTEGER }));
}

/** Every browser test that ran, as the interval of lines it occupies in its file. */
export function parsePlaywright(text) {
  const report = JSON.parse(text);
  const tests = [];
  const walk = (suite) => {
    for (const spec of suite.specs ?? []) {
      const start = spec.line ?? spec.tests?.[0]?.location?.line ?? 0;
      const passed = (spec.tests ?? []).every((test) => (test.results ?? []).some((result) => result.status === "passed"));
      tests.push({ file: spec.file, line: start, title: spec.title, passed });
    }
    for (const child of suite.suites ?? []) walk(child);
  };
  for (const suite of report.suites ?? []) walk(suite);
  // An interval per file, so a witness pointing inside a test body still matches the test that ran.
  for (const file of new Set(tests.map((test) => test.file))) {
    const inFile = tests.filter((test) => test.file === file).sort((a, b) => a.line - b.line);
    inFile.forEach((test, index) => (test.end = inFile[index + 1]?.line ?? Number.MAX_SAFE_INTEGER));
  }
  return tests;
}

/**
 * The report names a spec by the path Playwright gave it: `article.spec.js` under a project whose
 * `testDir` is `./e2e`, `../e2e-static/static-drill.spec.js` under one rooted a level up. Comparing
 * tails in both directions is enough, and a duplicate basename across projects would still be caught by
 * the interval check that follows.
 */
const sameSpec = (a, b) => a === b || a.endsWith(`/${b}`) || b.endsWith(`/${a}`);

/** Why a witness did not hold, or null when it did. */
export function witnessProblem({ file, line }, { unit, tests }) {
  const absolute = join(ROOT, file);
  if (!existsSync(absolute)) return "the file it names does not exist";
  const browsers = tests.filter((test) => sameSpec(test.file.replaceAll("\\", "/"), file));
  if (browsers.length > 0) {
    const containing = browsers
      .filter((test) => line >= test.line && line < test.end)
      .sort((a, b) => b.line - a.line)[0];
    if (!containing) return `line ${line} is not inside any browser test that ran`;
    if (!containing.passed) return `the test containing line ${line} did not pass`;
    return null;
  }
  if (!unit.has(absolute)) return "the unit suite did not run this file";
  const inside = testBlocks(readFileSync(absolute, "utf8")).some((block) => line >= block.start && line < block.end);
  return inside ? null : `line ${line} is not inside a test the runner ran`;
}

/**
 * Why a `gate:` witness did not hold, or null when it did. The gate has to be one this review knows
 * how to run, and it has to have run green here — a gate that was skipped proves nothing.
 */
export function gateProblem(name, { ran }) {
  const step = GATES[name];
  if (!step) return `"${name}" is not a gate this review runs`;
  const result = ran.get(step);
  if (!result) return `gate \`${step}\` did not run`;
  if (result.skipped) return `gate \`${step}\` was skipped`;
  return result.ok ? null : `gate \`${step}\` failed`;
}

/** Why an `artifact:` witness did not hold: the file is gone, so the row is describing nothing. */
export function artifactProblem(file) {
  return existsSync(join(ROOT, file)) ? null : "the file it names does not exist";
}

/** The db specs the gate would not run: a spec in the directory but not in the script. */export function dbSpecGaps({ dir = join(ROOT, "tests", "db"), script }) {
  const specs = readdirSync(dir)
    .filter((name) => name.endsWith(".spec.js"))
    .map((name) => `tests/db/${name}`)
    .sort();
  return { specs, missing: specs.filter((spec) => !script.includes(spec)) };
}

// --- the runs ---------------------------------------------------------------

/** Every internal link the given pages carry, as paths. */
function internalLinks(html) {
  return [...html.matchAll(/(?:href|src)="([^"]+)"/g)]
    .map((match) => match[1])
    .filter((href) => href.startsWith("/") && !href.startsWith("//") && !href.startsWith("/_next/") && !href.startsWith("/assets/"))
    .map((href) => href.split("#")[0].split("?")[0])
    .filter(Boolean);
}

async function crawlNext() {
  const port = 4188;
  const server = spawn("npx", ["next", "start", "-p", String(port)], { cwd: ROOT, stdio: "ignore" });
  const origin = `http://127.0.0.1:${port}`;
  const failures = [];
  let checked = 0;
  let redirects = 0;

  /** A 307 is how the paywall and the account gate answer a reader who is not signed in: the link is
   *  not dead, so the crawl follows it and asks the page at the end of the chain to answer 200. */
  const settle = async (path) => {
    let current = path;
    const chain = [];
    for (let hop = 0; hop <= 3; hop += 1) {
      const response = await fetch(`${origin}${current}`, { redirect: "manual" });
      if (response.status < 300 || response.status >= 400) return { status: response.status, chain, response };
      const location = response.headers.get("location");
      if (!location) return { status: response.status, chain, error: "a redirect with no location" };
      let next;
      try {
        next = new URL(location, origin);
      } catch {
        return { status: response.status, chain, error: `unreadable location ${location}` };
      }
      if (next.origin !== origin) return { status: response.status, chain, error: `leaves the origin for ${next.origin}` };
      chain.push(`${response.status} ${current} -> ${next.pathname}`);
      current = `${next.pathname}${next.search}`;
    }
    return { status: 0, chain, error: "more than three redirects" };
  };

  try {
    let ready = false;
    for (let attempt = 0; attempt < 120 && !ready; attempt += 1) {
      try {
        const response = await fetch(`${origin}/`);
        ready = response.ok;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
    if (!ready) return { checked, redirects, failures: [{ url: origin, status: "server never answered" }] };

    const sitemap = await fetch(`${origin}/sitemap.xml`).then((response) => response.text());
    const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => new URL(match[1]).pathname);
    const seen = new Set();
    const queue = [...urls];
    while (queue.length > 0) {
      const path = queue.shift();
      if (seen.has(path)) continue;
      seen.add(path);
      if (seen.size > 400) break;
      const settled = await settle(path);
      checked += 1;
      if (settled.error || settled.status !== 200) {
        failures.push({
          url: path,
          status: settled.error ?? settled.status,
          where: urls.includes(path) ? "sitemap" : "link",
          chain: settled.chain,
        });
        continue;
      }
      if (settled.chain.length > 0) redirects += 1;
      if (!path.startsWith("/sitemap") && !path.endsWith(".xml") && !path.endsWith(".txt")) {
        const type = settled.response.headers.get("content-type") ?? "";
        if (type.includes("text/html")) {
          for (const link of internalLinks(await settled.response.text())) if (!seen.has(link)) queue.push(link);
        }
      }
    }
  } finally {
    server.kill("SIGTERM");
  }
  return { checked, redirects, failures };
}

/** The same question of the static build, answered against the files it wrote. */
function crawlStatic() {
  const dist = join(ROOT, "legacy", "dist");
  const sitemapFile = join(dist, "sitemap.xml");
  if (!existsSync(sitemapFile)) return { checked: 0, failures: [{ url: "legacy/dist/sitemap.xml", status: "missing" }] };
  const urls = [...readFileSync(sitemapFile, "utf8").matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => new URL(match[1]).pathname);
  const failures = [];
  for (const path of urls) {
    const candidates = [join(dist, path), join(dist, `${path.replace(/\/$/, "")}.html`), join(dist, path, "index.html")];
    if (!candidates.some((candidate) => existsSync(candidate) || existsSync(`${candidate.replace(/\/$/, "")}/index.html`))) {
      failures.push({ url: path, status: "no file" });
    }
  }
  return { checked: urls.length, failures };
}

// --- the report -------------------------------------------------------------

const pad = (text, width) => String(text).padEnd(width);

function gateTable(results) {
  const lines = ["| Gate | What it proves | Result | Time |", "| --- | --- | --- | --- |"];
  for (const result of results) {
    const state = result.skipped ? "skipped" : result.ok ? "pass" : "**fail**";
    lines.push(`| ${result.id} | ${result.what} | ${state} | ${result.seconds ?? "-"}s |`);
  }
  return lines.join("\n");
}

function witnessTables(rows, evidence) {
  const problems = [];
  const byFile = new Map();
  for (const row of rows) {
    if (!byFile.has(row.file)) byFile.set(row.file, []);
    byFile.get(row.file).push(row);
  }
  const counts = { test: 0, gate: 0, artifact: 0 };
  const sections = [];
  for (const [file, fileRows] of byFile) {
    const lines = [
      `### ${relative(ROOT, file)}`,
      "",
      "| ID | Verdict | Witness | How it was checked |",
      "| --- | --- | --- | --- |",
    ];
    for (const row of fileRows) {
      if (row.verdict !== "Proven") {
        lines.push(`| ${row.id} | ${row.verdict} | ${row.witness || "—"} | not required |`);
        continue;
      }
      const misses = row.paths
        .map((path) => ({ path, problem: witnessProblem(path, evidence) }))
        .filter((entry) => entry.problem);
      const gateMisses = row.gates.map((name) => ({ name, problem: gateProblem(name, evidence) })).filter((miss) => miss.problem);
      const artifactMisses = row.artifacts
        .map((name) => ({ name, problem: artifactProblem(name) }))
        .filter((miss) => miss.problem);
      const total = row.paths.length + row.gates.length + row.artifacts.length;
      if (total === 0) {
        lines.push(`| ${row.id} | ${row.verdict} | ${row.witness || "—"} | **no witness to check** |`);
        problems.push(`${row.id}: marked Proven but names no \`path:line\`, \`gate:\` or \`artifact:\` witness`);
        continue;
      }
      if (misses.length + gateMisses.length + artifactMisses.length === 0) {
        const how = [
          row.paths.length ? `${row.paths.length} test ${row.paths.length === 1 ? "witness" : "witnesses"} ran` : "",
          row.gates.length ? `${row.gates.length} gate ran` : "",
          row.artifacts.length ? `${row.artifacts.length} artifact present` : "",
        ].filter(Boolean);
        lines.push(`| ${row.id} | ${row.verdict} | ${row.witness} | yes: ${how.join(", ")} |`);
        counts.test += row.paths.length > 0 ? 1 : 0;
        counts.gate += row.paths.length === 0 && row.gates.length > 0 ? 1 : 0;
        counts.artifact += row.paths.length === 0 && row.gates.length === 0 && row.artifacts.length > 0 ? 1 : 0;
        continue;
      }
      const detail = [
        ...misses.map((miss) => `${miss.path.file}:${miss.path.line} — ${miss.problem}`),
        ...gateMisses.map((miss) => `gate:${miss.name} — ${miss.problem}`),
        ...artifactMisses.map((miss) => `artifact:${miss.name} — ${miss.problem}`),
      ];
      lines.push(`| ${row.id} | ${row.verdict} | ${row.witness} | **not proved**: ${detail.join("; ")} |`);
      for (const miss of misses) problems.push(`${row.id}: ${miss.path.file}:${miss.path.line} — ${miss.problem}`);
      for (const miss of gateMisses) problems.push(`${row.id}: gate:${miss.name} — ${miss.problem}`);
      for (const miss of artifactMisses) problems.push(`${row.id}: artifact:${miss.name} — ${miss.problem}`);
    }
    sections.push(lines.join("\n"));
  }
  return { sections: sections.join("\n\n"), problems, counts };
}

async function main() {
  mkdirSync(REVIEW_DIR, { recursive: true });
  const results = [];
  for (const step of steps) {
    const disabled = (step.optional && skip(step.optional)) || skip(step.id);
    if (disabled) {
      results.push({ ...step, ok: true, skipped: true });
      console.log(`- ${pad(step.id, 9)} skipped (--no-${step.optional ?? step.id})`);
      continue;
    }
    process.stdout.write(`- ${pad(step.id, 9)} ${step.what} … `);
    const result = await run(step);
    const ok = result.code === 0;
    results.push({ ...step, ...result, ok });
    console.log(ok ? `pass ${result.seconds}s` : `FAIL ${result.seconds}s`);
    if (!ok) {
      writeFileSync(join(REVIEW_DIR, `${step.id}.log`), `${result.out}\n${result.err}`);
      console.log(`\n${tail(`${result.out}\n${result.err}`, 30)}\n`);
    }
  }

  const failures = [];

  // 1. the gates.
  for (const result of results) if (!result.ok) failures.push(`gate \`${result.id}\` failed — see .review/${result.id}.log`);

  // 2. the document, against what ran.
  const rows = readdirSync(PHASES)
    .filter((name) => /^phase-\d+.*\.md$/.test(name))
    .flatMap((name) => parseEvidence(readFileSync(join(PHASES, name), "utf8"), join(PHASES, name)));
  const unit = existsSync(join(REVIEW_DIR, "unit.xml"))
    ? parseJUnit(readFileSync(join(REVIEW_DIR, "unit.xml"), "utf8"))
    : new Set();
  const tests = existsSync(join(REVIEW_DIR, "playwright.json"))
    ? parsePlaywright(readFileSync(join(REVIEW_DIR, "playwright.json"), "utf8"))
    : [];
  const evidence = { unit, tests, ran: new Map(results.map((result) => [result.id, result])) };
  const witness = witnessTables(rows, evidence);
  failures.push(...witness.problems);

  // 3. the specs the db gate does not run.
  const db = dbSpecGaps({ script: JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).scripts["db:check"] });
  for (const spec of db.missing) failures.push(`\`${spec}\` exists but \`db:check\` does not run it`);

  // 4. the links, in both builds.
  const next = results.find((result) => result.id === "build")?.ok ? await crawlNext() : { checked: 0, failures: [] };
  const stat = crawlStatic();
  for (const failure of [...next.failures, ...stat.failures]) failures.push(`\`${failure.url}\` returned ${failure.status}`);

  const verdicts = Object.fromEntries(VERDICTS.map((verdict) => [verdict, rows.filter((row) => row.verdict === verdict).length]));
  const proved = provenRows(rows).length;
  const day = new Date().toISOString().slice(0, 10);

  const report = [
    `# Gate annex — ${day}`,
    "",
    `Generated by \`npm run review\`. This is the machine's reading of the review, not a replacement for`,
    `it: \`completeness-${day}.md\` carries the census, the ledger and the runtime matrix, and this file`,
    `records only what the gates did on this machine, at this commit.`,
    "",
    `- rows: **${rows.length}** — ${Object.entries(verdicts).map(([verdict, count]) => `${count} ${verdict}`).join(", ")}`,
    `- proved rows whose witness held: **${proved - witness.problems.length} of ${proved}** — ${witness.counts.test} by a test that ran, ${witness.counts.gate} by a gate this run passed, ${witness.counts.artifact} by an artifact that exists`,
    `- links crawled: **${next.checked}** in the Next build, **${stat.checked}** in the static build`,
    `- result: **${failures.length === 0 ? "green" : `${failures.length} problem${failures.length === 1 ? "" : "s"}`}**`,
    "",
    "## Gates",
    "",
    gateTable(results),
    "",
    "## The db gate's own list",
    "",
    `\`tests/db/*.spec.js\`: ${db.specs.length} files, ${db.specs.length - db.missing.length} of them named by \`db:check\`.`,
    "",
    db.missing.length === 0 ? "Every spec in the directory is one the gate runs." : db.missing.map((spec) => `- \`${spec}\` is not run`).join("\n"),
    "",
    "## Witnesses",
    "",
    witness.sections,
    "",
    "## Defects",
    "",
    failures.length === 0 ? "None: every gate passed, every proved witness ran, and every link answered." : failures.map((failure, index) => `${index + 1}. ${failure}`).join("\n"),
    "",
  ].join("\n");

  writeFileSync(join(REVIEW_DIR, "annex.md"), report);
  writeFileSync(join(PHASES, "reviews", `completeness-${day}-gates.md`), report);

  console.log(
    failures.length === 0
      ? `\n✓ review green — ${proved} proved witnesses re-ran, ${next.checked + stat.checked} links answered, ${db.specs.length} db specs wired`
      : `\n✖ review found ${failures.length} problem${failures.length === 1 ? "" : "s"}:\n${failures.map((failure) => `  - ${failure}`).join("\n")}`,
  );
  console.log(`  annex: docs/plans/parity/reviews/completeness-${day}-gates.md`);
  return failures.length === 0 ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then((code) => process.exit(code));
}

export { REPORT };
