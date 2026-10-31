/**
 * The Markdown this site writes in, and nothing more.
 *
 * Articles are authored as `.md` because prose in a JSON string is prose nobody edits twice. The cost
 * is that a general Markdown renderer brings a grammar of things this site never wants: raw HTML (an
 * injection surface), reference links, footnotes, nested lists. So the subset is closed on purpose: a
 * line that does not match one of the block forms below is an error rather than a silent paragraph, so
 * a typo in a table fails the build instead of publishing a stray pipe.
 *
 * This module only parses. The HTML is in `legacy/src/site/markdown.mjs`, because `packages/` is
 * shared with the Next app and knows nothing about markup.
 *
 * Blocks: `## h2`, `### h3`, paragraphs, `- ` list items, and pipe tables.
 */

const H2 = /^##\s+(.+)$/;
const H3 = /^###\s+(.+)$/;
const LI = /^[-*]\s+(.+)$/;
const TABLE_ROW = /^\|(.+)\|$/;
const TABLE_RULE = /^\|(?:[\s:-]+\|)+$/;

/** The id a heading gets, so an in-page link and the fragment in an anchor cannot disagree. */
export function headingId(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseTable(rows) {
  if (rows.length < 2) throw new Error("markdown: a table needs a header row and a rule row");
  if (!TABLE_RULE.test(rows[1])) throw new Error(`markdown: table rule row is malformed: ${rows[1]}`);
  const cells = (row) =>
    row
      .replace(/^\||\|$/g, "")
      .split("|")
      .map((cell) => cell.trim());
  const header = cells(rows[0]);
  const body = rows.slice(2).map(cells);
  for (const row of body) {
    if (row.length !== header.length) {
      throw new Error(`markdown: a table row has ${row.length} cells, the header has ${header.length}`);
    }
  }
  return { type: "table", header, rows: body };
}

/**
 * Parse a document into blocks. Throws on anything outside the subset, with the line number, because
 * the only reader of this error is the person who just wrote the line.
 */
export function parseMarkdown(source) {
  const lines = String(source ?? "").replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let paragraph = [];
  let list = null;
  let table = null;

  const flush = () => {
    if (paragraph.length > 0) {
      blocks.push({ type: "p", text: paragraph.join(" ") });
      paragraph = [];
    }
    if (list) {
      blocks.push({ type: "list", items: list });
      list = null;
    }
    if (table) {
      blocks.push(parseTable(table));
      table = null;
    }
  };

  lines.forEach((raw, position) => {
    const line = raw.trimEnd();
    const where = `line ${position + 1}`;

    if (line.trim() === "") {
      flush();
      return;
    }
    if (TABLE_ROW.test(line.trim())) {
      if (paragraph.length > 0 || list) flush();
      table = [...(table ?? []), line.trim()];
      return;
    }
    if (line.trim().startsWith("|")) {
      throw new Error(`markdown: ${where} looks like a table but does not close with a pipe`);
    }
    if (table) flush();
    if (H3.test(line)) {
      flush();
      const text = line.match(H3)[1].trim();
      blocks.push({ type: "h3", text, id: headingId(text) });
      return;
    }
    if (H2.test(line)) {
      flush();
      const text = line.match(H2)[1].trim();
      blocks.push({ type: "h2", text, id: headingId(text) });
      return;
    }
    if (/^#\s/.test(line)) throw new Error(`markdown: ${where} uses an h1; the page title is the only h1`);
    if (LI.test(line)) {
      if (paragraph.length > 0) flush();
      list = [...(list ?? []), line.match(LI)[1].trim()];
      return;
    }
    if (list) flush();
    if (/^>\s/.test(line)) throw new Error(`markdown: ${where} uses a blockquote, which this subset does not have`);
    if (/^```/.test(line)) throw new Error(`markdown: ${where} opens a fence; use the syntax block instead`);
    paragraph.push(line.trim());
  });
  flush();
  return blocks;
}

/** The section headings of a document, in order, as slugs. Used by the article rules. */
export function sectionIds(blocks) {
  return blocks.filter((block) => block.type === "h2").map((block) => block.id);
}

/** Every word a reader would read, for the length rules. Markup lines are not words. */
export function wordCount(blocks) {
  const text = blocks
    .map((block) => {
      if (block.type === "table") return [...block.header, ...block.rows.flat()].join(" ");
      if (block.type === "list") return block.items.join(" ");
      return block.text ?? "";
    })
    .join(" ");
  return text.split(/\s+/).filter(Boolean).length;
}
