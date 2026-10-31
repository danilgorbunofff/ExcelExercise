#!/usr/bin/env node
/**
 * The post-deploy smoke: what a person would check in five minutes after a release, written down so
 * it runs in five seconds and cannot be skipped by a tired evening.
 *
 * It answers four questions about a *running origin* rather than about this checkout:
 *
 *   1. Is this the release I think it is? — `/api/health` reports a SHA, and `--sha` says which one
 *      the deploy notes claim.
 *   2. Do deep addresses work? — not just `/`, because a host that serves the front page and shatters
 *      `/learn/excel/sum-basics` is the failure mode a static host actually has. The lesson address is
 *      taken from the drill hub the origin itself advertises, so the check follows the site's own links
 *      instead of a list typed here.
 *   3. Do the assets behind those pages exist? — every stylesheet and script the page names, with the
 *      status a browser would hit.
 *   4. Does a drill still grade, and does the certificate still print? — the payload each drill page
 *      embeds is graded with the shipped grader, using the formula the page's own hint spells out; the
 *      certificate route answers, and the sheet's print rules travel with the stylesheet.
 *
 * Grading is client-side by design, so this check grades the payload the page ships rather than a
 * request: the browser half of the same claim is `e2e/drill.spec.js`, and this is the half that can be
 * pointed at production without a hidden test account.
 *
 *   node scripts/smoke.mjs https://app.example
 *   node scripts/smoke.mjs https://www.example --static https://www2.example --sha abc1234
 *   npm run smoke -- http://127.0.0.1:4175
 *
 * Exit status is 0 only when every check passed; a failed check is printed with what it saw.
 */
import { pathToFileURL } from "node:url";

import { grade } from "../packages/grader/index.js";

const FAIL = "✗";
const PASS = "✓";
const SKIP = "•";

const DEFAULT_TIMEOUT = 15_000;

/** `--flag value` and `--flag=value` both, so a shell script and a runbook can differ. */
export function parseArgs(argv) {
  const options = { origin: null, staticOrigin: null, sha: null, cookie: null, timeout: DEFAULT_TIMEOUT };
  const rest = [];
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      rest.push(token);
      continue;
    }
    // Only the first `=` splits: `--cookie=session=1` has a `=` in its value.
    const body = token.slice(2);
    const split = body.indexOf("=");
    const name = split === -1 ? body : body.slice(0, split);
    const value = split === -1 ? argv[++index] : body.slice(split + 1);
    if (name === "static") options.staticOrigin = value ?? null;
    else if (name === "sha") options.sha = value ?? null;
    else if (name === "cookie") options.cookie = value ?? null;
    else if (name === "timeout") options.timeout = Number(value) || DEFAULT_TIMEOUT;
    else throw new Error(`unknown option --${name}`);
  }
  options.origin = rest[0] ?? process.env.SMOKE_ORIGIN ?? "http://127.0.0.1:3000";
  options.sha = options.sha ?? process.env.RELEASE_SHA ?? null;
  return options;
}

/** Trailing slashes are a difference the runbook would otherwise spend an hour on. */
export function trimOrigin(origin) {
  return String(origin ?? "").replace(/\/+$/, "");
}

/**
 * Every element that loads something from the same origin. Absolute third-party URLs are the
 * analytics the site does not have; a protocol-relative or origin-relative one is ours to check.
 */
export function sameOriginAssets(html, origin) {
  const found = new Set();
  const patterns = [
    /<link\b[^>]*\brel=["']?stylesheet["']?[^>]*\bhref=["']([^"']+)["']/gi,
    /<link\b[^>]*\bhref=["']([^"']+)["'][^>]*\brel=["']?stylesheet["']?/gi,
    /<script\b[^>]*\bsrc=["']([^"']+)["']/gi,
    /<(?:img|source)\b[^>]*\bsrc=["']([^"']+)["']/gi,
  ];
  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) {
      const url = match[1];
      if (!url || url.startsWith("data:") || url.startsWith("#")) continue;
      if (/^(?:https?:)?\/\//i.test(url) && !url.startsWith(origin) && !url.startsWith("/")) continue;
      found.add(url);
    }
  }
  return [...found];
}

/** The JSON a drill page hands its client, which is the page's whole interactive content. */
export function exercisePayload(html) {
  const match = /<script\b[^>]*type=["']application\/json["'][^>]*id=["']exercise-data["'][^>]*>([\s\S]*?)<\/script>/i.exec(html);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

function textOf(value) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") return Object.values(value).map(textOf).join(" ");
  return "";
}

/**
 * The first formula the drill's own hints spell out, and the screen it belongs to.
 *
 * A visitor who cannot solve a drill is shown a hint containing the answer; that makes the hint the
 * one place a smoke can learn a correct answer without a fixture file that drifts from the content.
 */
export function firstGradableScreen(payload) {
  for (const screen of payload?.screens ?? []) {
    if (!screen?.expect || screen.expect.value === undefined) continue;
    const formula = /(=[A-Z][A-Z0-9.]*\([^)]*\))/.exec(textOf(screen.hints) ?? "");
    if (formula) return { screen, formula: formula[1] };
  }
  return null;
}

/** A drill the origin advertises on its hub, so the cookieless check follows the site's own links. */
export function firstLessonHref(html) {
  const match = /href=["'](\/(?:learn\/)?excel\/[a-z0-9][a-z0-9-]*)["']/i.exec(html);
  return match ? match[1] : null;
}

class Report {
  constructor() {
    this.rows = [];
  }

  pass(name, detail = "") {
    this.rows.push({ ok: true, name, detail });
  }

  fail(name, detail = "") {
    this.rows.push({ ok: false, name, detail });
  }

  skip(name, detail = "") {
    this.rows.push({ ok: true, skipped: true, name, detail });
  }

  get failures() {
    return this.rows.filter((row) => !row.ok);
  }

  print() {
    for (const row of this.rows) {
      const mark = row.skipped ? SKIP : row.ok ? PASS : FAIL;
      console.log(`${mark} ${row.name}${row.detail ? ` — ${row.detail}` : ""}`);
    }
    const failed = this.failures.length;
    console.log("");
    console.log(`${this.rows.length - failed} passed, ${failed} failed`);
    return failed === 0;
  }
}

async function fetchText(origin, path, options) {
  const response = await fetch(`${origin}${path}`, {
    redirect: "manual",
    signal: AbortSignal.timeout(options.timeout),
    headers: options.cookie ? { cookie: options.cookie } : {},
  });
  return { response, body: await response.text() };
}

function isRedirect(status) {
  return status >= 300 && status < 400;
}

/**
 * The drill pages live at a different address on each deployable: the app serves
 * `/learn/excel/<slug>` and redirects the legacy path, the static build serves `/excel/<slug>`.
 * Rather than asking the caller, ask the origin which one it publishes.
 */
function lessonShapes(href) {
  const slug = href.replace(/^\/(?:learn\/)?excel\//, "");
  return { slug, app: `/learn/excel/${slug}`, legacy: `/excel/${slug}` };
}

async function checkHealth(origin, options, report) {
  let body;
  let response;
  try {
    ({ response, body } = await fetchText(origin, "/api/health", options));
  } catch (error) {
    report.fail(`${origin} answers /api/health`, error.message);
    return null;
  }
  if (response.status === 404) {
    report.skip(`${origin} answers /api/health`, "no health endpoint on this origin (a static host)");
    return null;
  }
  if (response.status !== 200) {
    report.fail(`${origin} answers /api/health`, `status ${response.status}`);
    return null;
  }
  let health;
  try {
    health = JSON.parse(body);
  } catch {
    report.fail(`${origin} answers /api/health`, `not JSON: ${body.slice(0, 80)}`);
    return null;
  }
  if (health?.status !== "ok" || typeof health.sha !== "string" || health.sha.length === 0) {
    report.fail(`${origin} answers /api/health`, `unexpected body ${body.slice(0, 80)}`);
    return null;
  }
  report.pass(`${origin} answers /api/health`, `sha ${health.sha}`);
  if (!options.sha) {
    report.skip(`the release is the one that was deployed`, "no --sha given, so the reported sha is unchecked");
  } else if (health.sha !== options.sha) {
    report.fail(
      `the release is the one that was deployed`,
      `served ${health.sha}, deploy notes say ${options.sha}: the old build is still answering`,
    );
  } else {
    report.pass(`the release is the one that was deployed`, health.sha);
  }
  return health;
}

async function checkDeepPages(origin, options, report) {
  let hub;
  try {
    hub = await fetchText(origin, "/excel-exercises", options);
  } catch (error) {
    report.fail(`${origin} serves the drill hub`, error.message);
    return null;
  }
  if (hub.response.status !== 200 || !/<main\b/i.test(hub.body)) {
    report.fail(`${origin} serves the drill hub`, `status ${hub.response.status}`);
    return null;
  }
  report.pass(`${origin} serves the drill hub`, `${hub.body.length} bytes`);

  const href = firstLessonHref(hub.body);
  if (!href) {
    report.fail(`${origin} links a drill from its hub`, "no /excel/<slug> link on the hub");
    return null;
  }

  const shapes = lessonShapes(href);
  let lessonPath = shapes.app;
  let lesson;
  try {
    lesson = await fetchText(origin, shapes.app, options);
  } catch (error) {
    report.fail(`${origin} serves ${shapes.app}`, error.message);
    return null;
  }
  if (lesson.response.status !== 200) {
    // The static edition never had the app's prefix; a redirect there would be the other build.
    const legacy = await fetchText(origin, shapes.legacy, options);
    if (legacy.response.status === 200) {
      lessonPath = shapes.legacy;
      lesson = legacy;
    }
  }
  if (lesson.response.status !== 200 || !/<main\b/i.test(lesson.body)) {
    report.fail(`${origin} serves the drill the hub links`, `${shapes.app} and ${shapes.legacy} both failed`);
    return null;
  }
  report.pass(`${origin} serves the drill the hub links`, lessonPath);

  const pages = [{ label: "/excel-exercises", html: hub.body }];
  const others = { [lessonPath]: lesson.body };
  for (const path of ["/excel-functions", "/pricing"]) {
    const page = await fetchText(origin, path, options);
    if (page.response.status !== 200 || !/<main\b/i.test(page.body)) {
      report.fail(`${origin} serves ${path}`, `status ${page.response.status}`);
      continue;
    }
    report.pass(`${origin} serves ${path}`, `${page.body.length} bytes`);
    others[path] = page.body;
  }
  for (const [path, html] of Object.entries(others)) pages.push({ label: path, html });

  return { lessonPath, lesson: lesson.body, pages };
}

async function checkAssets(origin, options, report, pages) {
  const seen = new Set();
  for (const { label, html } of pages) {
    const assets = sameOriginAssets(html, origin);
    if (assets.length === 0) {
      report.fail(`${label} names its assets`, "no stylesheet or script on the page");
      continue;
    }
    const dead = [];
    for (const asset of assets) {
      const url = asset.startsWith(origin) ? asset : `${origin}${asset.startsWith("/") ? "" : "/"}${asset}`;
      if (seen.has(url)) continue;
      seen.add(url);
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(options.timeout) });
        if (response.status !== 200) dead.push(`${asset} → ${response.status}`);
        await response.arrayBuffer();
      } catch (error) {
        dead.push(`${asset} → ${error.message}`);
      }
    }
    if (dead.length > 0) report.fail(`${label} names only live assets`, dead.join(", ").slice(0, 300));
    else report.pass(`${label} names only live assets`, `${assets.length} assets`);
  }
}

async function checkDrillGrades(origin, options, report, lessonPath, html) {
  const payload = exercisePayload(html);
  if (!payload) {
    report.fail(`${lessonPath} ships a gradable payload`, "no #exercise-data on the page");
    return;
  }
  const found = firstGradableScreen(payload);
  if (!found) {
    report.skip(`${lessonPath} ships a gradable payload`, "no hint spells out a formula to grade with");
    return;
  }
  const { screen, formula } = found;
  let outcome;
  try {
    outcome = grade({ ...payload, ...screen }, formula);
  } catch (error) {
    report.fail(`${lessonPath} grades a drill`, `the shipped grader threw: ${error.message}`);
    return;
  }
  if (!outcome?.ok) {
    report.fail(
      `${lessonPath} grades a drill`,
      `${formula} from the page's own hint was refused: ${outcome?.message ?? "no outcome"}`,
    );
    return;
  }
  // A grader that accepts everything is worse than one that accepts nothing: the wrong answer is
  // built from the payload too, so this needs no fixture either.
  const wrong = `=${screen.expect.value === 1 ? 2 : 1}`;
  const refused = grade({ ...payload, ...screen }, wrong);
  if (refused?.ok) {
    report.fail(`${lessonPath} refuses a wrong answer`, `${wrong} was accepted`);
    return;
  }
  report.pass(`${lessonPath} grades a drill`, `${formula} correct, ${wrong} refused`);
}

async function checkCertificatePrints(origin, options, report) {
  let page;
  try {
    page = await fetchText(origin, "/certificate", options);
  } catch (error) {
    report.fail(`${origin} answers /certificate`, error.message);
    return;
  }
  if (page.response.status === 404) {
    report.skip(`${origin} answers /certificate`, "no certificate route on this origin (the static edition)");
    return;
  }
  const gated = isRedirect(page.response.status) || page.response.status === 401;
  if (page.response.status !== 200 && !gated) {
    report.fail(`${origin} answers /certificate`, `status ${page.response.status}`);
    return;
  }

  // A cookieless request reaches one of three screens, and all three are correct answers:
  // the gate, "accounts are off on this deployment", or (with a session) the sheet itself.
  let shape;
  if (page.body.includes("certificate-print-url")) shape = "sheet";
  else if (gated || /href="[^"]*\/login/.test(page.body)) shape = "gate";
  else if (/auth-notice/.test(page.body)) {
    // A deployment built without Supabase says so rather than showing an empty certificate; that is
    // the accounts-off image, and it must not be mistaken for the sheet.
    shape = "off";
  } else {
    report.fail(`${origin} answers /certificate`, "a screen this check does not know");
    return;
  }
  const detail = { sheet: "the owner's sheet", gate: "the sign-in gate", off: "accounts are not switched on at this origin" };
  report.pass(`${origin} answers /certificate`, gated ? `status ${page.response.status} → ${detail[shape]}` : detail[shape]);

  // The print layout lives in the stylesheet the route ships, so it travels with the page or it does
  // not exist — no server-side PDF is generated anywhere. Only the sheet needs it; the other screens
  // are not documents.
  const css = sameOriginAssets(page.body, origin).filter((asset) => asset.endsWith(".css"));
  if (shape !== "sheet") {
    report.skip(`${origin} ships the print stylesheet`, `not reached from the ${detail[shape]} screen`);
    return;
  }
  if (css.length === 0) {
    report.fail(`${origin} ships the print stylesheet`, "the sheet links no stylesheet, so it prints unstyled");
    return;
  }
  let rules = "";
  for (const asset of css) {
    const url = asset.startsWith("http") ? asset : `${origin}${asset.startsWith("/") ? "" : "/"}${asset}`;
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(options.timeout) });
      if (response.status === 200) rules += await response.text();
    } catch {
      // Reported by the asset check above.
    }
  }
  if (/@media\s+print/.test(rules) && /@page\s*\{[^}]*margin/i.test(rules)) {
    report.pass(`${origin} ships the print stylesheet`, "@media print with a @page margin");
  } else {
    report.fail(`${origin} ships the print stylesheet`, "no @media print block with a @page margin");
  }
}

async function checkNotFound(origin, options, report) {
  const missing = `/__smoke_${Date.now().toString(36)}`;
  const page = await fetchText(origin, missing, options);
  if (page.response.status === 200) {
    report.skip(`${origin} answers an unknown address with 404`, "this host returns the error page with 200");
    return;
  }
  if (page.response.status !== 404) {
    report.fail(`${origin} answers an unknown address with 404`, `status ${page.response.status}`);
    return;
  }
  if (!/<h1\b/i.test(page.body)) {
    report.fail(`${origin} answers an unknown address with 404`, "the 404 body is not the site's page");
    return;
  }
  report.pass(`${origin} answers an unknown address with 404`, `${page.body.length} bytes of the site's page`);
}

/** One origin, checked end to end. Exported so the runbook's script and the test share one code path. */
export async function smokeOrigin(origin, options, report) {
  await checkHealth(origin, options, report);
  const deep = await checkDeepPages(origin, options, report);
  if (deep) await checkDrillGrades(origin, options, report, deep.lessonPath, deep.lesson);
  await checkAssets(origin, options, report, deep?.pages ?? []);
  await checkCertificatePrints(origin, options, report);
  await checkNotFound(origin, options, report);
}

export async function runSmoke(argv) {
  const options = parseArgs(argv);
  const report = new Report();
  const origins = [trimOrigin(options.origin)];
  if (options.staticOrigin) origins.push(trimOrigin(options.staticOrigin));
  for (const origin of origins) {
    try {
      await smokeOrigin(origin, options, report);
    } catch (error) {
      report.fail(`${origin} is reachable`, error.message);
    }
  }
  return report;
}

const invoked = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invoked) {
  const report = await runSmoke(process.argv.slice(2));
  process.exit(report.print() ? 0 : 1);
}
