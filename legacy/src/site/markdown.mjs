/**
 * Markdown as HTML, for the article pages. The parser lives in `packages/content/markdown.js`; this
 * half owns the escaping and the three inline forms, because that is markup and markup belongs to the
 * site.
 */

import { esc } from "./html.mjs";

const INLINE = [
  [/`([^`]+)`/g, (_, code) => `<code>${code}</code>`],
  [/\*\*([^*]+)\*\*/g, (_, strong) => `<strong>${strong}</strong>`],
  [/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, href) => `<a href="${href}">${text}</a>`],
];

/**
 * Inline markup, applied to text that has already been escaped. Order matters: code first, because a
 * backtick span may contain `**` or brackets, and its contents must survive untouched.
 */
export function inline(text) {
  let out = esc(text);
  for (const [pattern, replace] of INLINE) out = out.replace(pattern, replace);
  return out;
}

/** Blocks back to HTML. `replace` lets a page inject markup where an author wrote a section. */
export function renderBlocks(blocks, { replace } = {}) {
  return blocks
    .map((block) => {
      if (replace && replace[block.id] !== undefined) return replace[block.id];
      if (block.type === "h2") return `<h2 id="${block.id}">${inline(block.text)}</h2>`;
      if (block.type === "h3") return `<h3 id="${block.id}">${inline(block.text)}</h3>`;
      if (block.type === "p") return `<p>${inline(block.text)}</p>`;
      if (block.type === "list") return `<ul>${block.items.map((item) => `<li>${inline(item)}</li>`).join("")}</ul>`;
      if (block.type === "table") {
        const head = block.header.map((cell) => `<th>${inline(cell)}</th>`).join("");
        const body = block.rows
          .map((row) => `<tr>${row.map((cell) => `<td>${inline(cell)}</td>`).join("")}</tr>`)
          .join("");
        return `<div class="table-wrap"><table class="md-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
      }
      throw new Error(`markdown: cannot render block type "${block.type}"`);
    })
    .join("\n");
}
