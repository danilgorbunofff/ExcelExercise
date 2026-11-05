/**
 * The articles: Markdown files with a small frontmatter block, one file per function or question,
 * written to be found in a search result and to answer the question before the reader scrolls.
 *
 * The rules are enforced here rather than reviewed by eye, because "answer first" and "an errors table"
 * are exactly the things that quietly go missing when a post is edited six months later. Every rule
 * below failed on a real draft at least once:
 *
 * - The first block is a paragraph. A post that opens with a heading makes the reader scroll before it
 *   says anything, and the answer-first paragraph is the part that earns the click.
 * - `## Syntax`, `## Examples`, `## What goes wrong`, `## Alternatives`, `## Other apps`, `## Practice`
 *   and `## Questions` are all present. They are the skeleton of a reference post; a post missing one
 *   is a post that answered half a question. The two comparison sections are what a reader deciding
 *   between tools is actually looking for, and they keep the note from being a page about one function
 *   in a vacuum.
 * - `## Alternatives` names another function in a code span and says which version of Excel it needs.
 *   "Use INDEX/MATCH instead" without a version is advice that breaks on the reader's install.
 * - `## Other apps` names at least two of Sheets, VBA and Google, in a code span. A note that only
 *   exists inside Excel is not useful to the reader who has the sheet open somewhere else.
 * - Two to four worked examples. One is an advert, ten is a manual.
 * - 700 to 1,800 words. Under is thin, over is a book that nobody finishes and that competes with
 *   itself for the same query.
 * - One to six drills, listed as lesson slugs. One drill is a note with a single way in; six is the
 *   note that hands the reader the whole arc from the first exact match to the two-way lookup.
 * - An error code in the `## What goes wrong` table is a code the grader can actually produce. A
 *   `#SPILL!` in the table is a promise the drill behind it cannot keep.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { CODES } from "../grader/index.js";
import { parseMarkdown, sectionIds, wordCount } from "./markdown.js";

export const REQUIRED_SECTIONS = [
  "syntax",
  "examples",
  "what-goes-wrong",
  "alternatives",
  "other-apps",
  "practice",
  "questions",
];

/** The word band a note has to land in: a note is a page, not a chapter and not a stub. */
export const WORD_FLOOR = 700;
export const WORD_CEILING = 1800;

/** How many drills one note may borrow. Six is the whole arc of a function; seven is a second note. */
export const MIN_DRILLS = 1;
export const MAX_DRILLS = 6;

/**
 * The keys a note's frontmatter may carry. `exercise` is the old single-drill key, still read with a
 * warning so an existing note does not break on the day the template changes.
 */
const FIELDS = ["title", "summary", "description", "function", "drills", "exercise", "syntax", "updated"];

/** The keys every note carries. Which drill key is present is decided by `drillsOf`. */
const REQUIRED_FIELDS = ["title", "summary", "description", "function", "syntax", "updated"];

/** A lesson slug, so a typo is a parse error rather than a page with no drill under it. */
const DRILL_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** The error codes the grader can return, so an errors table cannot promise one it cannot produce. */
const GRADER_CODES = new Set(Object.values(CODES));

function frontmatter(text, name) {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!match) throw new Error(`${name}: no frontmatter block`);
  const fields = {};
  for (const line of match[1].split("\n")) {
    if (line.trim() === "" || line.startsWith("#")) continue;
    const split = line.indexOf(":");
    if (split === -1) throw new Error(`${name}: frontmatter line is not "key: value": ${line}`);
    const key = line.slice(0, split).trim();
    let value = line.slice(split + 1).trim();
    if (!FIELDS.includes(key)) throw new Error(`${name}: unknown frontmatter field "${key}"`);
    if (/^".*"$/.test(value) || /^'.*'$/.test(value)) value = value.slice(1, -1);
    if (fields[key] !== undefined) throw new Error(`${name}: "${key}" is set twice`);
    fields[key] = value;
  }
  for (const key of REQUIRED_FIELDS) {
    if (!fields[key]) throw new Error(`${name}: frontmatter is missing "${key}"`);
  }
  if (fields.drills === undefined && fields.exercise === undefined) {
    throw new Error(`${name}: frontmatter is missing "drills"`);
  }
  return { fields, body: text.slice(match[0].length) };
}

/** The blocks under one `##` heading, so a section can be checked for what it has to contain. */
function sectionBlocks(blocks, id) {
  const start = blocks.findIndex((block) => block.type === "h2" && block.id === id);
  if (start === -1) return [];
  const end = blocks.findIndex((block, position) => position > start && block.type === "h2");
  return blocks.slice(start + 1, end === -1 ? blocks.length : end);
}

function sectionText(blocks, id) {
  return sectionBlocks(blocks, id)
    .map((block) => {
      if (block.type === "table") return [block.header, ...block.rows.flat()].join(" ");
      if (block.type === "list") return block.items.join(" ");
      return block.text ?? "";
    })
    .join("\n");
}

const codeSpans = (text) => [...text.matchAll(/`([^`]+)`/g)].map((match) => match[1]);

/** The version markers a reader can act on. `2019` is the oldest version that has XLOOKUP's rivals. */
const VERSIONS = ["2019", "365", "Excel 2021", "Sheets"];

/** The other tools a reader might have open instead. Two of them is a comparison, one is a mention. */
const OTHER_APPS = ["Sheets", "VBA", "Google"];

/**
 * One to six drills, from `drills: a, b, c`, or from the older single `exercise:`. The array comes back
 * as the note's whole arc, in the order the reader should meet it, so the page can render island one
 * before island three.
 */
function drillsOf(fields, name) {
  const listed = fields.drills !== undefined;
  const legacy = fields.exercise !== undefined;
  if (listed && legacy) {
    throw new Error(`${name}: "drills" and "exercise" are both set; a note lists its drills once`);
  }
  const drills = listed
    ? fields.drills.split(",").map((value) => value.trim()).filter(Boolean)
    : [fields.exercise];
  if (drills.length < MIN_DRILLS || drills.length > MAX_DRILLS) {
    throw new Error(`${name}: has ${drills.length} drills, expected ${MIN_DRILLS} to ${MAX_DRILLS}`);
  }
  const seen = new Set();
  for (const slug of drills) {
    if (!DRILL_SLUG.test(slug)) throw new Error(`${name}: "${slug}" is not a lesson slug`);
    if (seen.has(slug)) throw new Error(`${name}: the drill "${slug}" is listed twice`);
    seen.add(slug);
  }
  return { drills, legacy };
}

/**
 * One article, parsed and checked against the rules above. Everything rules can decide is decided
 * here; the things that need the rest of the site (does this exercise exist, does this link resolve)
 * are `articleProblems` below, because they cannot be answered from one file.
 */
export function parseArticle(text, { name }) {
  const { fields, body } = frontmatter(text, name);
  let blocks;
  try {
    blocks = parseMarkdown(body);
  } catch (error) {
    throw new Error(`${name}: ${error.message}`);
  }

  if (blocks[0]?.type !== "p") throw new Error(`${name}: the first block must be the answer, as a paragraph`);

  const sections = sectionIds(blocks);
  for (const required of REQUIRED_SECTIONS) {
    if (!sections.includes(required)) throw new Error(`${name}: missing the "## ${required}" section`);
  }
  if (new Set(sections).size !== sections.length) throw new Error(`${name}: a section heading is repeated`);

  // The examples are `###` headings inside the `## Examples` section, so they are counted from the
  // blocks rather than from `sectionIds`, which only knows `<h2>`.
  const examples = blocks.filter((block) => block.type === "h3" && /^Example \d+\b/.test(block.text)).length;
  if (examples < 2 || examples > 4) {
    throw new Error(`${name}: has ${examples} worked examples, expected 2 to 4 ("### Example 1" ...)`);
  }

  const wrongTable = sectionBlocks(blocks, "what-goes-wrong").find((block) => block.type === "table");
  if (!wrongTable) throw new Error(`${name}: "What goes wrong" needs a table of the errors`);
  for (const code of codeSpans([wrongTable.header, ...wrongTable.rows.flat()].join(" "))) {
    if (!code.startsWith("#")) continue;
    if (!GRADER_CODES.has(code)) throw new Error(`${name}: "${code}" is not an error the grader returns`);
  }

  // The two comparison sections are read by someone choosing between tools, so they are checked for
  // what that reader needs: a named rival with a version, and the other apps by name.
  const alternatives = sectionText(blocks, "alternatives");
  if (!codeSpans(alternatives).some((span) => /[A-Z][A-Z0-9.]*\(/.test(span))) {
    throw new Error(`${name}: "## Alternatives" names no other function in a code span`);
  }
  if (!VERSIONS.some((version) => alternatives.includes(version))) {
    throw new Error(`${name}: "## Alternatives" says which version it needs (${VERSIONS.join(", ")})`);
  }
  const otherApps = sectionText(blocks, "other-apps");
  const named = OTHER_APPS.filter((app) => otherApps.includes(app));
  if (named.length < 2) {
    throw new Error(`${name}: "## Other apps" names ${named.length} of ${OTHER_APPS.join("/")}, expected 2`);
  }
  if (codeSpans(otherApps).length === 0) {
    throw new Error(`${name}: "## Other apps" needs a code span, so the claim is checkable`);
  }

  const words = wordCount(blocks);
  if (words < WORD_FLOOR) throw new Error(`${name}: ${words} words, below the ${WORD_FLOOR}-word floor`);
  if (words > WORD_CEILING) throw new Error(`${name}: ${words} words, above the ${WORD_CEILING}-word ceiling`);

  if (!fields.title.includes(fields.function)) {
    throw new Error(`${name}: the title does not contain "${fields.function}"`);
  }
  if (!/^=/.test(fields.syntax)) throw new Error(`${name}: syntax must be a formula, starting with "="`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fields.updated)) throw new Error(`${name}: updated must be YYYY-MM-DD`);

  const { drills, legacy } = drillsOf(fields, name);

  return {
    slug: name.replace(/\.md$/, ""),
    title: fields.title,
    summary: fields.summary,
    description: fields.description,
    function: fields.function,
    drills,
    // The first drill is the note's own lesson: the one the page opens with and the one that links
    // back. Kept as `exercise` because the page, the hub and the build all resolve it by that name.
    exercise: drills[0],
    legacyExercise: legacy,
    syntax: fields.syntax,
    updated: fields.updated,
    blocks,
    words,
  };
}

/** Every article in a folder, ordered by slug so the hub and the sitemap are stable between builds. */
export function loadArticles(dir) {
  const names = readdirSync(dir)
    .filter((name) => name.endsWith(".md"))
    .sort();
  return names.map((name) => parseArticle(readFileSync(join(dir, name), "utf8"), { name }));
}

/**
 * The checks that need the whole site: an article that points at a lesson that does not exist, or at a
 * link that 404s, is a page that loses the reader it just earned.
 *
 * A drill also has to be about the note's function. Lessons have no "function" field, so the check is
 * the one the lesson actually makes: its screens require, or its documentation mentions, the function
 * the note is about. A SUM note whose three drills are all contrast lessons is a note that never shows
 * the function it is named for.
 */

/** Whether this lesson is about `func`: a screen requires it, or the lesson's notes name it. */
export function practises(lesson, func) {
  const wanted = func.toLowerCase();
  const names = (value) => String(value ?? "").toLowerCase() === wanted;
  for (const screen of lesson.screens ?? []) {
    for (const requirement of screen.require ?? []) {
      if (names(requirement.func) || names(requirement.fn)) return true;
    }
    for (const reference of screen.docs?.reference ?? []) {
      if (names(reference.func) || names(reference.name)) return true;
    }
  }
  return false;
}

export function articleProblems({ articles, lessons, paths }) {
  const problems = [];
  const seen = new Set();
  for (const article of articles) {
    if (seen.has(article.slug)) problems.push(`${article.slug}: two files produce this slug`);
    seen.add(article.slug);
    const borrowed = [];
    for (const slug of article.drills) {
      const lesson = lessons.find((entry) => entry.slug === slug);
      if (!lesson) {
        problems.push(`${article.slug}: the drill "${slug}" does not exist`);
        continue;
      }
      borrowed.push(lesson);
    }
    if (borrowed.length > 0 && !borrowed.some((lesson) => practises(lesson, article.function))) {
      problems.push(
        `${article.slug}: none of its drills exercises ${article.function}, so the note practises something else`,
      );
    }
    for (const flagged of article.blocks.filter((block) => block.type === "list")) {
      for (const item of flagged.items) {
        for (const [, , href] of item.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)) {
          if (!href.startsWith("/")) continue;
          if (!paths.has(href.replace(/[?#].*$/, ""))) problems.push(`${article.slug}: "${href}" is not a page`);
        }
      }
    }
  }
  return problems;
}
