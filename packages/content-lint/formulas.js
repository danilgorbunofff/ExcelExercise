/**
 * The problem silo gate.
 *
 * `formulas.js` decides whether a problem page *parses*; this decides whether it can ship: the drills
 * it borrows exist and can actually be drilled, the frontmatter fits a search result, the prose has no
 * marketing vocabulary, the four-section shape survived, every link resolves, and no two pages are the
 * same page twice.
 *
 * It collects rather than throws, and it reports every page with its numbers, because a silo being
 * written is not a broken build. `formulas --strict` is what CI runs.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { formulaProblems, loadArticles, loadContent, parseFormula } from "../content/index.js";
import { servedPaths } from "./articles.js";
import { checkText, loadRules, shingles } from "./copy.js";

/** Five consecutive words repeated across two pages is a copied paragraph with the nouns swapped. */
const SHINGLE = 5;

/** Past this share of one page's sentences appearing in another, one of them is padding. */
const SHARED = 0.3;

/** The fields a reader reads as prose, in page order. The answer code span is a formula, not prose. */
export function formulaFields(formula) {
  const fields = [
    { field: "title", text: formula.title, prose: false },
    { field: "question", text: formula.question, prose: true },
    { field: "summary", text: formula.summary, prose: true },
    { field: "description", text: formula.description, prose: false },
  ];
  for (const block of formula.blocks) {
    if (block.type === "p") fields.push({ field: "paragraph", text: block.text, prose: true });
    else if (block.type === "h2" || block.type === "h3") fields.push({ field: "heading", text: block.text, prose: true });
    else if (block.type === "list") {
      // One field per item: joined with a newline, five short bullets read as one 60-word paragraph and
      // the shape rules fire on the list itself rather than on an item that ran long.
      block.items.forEach((item, position) => fields.push({ field: `list[${position + 1}]`, text: item, prose: true }));
    }
    else if (block.type === "table") {
      const rows = [block.header, ...block.rows].map((row) => row.join(" "));
      fields.push({ field: "table", text: rows.join("\n"), prose: false });
    }
  }
  return fields;
}

/**
 * One page's own rules. `lessons` and `notes` are the loaded track, because a problem page is only
 * half a page: the other half is the drill it hands the reader and the note it hands them for the
 * explanation.
 */
function checkFormula(formula, { where, lessons, notes, rules, push }) {
  if (formula.title.length < rules.seoTitle.minChars || formula.title.length > rules.seoTitle.maxChars) {
    push({
      rule: "seo-field",
      severity: "warn",
      field: "title",
      where,
      message: `title is ${formula.title.length} characters; keep it ${rules.seoTitle.minChars}-${rules.seoTitle.maxChars}`,
      excerpt: formula.title,
    });
  }
  if (
    formula.description.length < rules.seoDescription.minChars ||
    formula.description.length > rules.seoDescription.maxChars
  ) {
    push({
      rule: "seo-field",
      severity: "warn",
      field: "description",
      where,
      message: `description is ${formula.description.length} characters; keep it ${rules.seoDescription.minChars}-${rules.seoDescription.maxChars}`,
      excerpt: formula.description,
    });
  }

  // Every drill, not just the first: an island with no screen is a form under a prompt with nothing
  // to grade against, and it is the second drill that tends to be the slug nobody checked.
  for (const slug of formula.drills) {
    const lesson = lessons.find((entry) => entry.slug === slug);
    if (lesson && !(lesson.screens ?? []).length) {
      push({
        rule: "no-drill",
        severity: "error",
        field: "drills",
        where,
        message: `"${slug}" has no screen, so the page ships without the drill it promises`,
        excerpt: null,
      });
    }
  }

  // The silo's job is to borrow from the notes, and every note names the function it covers. When no
  // note covers this page's function, the problem page is the only page for that function on the
  // site — a real gap, but the reader is still served, so this is debt rather than a refusal.
  const covered = notes.some((note) => note.function.split(/[/\s]+/).includes(formula.function));
  if (!covered) {
    push({
      rule: "note-coverage",
      severity: "warn",
      field: "function",
      where,
      message: `no note covers ${formula.function} yet, so this page has no full explanation to link to`,
      excerpt: null,
    });
  }

  for (const field of formulaFields(formula)) {
    const result = checkText(field.text, { field: field.field, where, prose: field.prose, rules });
    for (const finding of result.findings) push(finding);
  }
}

/**
 * The whole report. `paths` is the set of addresses the build serves, so a page that links to a page
 * that does not exist fails here instead of in a browser.
 */
export function lintFormulas(contentDir, { rules = loadRules(), paths = null } = {}) {
  const dir = join(contentDir, "formulas");
  const findings = [];
  const push = (finding) => findings.push(finding);
  const formulas = [];

  if (existsSync(dir)) {
    for (const name of readdirSync(dir).filter((entry) => entry.endsWith(".md")).sort()) {
      const where = `content/formulas/${name}`;
      try {
        formulas.push(parseFormula(readFileSync(join(dir, name), "utf8"), { name }));
      } catch (error) {
        push({ rule: "structure", severity: "error", field: "file", where, message: error.message, excerpt: null });
      }
    }
  }

  const content = loadContent(contentDir);
  const notesDir = join(contentDir, "articles");
  const notes = existsSync(notesDir) ? loadArticles(notesDir) : [];
  for (const formula of formulas) {
    checkFormula(formula, {
      where: `content/formulas/${formula.slug}.md`,
      lessons: content.exercises,
      notes,
      rules,
      push,
    });
  }

  const problems = formulaProblems({
    formulas,
    lessons: content.exercises,
    paths: paths ?? servedPaths(content.exercises, notes, formulas),
  });
  for (const message of problems) {
    push({ rule: "broken-link", severity: "error", field: "link", where: "content/formulas", message, excerpt: null });
  }

  const byQuestion = new Map();
  for (const formula of formulas) {
    const key = formula.question.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (byQuestion.has(key)) {
      push({
        rule: "duplicate-question",
        severity: "warn",
        field: "question",
        where: `content/formulas/${formula.slug}.md`,
        message: `the same question is already asked by ${byQuestion.get(key)} — two pages answer one query`,
        excerpt: formula.question,
      });
    } else {
      byQuestion.set(key, formula.slug);
    }
  }

  for (let a = 0; a < formulas.length; a += 1) {
    for (let b = a + 1; b < formulas.length; b += 1) {
      const left = shingles(formulaText(formulas[a]), SHINGLE);
      const right = shingles(formulaText(formulas[b]), SHINGLE);
      const shared = [...left].filter((entry) => right.has(entry)).length;
      const ratio = Math.min(left.size, right.size) === 0 ? 0 : shared / Math.min(left.size, right.size);
      if (ratio > SHARED) {
        push({
          rule: "duplicate-page",
          severity: "warn",
          field: "body",
          where: `content/formulas/${formulas[b].slug}.md`,
          message: `${Math.round(ratio * 100)}% of its sentences also appear in ${formulas[a].slug}`,
          excerpt: null,
        });
      }
    }
  }

  const errors = findings.filter((finding) => finding.severity === "error").length;
  const words = formulas.reduce((total, formula) => total + formula.words, 0);
  return {
    formulas,
    findings,
    stats: {
      formulas: formulas.length,
      words,
      meanWords: formulas.length ? Math.round(words / formulas.length) : 0,
      findings: findings.length,
      errors,
      byRule: findings.reduce((counts, finding) => {
        counts[finding.rule] = (counts[finding.rule] ?? 0) + 1;
        return counts;
      }, {}),
    },
  };
}

function formulaText(formula) {
  return [formula.question, formula.summary, ...formula.blocks.map((block) => block.text ?? (block.items ?? []).join(" "))]
    .filter(Boolean)
    .join("\n");
}
