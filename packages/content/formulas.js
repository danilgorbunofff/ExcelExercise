/**
 * The problem pages: one Markdown file per question a person types into a search box — "how do I look
 * a value up when it is to the left of the key" — answered on the page and drilled on the page.
 *
 * A note (`articles.js`) is about a function. A problem page is about a job, and the job is the title,
 * the `question` field and the search term all at once. That is why the rules here are stricter about
 * shape and looser about vocabulary than a note's:
 *
 * - The first block is a paragraph, and it is the answer. A page that opens with a heading is a page
 *   that made the reader scroll to find out whether it is the right page.
 * - `## Answer` starts with the formula, in a code span, as the very first thing in the section. The
 *   reader who is already late for a meeting copies one line and leaves; that line is the page.
 * - `## Why it works`, `## What goes wrong` and `## Practice` are all present and non-empty. The first
 *   explains, the second is the part people actually come back for, and the third is where the islands
 *   are rendered — a `## Practice` heading with nothing under it is a page with a hole in it.
 * - `## What goes wrong` has exactly one table. Two tables is a page arguing with itself about which
 *   symptom belongs to which fix; none is a page that never says how it fails.
 * - 500 to 1,200 words. A problem page is a page, not a chapter: the reader has a question, not an
 *   afternoon.
 * - One to four drills, as lesson slugs. One drill is a page that shows and does not let you try; five
 *   is a page that has quietly become a course.
 * - `function` is upper-case, because it is printed as a defined term and matched against the notes.
 * - `family` is one of four, because the hub groups the pages and the reader arrives wanting "a lookup
 *   problem", not "alphabetical by slug".
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { CODES } from "../grader/index.js";
import { parseMarkdown, sectionIds, wordCount } from "./markdown.js";
import { practises } from "./articles.js";

export const REQUIRED_SECTIONS = ["answer", "why-it-works", "what-goes-wrong", "practice"];

/** The word band a problem page has to land in: a page, not a stub and not a book. */
export const WORD_FLOOR = 500;
export const WORD_CEILING = 1200;

/** How many drills one problem page may borrow. Four is the whole arc of one job. */
export const MIN_DRILLS = 1;
export const MAX_DRILLS = 4;

/** The four shelves the hub groups by. A page that fits none of them belongs on a different site. */
export const FAMILIES = ["lookup", "aggregate", "count", "round"];

const FIELDS = ["title", "question", "summary", "description", "function", "family", "drills", "updated"];

const REQUIRED_FIELDS = ["title", "question", "summary", "description", "function", "family", "updated"];

/** A lesson slug, so a typo is a parse error rather than a page with no drill under it. */
const DRILL_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** The error codes the grader can return, so a "what goes wrong" table cannot promise one it cannot. */
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
  if (fields.drills === undefined) throw new Error(`${name}: frontmatter is missing "drills"`);
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

/** Every link in a page's body, of every block type: prose, list items and table cells count alike. */
function linksOf(blocks) {
  const text = blocks
    .map((block) => {
      if (block.type === "table") return [block.header, ...block.rows.flat()].join(" ");
      if (block.type === "list") return block.items.join(" ");
      return block.text ?? "";
    })
    .join("\n");
  return [...text.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)].map((match) => ({ text: match[1], href: match[2] }));
}

/** One to four drills, from `drills: a, b, c`, in the order the reader should meet them. */
function drillsOf(fields, name) {
  const drills = fields.drills
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (drills.length < MIN_DRILLS || drills.length > MAX_DRILLS) {
    throw new Error(`${name}: has ${drills.length} drills, expected ${MIN_DRILLS} to ${MAX_DRILLS}`);
  }
  const seen = new Set();
  for (const slug of drills) {
    if (!DRILL_SLUG.test(slug)) throw new Error(`${name}: "${slug}" is not a lesson slug`);
    if (seen.has(slug)) throw new Error(`${name}: the drill "${slug}" is listed twice`);
    seen.add(slug);
  }
  return drills;
}

/**
 * One problem page, parsed and checked against the rules above. Everything one file can decide is
 * decided here; the things that need the rest of the site (does this drill exist, does this link
 * resolve, is there a note for this function) are `formulaProblems` below.
 */
export function parseFormula(text, { name }) {
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
  for (const required of REQUIRED_SECTIONS) {
    if (sectionBlocks(blocks, required).length === 0) {
      throw new Error(`${name}: "## ${required}" has nothing under it`);
    }
  }

  // The answer section leads with the formula: the first inline thing a reader sees there is a code
  // span that starts with `=`. A paragraph that warms up first defeats the point of the section.
  const answer = sectionBlocks(blocks, "answer");
  if (answer[0]?.type !== "p") throw new Error(`${name}: "## Answer" must open with the formula, as a paragraph`);
  const lead = /^`([^`]+)`/.exec(answer[0].text);
  if (!lead) throw new Error(`${name}: "## Answer" does not lead with a formula in a code span`);
  if (!lead[1].startsWith("=")) throw new Error(`${name}: "## Answer" leads with "${lead[1]}", not a formula`);

  const wrongTables = sectionBlocks(blocks, "what-goes-wrong").filter((block) => block.type === "table");
  if (wrongTables.length !== 1) {
    throw new Error(`${name}: "What goes wrong" has ${wrongTables.length} tables, expected exactly 1`);
  }
  for (const code of codeSpans([wrongTables[0].header, ...wrongTables[0].rows.flat()].join(" "))) {
    if (!code.startsWith("#")) continue;
    if (!GRADER_CODES.has(code)) throw new Error(`${name}: "${code}" is not an error the grader returns`);
  }

  const words = wordCount(blocks);
  if (words < WORD_FLOOR) throw new Error(`${name}: ${words} words, below the ${WORD_FLOOR}-word floor`);
  if (words > WORD_CEILING) throw new Error(`${name}: ${words} words, above the ${WORD_CEILING}-word ceiling`);

  if (!/^[A-Z][A-Z0-9.]*$/.test(fields.function)) {
    throw new Error(`${name}: function "${fields.function}" is not upper-case`);
  }
  if (!FAMILIES.includes(fields.family)) {
    throw new Error(`${name}: family "${fields.family}" is not one of ${FAMILIES.join(", ")}`);
  }
  if (!fields.question.endsWith("?")) throw new Error(`${name}: question must be the question, ending in "?"`);
  if (fields.title === fields.question) throw new Error(`${name}: title repeats the question; give the answer a name`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fields.updated)) throw new Error(`${name}: updated must be YYYY-MM-DD`);

  const drills = drillsOf(fields, name);

  return {
    slug: name.replace(/\.md$/, ""),
    title: fields.title,
    question: fields.question,
    summary: fields.summary,
    description: fields.description,
    function: fields.function,
    family: fields.family,
    drills,
    // The first drill is the page's own lesson: the one rendered first and the one linked back to.
    drill: drills[0],
    answer: lead[1],
    updated: fields.updated,
    blocks,
    links: linksOf(blocks),
    words,
  };
}

/** Every problem page in a folder, ordered by slug so the hub and the sitemap are stable between builds. */
export function loadFormulas(dir) {
  const names = readdirSync(dir)
    .filter((name) => name.endsWith(".md"))
    .sort();
  return names.map((name) => parseFormula(readFileSync(join(dir, name), "utf8"), { name }));
}

/**
 * The checks that need the whole site: a problem page whose drill does not exist, whose links 404, or
 * that stands alone in the silo. A page nobody can reach is a page that answers nobody, and the silo
 * is only worth building if every page in it has a way in and a way out.
 */
export function formulaProblems({ formulas, lessons, paths }) {
  const problems = [];
  const seen = new Set();
  for (const formula of formulas) {
    if (seen.has(formula.slug)) problems.push(`${formula.slug}: two files produce this slug`);
    seen.add(formula.slug);

    const borrowed = [];
    for (const slug of formula.drills) {
      const lesson = lessons.find((entry) => entry.slug === slug);
      if (!lesson) {
        problems.push(`${formula.slug}: the drill "${slug}" does not exist`);
        continue;
      }
      borrowed.push(lesson);
    }
    if (borrowed.length > 0 && !borrowed.some((lesson) => practises(lesson, formula.function))) {
      problems.push(
        `${formula.slug}: none of its drills uses ${formula.function}, so the page drills something else`,
      );
    }

    const internal = formula.links.filter((link) => link.href.startsWith("/"));
    for (const link of internal) {
      if (!paths.has(link.href.replace(/[?#].*$/, ""))) problems.push(`${formula.slug}: "${link.href}" is not a page`);
    }

    const noteLinks = internal.filter((link) => link.href.startsWith("/excel-functions/"));
    if (noteLinks.length === 0) {
      problems.push(`${formula.slug}: links to no function note, so the reader leaves without the explanation`);
    }
    const siblings = internal.filter(
      (link) => link.href.startsWith("/formulas/") && link.href !== `/formulas/${formula.slug}`,
    );
    if (siblings.length < 2) {
      problems.push(`${formula.slug}: links to ${siblings.length} sibling problem pages, expected 2`);
    }
  }
  return problems;
}
