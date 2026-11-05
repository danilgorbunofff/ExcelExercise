#!/usr/bin/env node
/**
 * The phase-7 scorecard, computed from the log the app already writes.
 *
 * `docs/phases/07-post-validation-expansion.md` names five numbers that decide whether the content
 * is worth expanding. Four of them are ratios of events this process already emits, and until now
 * there was no way to get them without hand-counting JSON in a function log. This prints them, with
 * the denominator beside every rate, because a rate without one is a number somebody quotes.
 *
 * Two rules the output obeys:
 *
 *   * **A denominator under `MIN_DENOMINATOR` is not a rate.** It prints `insufficient data`, not
 *     `0%`, because four readers out of six is not evidence that the content does not work. The line
 *     still shows the counts, so an operator can see how far from 100 it is.
 *   * **The same input prints the same bytes.** `--fixture` ignores the clock and reads the whole
 *     committed log, so `tests/content-report.test.js` can pin the output instead of approximating it.
 *
 * Usage:
 *
 *   node scripts/content-report.mjs --log ./events.jsonl --gsc ./queries.csv --since 7d
 *   node scripts/content-report.mjs --fixture            # the committed log, no clock
 *   node scripts/content-report.mjs --fixture --json     # the same numbers, for a dashboard
 *
 * `--log` is the exported stdout of the deployment: one JSON object per line, as `lib/log-event.js`
 * writes them. `--gsc` is optional: without it metric 5 prints `not measured`.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { loadSite } from "../lib/site.js";

const HERE = dirname(import.meta.filename);
const FIXTURES = resolve(HERE, "fixtures/content-report");

/**
 * Below this, a rate is a story about six people. The phase-7 plan asks for a real read, so the report
 * refuses to give one rather than printing a percentage nobody should act on.
 */
const MIN_DENOMINATOR = 100;

/** The five metrics, in the order the phase-7 plan lists them. */
const TARGETS = [
  { key: "start", label: "exercise start rate", target: 0.25, format: "percent" },
  { key: "complete", label: "exercise completion rate", target: 0.5, format: "percent" },
  { key: "offer", label: "offer submit rate", target: 0.03, format: "percent" },
  { key: "pages", label: "pages with a real exercise", target: 50, format: "count" },
  { key: "clicks", label: "organic clicks into an exercise", target: 1, format: "count" },
];

/** One event line as an object, or `null` when the line is not one. */
function parseLine(line) {
  const text = line.trim();
  if (!text) return null;
  try {
    const record = JSON.parse(text);
    return record && typeof record.event === "string" ? record : null;
  } catch {
    return null;
  }
}

/** A window start from `7d`, `24h`, `2026-10-01`, or `all`. */
function parseSince(text, now) {
  if (text === "all") return null;
  const span = /^(\d+)([dh])$/.exec(text);
  if (span) {
    const ms = Number(span[1]) * (span[2] === "d" ? 86_400_000 : 3_600_000);
    return new Date(now.getTime() - ms);
  }
  const at = new Date(`${text}T00:00:00.000Z`);
  if (Number.isNaN(at.getTime())) throw new Error(`--since: cannot read "${text}" as 7d, 24h or a date`);
  return at;
}

/** Every event in a log file, plus how many lines were not events. */
function readLog(path) {
  const text = readFileSync(path, "utf8");
  const lines = text.split("\n");
  const events = [];
  let skipped = 0;
  for (const line of lines) {
    const record = parseLine(line);
    if (record) events.push(record);
    else if (line.trim()) skipped += 1;
  }
  return { events, skipped };
}

/** How many of these events carry that name. */
function count(events, name) {
  return events.filter((record) => record.event === name).length;
}

/** CSV rows, quoted fields included, because a Search Console export quotes its page URLs. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') quoted = false;
      else field += char;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") field += char;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/**
 * Organic clicks into a page that carries an exercise.
 *
 * The export is per page, not per query, so a row is a page. A path is an exercise when it is one of the
 * three silos this site serves an exercise from, and clicks are summed rather than counted once, because
 * metric 5 asks whether the content brings anyone in at all.
 */
function organicClicks(path) {
  if (!path || !existsSync(path)) return null;
  const rows = parseCsv(readFileSync(path, "utf8"));
  const header = rows.shift() ?? [];
  const at = (name) => header.findIndex((cell) => cell.trim().toLowerCase() === name);
  const pageAt = at("page");
  const clicksAt = at("clicks");
  if (pageAt < 0 || clicksAt < 0) return null;

  const exercise = /^\/(?:learn\/excel|formulas|excel-functions)\/[^/]+\/?$/;
  let clicks = 0;
  let pages = 0;
  for (const row of rows) {
    const value = Number(row[clicksAt] ?? 0);
    if (!(value > 0)) continue;
    let pathname;
    try {
      pathname = new URL(row[pageAt]).pathname;
    } catch {
      pathname = row[pageAt] ?? "";
    }
    if (!exercise.test(pathname)) continue;
    clicks += value;
    pages += 1;
  }
  return { clicks, pages };
}

/** Indexable pages whose document carries an exercise: every lesson, note, problem page and family. */
function pagesWithExercise() {
  const { index, articles, formulas, shortcuts } = loadSite();
  return {
    total: index.length + articles.length + formulas.length + shortcuts.length,
    parts: { lessons: index.length, notes: articles.length, problems: formulas.length, families: shortcuts.length },
  };
}

/** The verdict word, which is the only place `insufficient data` is decided. */
function verdictOf(value) {
  if (value === null) return "not measured";
  if (value.insufficient) return "insufficient data";
  return value.passes ? "pass" : "fail";
}

/** A rate, or the counts alone when the denominator is too small to make one. */
function ratio(numerator, denominator, target) {
  if (denominator < MIN_DENOMINATOR) {
    return { raw: `${numerator}/${denominator}`, insufficient: true, passes: false };
  }
  return { raw: formatRate(numerator, denominator), insufficient: false, passes: numerator / denominator >= target };
}

/** A count against a target: no denominator, so no refusal. */
function tally(value, target) {
  return { raw: String(value), insufficient: false, passes: value >= target };
}

function pad(text, width) {
  return String(text).padEnd(width);
}

function formatRate(numerator, denominator) {
  const percent = ((numerator / denominator) * 100).toFixed(1);
  return `${percent}% (${numerator}/${denominator})`;
}

function main(argv) {
  const args = argv.slice(2);
  const flag = (name, fallback) => {
    const at = args.indexOf(name);
    return at < 0 ? fallback : args[at + 1];
  };
  const has = (name) => args.includes(name);

  const fixture = has("--fixture");
  const asJson = has("--json");
  const logPath = fixture ? resolve(FIXTURES, "events.jsonl") : flag("--log", "");
  const gscPath = fixture ? resolve(FIXTURES, "search-console.csv") : flag("--gsc", "");

  if (!logPath) {
    console.error("content-report: pass --log <file>, or --fixture to read the committed log");
    return 2;
  }

  const now = fixture ? new Date("2026-11-01T00:00:00.000Z") : new Date();
  const since = fixture ? null : parseSince(flag("--since", "7d"), now);
  const { events, skipped } = readLog(logPath);
  const inWindow = since ? events.filter((record) => new Date(record.at).getTime() >= since.getTime()) : events;

  const rendered = count(inWindow, "content_rendered");
  const started = count(inWindow, "drill_started");
  const completed = count(inWindow, "drill_completed");
  const paywalls = count(inWindow, "paywall_shown");
  const checkouts = count(inWindow, "checkout_started");
  const pages = pagesWithExercise();
  const organic = organicClicks(gscPath);

  const goal = Object.fromEntries(TARGETS.map((target) => [target.key, target.target]));
  const values = {
    start: ratio(started, rendered, goal.start),
    complete: ratio(completed, started, goal.complete),
    offer: ratio(checkouts, paywalls, goal.offer),
    // The count is not a rate: it is every page whose document ships an exercise, and the parts are printed
    // so a drop in one silo does not read as "the content shrank" in general.
    pages: {
      ...tally(pages.total, goal.pages),
      raw: `${pages.total} (${pages.parts.lessons}+${pages.parts.notes}+${pages.parts.problems}+${pages.parts.families})`,
    },
    clicks: organic ? { ...tally(organic.clicks, goal.clicks), raw: `${organic.clicks} over ${organic.pages} pages` } : null,
  };

  const window = since ? `since ${since.toISOString().slice(0, 10)}` : "all fixture events";
  const rows = TARGETS.map((target) => {
    const value = values[target.key];
    const shown = value ? value.raw : "-";
    const asks = target.format === "percent" ? `>= ${(target.target * 100).toFixed(0)}%` : `>= ${target.target}`;
    return { label: target.label, value: shown, goal: asks, verdict: verdictOf(value) };
  });

  if (asJson) {
    console.log(JSON.stringify({ window, events: { read: events.length, inWindow: inWindow.length, skipped }, metrics: rows }, null, 2));
    return 0;
  }

  const width = Math.max(...rows.map((row) => row.label.length), "metric".length);
  const lines = [
    `content funnel — ${window}`,
    `log: ${events.length} lines, ${inWindow.length} in window, ${skipped} skipped`,
    "",
    `${pad("metric", width)}  ${pad("value", 26)}${pad("target", 10)}verdict`,
    ...rows.map((row) => `${pad(row.label, width)}  ${pad(row.value, 26)}${pad(row.goal, 10)}${row.verdict}`),
  ];

  if (rows.some((row) => row.verdict === "insufficient data")) {
    lines.push("", `A rate needs ${MIN_DENOMINATOR} events in its denominator. Below that the counts are printed and no rate is.`);
  }
  console.log(lines.join("\n"));
  return 0;
}

try {
  process.exitCode = main(process.argv);
} catch (error) {
  // A missing log and an unreadable `--since` are both operator mistakes: say which, and stop.
  console.error(`content-report: ${error.message}`);
  process.exitCode = 2;
}
