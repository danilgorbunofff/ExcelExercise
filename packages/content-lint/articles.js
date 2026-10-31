/**
 * The notes gate.
 *
 * `articles.js` decides whether a note *parses*; this decides whether it can ship: the exercise it
 * borrows exists and can actually be drilled, the frontmatter fits a search result, the prose has no
 * marketing vocabulary or generator punctuation, and no two notes are the same note twice.
 *
 * It collects rather than throws, and it reports every note with its numbers, because a rewrite in
 * progress is not a broken build. `--strict` is what CI runs.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { articleProblems, loadContent, parseArticle } from "../content/index.js";
import { checkText, loadRules, shingles } from "./copy.js";

/** Five consecutive words repeated across two notes is a copied paragraph with the nouns swapped. */
const SHINGLE = 5;

/** Past this share of a note's sentences appearing in another note, one of them is padding. */
const SHARED = 0.3;

/**
 * The fields a reader reads as prose, in page order. `syntax` is excluded deliberately: it is a
 * formula spec, and a formula is allowed to be dense.
 */
export function articleFields(article) {
  const fields = [
    { field: "title", text: article.title, prose: false },
    { field: "summary", text: article.summary, prose: true },
    { field: "description", text: article.description, prose: false },
  ];
  for (const block of article.blocks) {
    if (block.type === "p") fields.push({ field: "paragraph", text: block.text, prose: true });
    else if (block.type === "h2" || block.type === "h3") fields.push({ field: "heading", text: block.text, prose: true });
    else if (block.type === "list") fields.push({ field: "list", text: block.items.join("\n"), prose: true });
    else if (block.type === "table") {
      const rows = [block.header, ...block.rows].map((row) => row.join(" "));
      fields.push({ field: "table", text: rows.join("\n"), prose: false });
    }
  }
  return fields;
}

/**
 * One note's own rules. `lessons` is the loaded track, because the note is only half a page: the other
 * half is the lesson it hands the reader, and a note whose lesson has no drill renders a page that
 * tells the reader to practise with nothing under it.
 */
function checkArticle(article, { where, lessons, rules, push }) {
  const title = article.title;
  if (title.length < rules.seoTitle.minChars || title.length > rules.seoTitle.maxChars) {
    push({
      rule: "seo-field",
      severity: "warn",
      field: "title",
      where,
      message: `title is ${title.length} characters; keep it ${rules.seoTitle.minChars}-${rules.seoTitle.maxChars}`,
      excerpt: title,
    });
  }
  const description = article.description;
  if (description.length < rules.seoDescription.minChars || description.length > rules.seoDescription.maxChars) {
    push({
      rule: "seo-field",
      severity: "warn",
      field: "description",
      where,
      message: `description is ${description.length} characters; keep it ${rules.seoDescription.minChars}-${rules.seoDescription.maxChars}`,
      excerpt: description,
    });
  }

  const lesson = lessons.find((entry) => entry.slug === article.exercise);
  if (lesson && !(lesson.screens ?? []).length) {
    push({
      rule: "no-drill",
      severity: "error",
      field: "exercise",
      where,
      message: `"${article.exercise}" has no screen, so the note ships without the drill it promises`,
      excerpt: null,
    });
  }

  for (const field of articleFields(article)) {
    const result = checkText(field.text, { field: field.field, where, prose: field.prose, rules });
    for (const finding of result.findings) push(finding);
  }
}

/**
 * The addresses the static build serves, which is the URL space a note is written in. The Next deploy
 * rewrites lesson paths at the seam; a note is authored once, so it links to the canonical static one.
 */
export function servedPaths(lessons, articles) {
  return new Set([
    "/",
    "/excel-exercises",
    "/excel-functions",
    "/about",
    "/privacy",
    "/terms",
    ...lessons.map((lesson) => `/excel/${lesson.slug}`),
    ...articles.map((article) => `/excel-functions/${article.slug}`),
  ]);
}

/**
 * The whole report. `paths` is the set of addresses the build serves, so a note that links to a page
 * that does not exist fails here instead of in a browser.
 */
export function lintArticles(contentDir, { rules = loadRules(), paths = null } = {}) {
  const dir = join(contentDir, "articles");
  const findings = [];
  const push = (finding) => findings.push(finding);
  const articles = [];

  if (existsSync(dir)) {
    for (const name of readdirSync(dir).filter((entry) => entry.endsWith(".md")).sort()) {
      const where = `content/articles/${name}`;
      try {
        articles.push(parseArticle(readFileSync(join(dir, name), "utf8"), { name }));
      } catch (error) {
        push({ rule: "structure", severity: "error", field: "file", where, message: error.message, excerpt: null });
      }
    }
  }

  const content = loadContent(contentDir);
  for (const article of articles) {
    checkArticle(article, { where: `content/articles/${article.slug}.md`, lessons: content.exercises, rules, push });
  }

  const problems = articleProblems({
    articles,
    lessons: content.exercises,
    paths: paths ?? servedPaths(content.exercises, articles),
  });
  for (const message of problems) {
    push({ rule: "broken-link", severity: "error", field: "link", where: "content/articles", message, excerpt: null });
  }

  const byFunction = new Map();
  for (const article of articles) {
    const key = article.function.toLowerCase();
    if (byFunction.has(key)) {
      push({
        rule: "duplicate-function",
        severity: "warn",
        field: "function",
        where: `content/articles/${article.slug}.md`,
        message: `"${article.function}" is already covered by ${byFunction.get(key)} — two notes answer one query`,
        excerpt: null,
      });
    } else {
      byFunction.set(key, article.slug);
    }
  }

  for (let a = 0; a < articles.length; a += 1) {
    for (let b = a + 1; b < articles.length; b += 1) {
      const left = shingles(articleText(articles[a]), SHINGLE);
      const right = shingles(articleText(articles[b]), SHINGLE);
      const shared = [...left].filter((entry) => right.has(entry)).length;
      const ratio = Math.min(left.size, right.size) === 0 ? 0 : shared / Math.min(left.size, right.size);
      if (ratio > SHARED) {
        push({
          rule: "duplicate-note",
          severity: "warn",
          field: "body",
          where: `content/articles/${articles[b].slug}.md`,
          message: `${Math.round(ratio * 100)}% of its sentences also appear in ${articles[a].slug}`,
          excerpt: null,
        });
      }
    }
  }

  const errors = findings.filter((finding) => finding.severity === "error").length;
  const words = articles.reduce((total, article) => total + article.words, 0);
  return {
    articles,
    findings,
    stats: {
      articles: articles.length,
      words,
      meanWords: articles.length ? Math.round(words / articles.length) : 0,
      findings: findings.length,
      errors,
      byRule: findings.reduce((counts, finding) => {
        counts[finding.rule] = (counts[finding.rule] ?? 0) + 1;
        return counts;
      }, {}),
    },
  };
}

function articleText(article) {
  return [article.summary, ...article.blocks.map((block) => block.text ?? (block.items ?? []).join(" "))]
    .filter(Boolean)
    .join("\n");
}
