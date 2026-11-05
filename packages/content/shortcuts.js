/**
 * The shortcut pages: one page per family of Excel shortcuts — moving around, selecting, formatting,
 * writing formulas, handling data, arranging windows.
 *
 * The page is the table. Prose about keyboard shortcuts is a paragraph that a reader skims and
 * forgets; a table of `Action | Windows | macOS | Sheets` is the thing they came for and the thing they
 * print. So the rules here are about the table:
 *
 * - Exactly one table, under `## Shortcuts`, with those four columns and no others. A page with a
 *   table and three paragraphs is a page whose author has not decided what it is.
 * - Every platform cell starts with a code span holding the keys, optionally followed by `— ` and a
 *   sentence. The code span is what the renderer turns into a keycap; a cell that is plain prose has
 *   no keycap and cannot be read at a glance.
 * - Where Windows or macOS has no default, the cell says `No default` and names the menu it lives on.
 *   That is a shorter, more honest answer than a guessed chord, and this silo is exactly where a
 *   guess would be believed.
 * - `platforms` lists the tabs the page offers, in the site's order. `windows` and `macos` are always
 *   there; `sheets` is listed only when the family has real Google Sheets answers, and when it is not,
 *   every Sheets cell must say `No default`. One field, one meaning, no page promising a tab it cannot
 *   fill.
 * - `## When to use it`, `## Checked against` and `## Practice` are required. The first is why the
 *   family exists, the second is the version each row was checked against (shortcuts drift between
 *   releases, so a date-and-version line is the honest answer to "is this current?"), and the third
 *   names one drill that asks for these keys, so the page ends somewhere the reader can press
 *   something.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { parseMarkdown } from "./markdown.js";

/** The six families, in the order the hub lists them. A page outside this list has no shelf. */
export const FAMILIES = [
  { id: "navigation", title: "Moving around the workbook" },
  { id: "selection", title: "Selecting cells and ranges" },
  { id: "formatting", title: "Formatting what you selected" },
  { id: "formulas", title: "Writing and checking formulas" },
  { id: "data", title: "Sorting, filtering and cleaning data" },
  { id: "window", title: "Windows, panes and sheets" },
];

/** The platform tabs, in the order the table shows them and the page renders them. */
export const PLATFORMS = ["windows", "macos", "sheets"];

/** The table header, exactly: one action, one chord per platform. */
export const COLUMNS = ["Action", "Windows", "macOS", "Sheets"];

/** The tabs every page offers. A family adds `sheets` only when it has real Sheets answers. */
export const REQUIRED_PLATFORMS = ["windows", "macos"];

export const REQUIRED_SECTIONS = ["shortcuts", "when-to-use-it", "checked-against", "practice"];

/** The word "No default" for a platform cell, and the em dash that separates keys from a note. */
export const NO_DEFAULT = "No default";
const NOTE_SEPARATOR = "—";

/** A table long enough to be a family and short enough to be read without scrolling to the end. */
export const ROW_FLOOR = 8;
export const ROW_CEILING = 24;

/** Platform labels as a reader sees them, keyed by the frontmatter spelling. */
export const PLATFORM_TITLES = { windows: "Windows", macos: "macOS", sheets: "Google Sheets" };

/** The heading each platform's column carries, so the table and the tabs cannot name a platform twice. */
const COLUMN_OF = { windows: "Windows", macos: "macOS", sheets: "Sheets" };

const FIELDS = ["title", "summary", "description", "platforms", "updated"];

const REQUIRED_FIELDS = ["title", "summary", "description", "platforms", "updated"];

/** A lesson slug, so a practice link that points at a typo is a parse error rather than a dead link. */
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

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
  return { fields, body: text.slice(match[0].length) };
}

/** The blocks under one `##` heading, so a section can be checked for what it has to contain. */
function sectionBlocks(blocks, id) {
  const start = blocks.findIndex((block) => block.type === "h2" && block.id === id);
  if (start === -1) return [];
  const end = blocks.findIndex((block, position) => position > start && block.type === "h2");
  return blocks.slice(start + 1, end === -1 ? blocks.length : end);
}

const sectionText = (blocks, id) =>
  sectionBlocks(blocks, id)
    .map((block) => (block.type === "list" ? block.items.join(" ") : (block.text ?? "")))
    .join("\n");

/**
 * One platform cell: the keys in a code span, then optionally an em dash and a sentence. This is the
 * only shape the renderer can turn into a keycap, so it is the shape the parser insists on.
 */
export function parseKeyCell(cell, { where }) {
  const match = /^`([^`]+)`\s*(.*)$/.exec(cell);
  if (!match) throw new Error(`${where}: "${cell}" does not lead with the keys in a code span`);
  const keys = match[1].trim();
  if (!keys) throw new Error(`${where}: the code span is empty`);
  const rest = match[2].trim();
  if (rest && !rest.startsWith(NOTE_SEPARATOR)) {
    throw new Error(`${where}: "${cell}" has text after the keys that does not start with an em dash`);
  }
  const note = rest ? rest.slice(NOTE_SEPARATOR.length).trim() : "";
  return {
    keys,
    note: note || null,
    // The same words a reader sees, so a no-default cell is found by reading rather than by guessing
    // at an empty string.
    none: keys.toLowerCase() === NO_DEFAULT.toLowerCase(),
  };
}

/** `platforms: windows, macos` — in the site's order, starting with the two that are always offered. */
function platformsOf(fields, name) {
  const platforms = fields.platforms
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  for (const platform of platforms) {
    if (!PLATFORMS.includes(platform)) {
      throw new Error(`${name}: platform "${platform}" is not one of ${PLATFORMS.join(", ")}`);
    }
  }
  const expected = platforms.slice(0, REQUIRED_PLATFORMS.length);
  if (expected.join(",") !== REQUIRED_PLATFORMS.join(",")) {
    throw new Error(`${name}: platforms must start with ${REQUIRED_PLATFORMS.join(", ")}`);
  }
  if (new Set(platforms).size !== platforms.length) throw new Error(`${name}: a platform is listed twice`);
  return platforms;
}

/**
 * The table, checked row by row. The columns are the platforms plus the action, in that order, so a
 * row can be paired with a tab without either side knowing the other's index.
 */
function tableOf(blocks, { name, platforms }) {
  const tables = sectionBlocks(blocks, "shortcuts").filter((block) => block.type === "table");
  if (tables.length !== 1) {
    throw new Error(`${name}: "## Shortcuts" has ${tables.length} tables, expected exactly 1`);
  }
  const table = tables[0];
  if (table.header.join("|") !== COLUMNS.join("|")) {
    throw new Error(`${name}: the table header is "${table.header.join(" | ")}", expected "${COLUMNS.join(" | ")}"`);
  }
  if (table.rows.length < ROW_FLOOR || table.rows.length > ROW_CEILING) {
    throw new Error(`${name}: ${table.rows.length} rows, expected ${ROW_FLOOR} to ${ROW_CEILING}`);
  }

  const { header, rows } = table;
  return rows.map((row, position) => {
    const where = `${name}: row ${position + 1}`;
    const action = row[header.indexOf("Action")].trim();
    if (action.length < 8) throw new Error(`${where}: the action is too short to be an action`);
    const cells = {};
    for (const platform of PLATFORMS) {
      cells[platform] = parseKeyCell(row[header.indexOf(COLUMN_OF[platform])], {
        where: `${where}, ${platform}`,
      });
    }
    if (cells.windows.keys === cells.macos.keys && cells.windows.none && cells.macos.none) {
      throw new Error(`${where}: Windows and macOS both have no default, so the row belongs on neither tab`);
    }
    const listed = platforms.includes("sheets");
    if (!listed && !cells.sheets.none) {
      throw new Error(`${where}: the Sheets cell has an answer but "platforms" does not list sheets`);
    }
    return { action, cells };
  });
}

/** The one lesson a page hands the reader: the drill that asks for these keys. */
function practiceOf(blocks, { name, paths }) {
  const text = sectionText(blocks, "practice");
  const links = [...text.matchAll(/\[([^\]]+)\]\((\/excel\/[^)]+)\)/g)].map((match) => ({
    text: match[1],
    slug: match[2].slice("/excel/".length).replace(/[?#].*$/, ""),
  }));
  if (links.length !== 1) {
    throw new Error(`${name}: "## Practice" links ${links.length} drills, expected exactly 1`);
  }
  const { slug } = links[0];
  if (!SLUG.test(slug)) throw new Error(`${name}: "${slug}" is not a lesson slug`);
  if (paths && !paths.has(`/excel/${slug}`)) throw new Error(`${name}: the practice drill "${slug}" is not a page`);
  return slug;
}

/**
 * One shortcut page, parsed and checked against the rules above. Everything one file can decide is
 * decided here; whether the practice drill exists and actually asks for keys is `shortcutProblems`.
 */
export function parseShortcut(text, { name, paths = null }) {
  const { fields, body } = frontmatter(text, name);
  let blocks;
  try {
    blocks = parseMarkdown(body);
  } catch (error) {
    throw new Error(`${name}: ${error.message}`);
  }

  const sections = blocks.filter((block) => block.type === "h2").map((block) => block.id);
  for (const required of REQUIRED_SECTIONS) {
    if (!sections.includes(required)) throw new Error(`${name}: missing the "## ${required}" section`);
  }
  if (new Set(sections).size !== sections.length) throw new Error(`${name}: a section heading is repeated`);
  for (const required of REQUIRED_SECTIONS) {
    if (required === "shortcuts") continue; // the table is its content, checked below
    if (!sectionText(blocks, required).trim()) throw new Error(`${name}: "## ${required}" has nothing under it`);
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(fields.updated)) throw new Error(`${name}: updated must be YYYY-MM-DD`);
  const platforms = platformsOf(fields, name);
  const rows = tableOf(blocks, { name, platforms });
  const practice = practiceOf(blocks, { name, paths });

  return {
    slug: name.replace(/\.md$/, ""),
    title: fields.title,
    summary: fields.summary,
    description: fields.description,
    platforms,
    rows,
    practice,
    updated: fields.updated,
    whenToUseIt: sectionText(blocks, "when-to-use-it").trim(),
    checkedAgainst: sectionText(blocks, "checked-against").trim(),
    blocks,
  };
}

/** Every shortcut page in a folder, ordered by the family list so the hub and the sitemap are stable. */
export function loadShortcuts(dir) {
  const names = readdirSync(dir)
    .filter((name) => name.endsWith(".md"))
    .sort();
  const pages = names.map((name) => parseShortcut(readFileSync(join(dir, name), "utf8"), { name }));
  const order = new Map(FAMILIES.map((family, position) => [family.id, position]));
  return pages.sort((a, b) => (order.get(a.slug) ?? order.size) - (order.get(b.slug) ?? order.size));
}

/**
 * The checks that need the whole site: the practice drill exists and can be pressed, the family is one
 * the hub has a shelf for, no family is forgotten, and no chord is listed twice across the silo. The
 * last one catches the copy-paste that turns six pages into one page six times.
 */
export function shortcutProblems({ shortcuts, lessons, paths }) {
  const problems = [];
  const known = new Set(FAMILIES.map((family) => family.id));
  const seen = new Set();

  for (const shortcut of shortcuts) {
    if (seen.has(shortcut.slug)) problems.push(`${shortcut.slug}: two files produce this slug`);
    seen.add(shortcut.slug);
    if (!known.has(shortcut.slug)) {
      problems.push(`${shortcut.slug}: not one of the six families (${[...known].join(", ")})`);
    }

    const lesson = lessons.find((entry) => entry.slug === shortcut.practice);
    if (!lesson) {
      problems.push(`${shortcut.slug}: the practice drill "${shortcut.practice}" does not exist`);
    } else {
      const presses = (lesson.screens ?? []).filter(
        (screen) => screen.type === "chord" || screen.type === "sequence",
      );
      if (presses.length === 0) {
        problems.push(
          `${shortcut.slug}: "${shortcut.practice}" asks for formulas, not keys, so practising this page is a different drill`,
        );
      }
    }
  }

  for (const family of known) {
    if (!seen.has(family)) problems.push(`${family}: a family with no page — the hub would link nowhere`);
  }

  const chords = new Map();
  for (const shortcut of shortcuts) {
    for (const row of shortcut.rows) {
      for (const platform of shortcut.platforms) {
        const { keys, none } = row.cells[platform];
        if (none) continue;
        const key = `${platform}:${keys.toLowerCase().replace(/\s+/g, "")}`;
        if (chords.has(key)) {
          problems.push(
            `${shortcut.slug}: "${row.action}" repeats ${PLATFORM_TITLES[platform]} keys already on ${chords.get(key)}`,
          );
        } else {
          chords.set(key, shortcut.slug);
        }
      }
    }
  }

  return problems;
}
