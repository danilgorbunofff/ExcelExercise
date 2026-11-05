/**
 * The shortcut silo gate.
 *
 * `shortcuts.js` decides whether a page *parses*; this decides whether it can ship: the family is one
 * the hub has a shelf for, no family is missing, the practice drill exists and actually asks for keys,
 * the frontmatter fits a search result, the prose has no marketing vocabulary, every link resolves, and
 * no two pages are the same page twice.
 *
 * The table itself is not prose and is not checked as prose — a key cell is not a sentence. It is
 * checked for the thing that hurts a table: the same chord listed twice across the silo, which is what
 * a copy-pasted page looks like.
 *
 * It collects rather than throws, and it reports every page with its numbers, because a silo being
 * written is not a broken build. `shortcuts --strict` is what CI runs.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { loadContent, loadShortcuts, parseShortcut, shortcutProblems } from "../content/index.js";
import { servedPaths } from "./articles.js";
import { checkText, loadRules, shingles } from "./copy.js";

/** Five consecutive words repeated across two pages is a copied paragraph with the nouns swapped. */
const SHINGLE = 5;

/** Past this share of one page's sentences appearing in another, one of them is padding. */
const SHARED = 0.3;

/**
 * The fields a reader reads as prose, in page order. The keys are excluded deliberately: `Ctrl + Tab`
 * is not a sentence, and the copy rules would score it as one.
 */
export function shortcutFields(shortcut) {
  const fields = [
    { field: "title", text: shortcut.title, prose: false },
    { field: "summary", text: shortcut.summary, prose: true },
    { field: "description", text: shortcut.description, prose: false },
  ];
  for (const block of shortcut.blocks) {
    if (block.type === "p") fields.push({ field: "paragraph", text: block.text, prose: true });
    else if (block.type === "h2" || block.type === "h3") fields.push({ field: "heading", text: block.text, prose: true });
    else if (block.type === "list") {
      // One field per item: joined with a newline, five short bullets read as one 60-word paragraph and
      // the shape rules fire on the list itself rather than on an item that ran long.
      block.items.forEach((item, position) => fields.push({ field: `list[${position + 1}]`, text: item, prose: true }));
    }
  }
  // The table is checked row by row instead of as one joined string. The row as written carries the
  // `— ` the page uses to separate keys from a note, and the typography rule forbids em dashes — so
  // checking the joined row would fail every row for using the shape the parser requires. The action
  // and the note are still read; the keys are not.
  for (const row of shortcut.rows) {
    fields.push({ field: "action", text: row.action, prose: false });
    for (const platform of shortcut.platforms) {
      const { note } = row.cells[platform];
      if (note) fields.push({ field: `${platform} note`, text: note, prose: true });
    }
  }
  return fields;
}

function checkShortcut(shortcut, { where, rules, push }) {
  if (shortcut.title.length < rules.seoTitle.minChars || shortcut.title.length > rules.seoTitle.maxChars) {
    push({
      rule: "seo-field",
      severity: "warn",
      field: "title",
      where,
      message: `title is ${shortcut.title.length} characters; keep it ${rules.seoTitle.minChars}-${rules.seoTitle.maxChars}`,
      excerpt: shortcut.title,
    });
  }
  if (
    shortcut.description.length < rules.seoDescription.minChars ||
    shortcut.description.length > rules.seoDescription.maxChars
  ) {
    push({
      rule: "seo-field",
      severity: "warn",
      field: "description",
      where,
      message: `description is ${shortcut.description.length} characters; keep it ${rules.seoDescription.minChars}-${rules.seoDescription.maxChars}`,
      excerpt: shortcut.description,
    });
  }

  // A tab is a promise: every row has to answer on it, and a page that offers Windows has to have
  // Windows answers rather than a column of `No default`.
  for (const platform of shortcut.platforms) {
    const answered = shortcut.rows.filter((row) => !row.cells[platform].none).length;
    if (answered === 0) {
      push({
        rule: "empty-tab",
        severity: "error",
        field: platform,
        where,
        message: `the page offers the ${platform} tab and no row answers on it`,
        excerpt: null,
      });
    }
  }

  for (const field of shortcutFields(shortcut)) {
    const result = checkText(field.text, { field: field.field, where, prose: field.prose, rules });
    for (const finding of result.findings) push(finding);
  }
}

/**
 * The whole report. `paths` is the set of addresses the build serves, so a page that links to a drill
 * that does not exist fails here instead of in a browser.
 */
export function lintShortcuts(contentDir, { rules = loadRules(), paths = null } = {}) {
  const dir = join(contentDir, "shortcuts");
  const findings = [];
  const push = (finding) => findings.push(finding);
  const shortcuts = [];

  if (existsSync(dir)) {
    for (const name of readdirSync(dir).filter((entry) => entry.endsWith(".md")).sort()) {
      const where = `content/shortcuts/${name}`;
      try {
        shortcuts.push(parseShortcut(readFileSync(join(dir, name), "utf8"), { name }));
      } catch (error) {
        push({ rule: "structure", severity: "error", field: "file", where, message: error.message, excerpt: null });
      }
    }
  }

  const content = loadContent(contentDir);
  for (const shortcut of shortcuts) {
    checkShortcut(shortcut, { where: `content/shortcuts/${shortcut.slug}.md`, rules, push });
  }

  const problems = shortcutProblems({
    shortcuts,
    lessons: content.exercises,
    paths: paths ?? servedPaths(content.exercises, [], [], shortcuts),
  });
  for (const message of problems) {
    push({ rule: "broken-link", severity: "error", field: "link", where: "content/shortcuts", message, excerpt: null });
  }

  for (let a = 0; a < shortcuts.length; a += 1) {
    for (let b = a + 1; b < shortcuts.length; b += 1) {
      const left = shingles(shortcutText(shortcuts[a]), SHINGLE);
      const right = shingles(shortcutText(shortcuts[b]), SHINGLE);
      const shared = [...left].filter((entry) => right.has(entry)).length;
      const ratio = Math.min(left.size, right.size) === 0 ? 0 : shared / Math.min(left.size, right.size);
      if (ratio > SHARED) {
        push({
          rule: "duplicate-page",
          severity: "warn",
          field: "body",
          where: `content/shortcuts/${shortcuts[b].slug}.md`,
          message: `${Math.round(ratio * 100)}% of its sentences also appear in ${shortcuts[a].slug}`,
          excerpt: null,
        });
      }
    }
  }

  const errors = findings.filter((finding) => finding.severity === "error").length;
  const rows = shortcuts.reduce((total, shortcut) => total + shortcut.rows.length, 0);
  return {
    shortcuts,
    findings,
    stats: {
      shortcuts: shortcuts.length,
      rows,
      findings: findings.length,
      errors,
      byRule: findings.reduce((counts, finding) => {
        counts[finding.rule] = (counts[finding.rule] ?? 0) + 1;
        return counts;
      }, {}),
    },
  };
}

/** Every word a reader reads, with the keys left out, so two pages cannot share a paragraph by luck. */
function shortcutText(shortcut) {
  return [
    shortcut.whenToUseIt,
    shortcut.checkedAgainst,
    ...shortcut.rows.map((row) => row.action),
  ]
    .filter(Boolean)
    .join("\n");
}
