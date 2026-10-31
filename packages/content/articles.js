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
 * - `## Syntax`, `## Examples`, `## What goes wrong`, `## Practice`, `## Questions` are all present.
 *   They are the skeleton of a reference post; a post missing one is a post that answered half a
 *   question.
 * - Two to four worked examples. One is an advert, ten is a manual.
 * - 700 to 1,400 words. Under is thin, over is a book that nobody finishes and that competes with
 *   itself for the same query.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { parseMarkdown, sectionIds, wordCount } from "./markdown.js";

export const REQUIRED_SECTIONS = ["syntax", "examples", "what-goes-wrong", "practice", "questions"];

const FIELDS = ["title", "summary", "description", "function", "exercise", "syntax", "updated"];

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
  for (const key of FIELDS) {
    if (!fields[key]) throw new Error(`${name}: frontmatter is missing "${key}"`);
  }
  return { fields, body: text.slice(match[0].length) };
}

const count = (blocks, type) => blocks.filter((block) => block.type === type).length;

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
  if (count(blocks, "table") === 0) throw new Error(`${name}: "What goes wrong" needs a table of the errors`);

  const words = wordCount(blocks);
  if (words < 700) throw new Error(`${name}: ${words} words, below the 700-word floor`);
  if (words > 1400) throw new Error(`${name}: ${words} words, above the 1,400-word ceiling`);

  if (!fields.title.includes(fields.function)) {
    throw new Error(`${name}: the title does not contain "${fields.function}"`);
  }
  if (!/^=/.test(fields.syntax)) throw new Error(`${name}: syntax must be a formula, starting with "="`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fields.updated)) throw new Error(`${name}: updated must be YYYY-MM-DD`);

  return {
    slug: name.replace(/\.md$/, ""),
    title: fields.title,
    summary: fields.summary,
    description: fields.description,
    function: fields.function,
    exercise: fields.exercise,
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
 */
export function articleProblems({ articles, lessons, paths }) {
  const problems = [];
  const seen = new Set();
  for (const article of articles) {
    if (seen.has(article.slug)) problems.push(`${article.slug}: two files produce this slug`);
    seen.add(article.slug);
    if (!lessons.some((lesson) => lesson.slug === article.exercise)) {
      problems.push(`${article.slug}: the exercise "${article.exercise}" does not exist`);
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
