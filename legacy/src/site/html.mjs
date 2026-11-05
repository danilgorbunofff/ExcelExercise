/**
 * String helpers for building HTML. Every value that comes from content is escaped
 * here; there is no template engine to remember to escape in.
 */

const ENTITIES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function esc(value) {
  return String(value).replace(/[&<>"']/g, (char) => ENTITIES[char]);
}

/** Renders `name="value"` pairs, skipping null, undefined and false values. */
export function attrs(pairs) {
  return Object.entries(pairs)
    .filter(([, value]) => value !== null && value !== undefined && value !== false)
    .map(([key, value]) => (value === true ? ` ${key}` : ` ${key}="${esc(value)}"`))
    .join("");
}

/** JSON that is safe to drop inside a <script> element. */
export function jsonScript(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e");
}

/** Inline an SVG icon from vendor/icons so it costs no extra request. */
export function inlineIcon(svg, { size = 16, className = "icon" } = {}) {
  if (!svg) return "";
  return svg
    .replace(/<svg\b/, `<svg${attrs({ class: className, width: size, height: size, "aria-hidden": "true", focusable: "false" })}`)
    .replace(/\s+xmlns="[^"]*"/, "");
}

/** Numbers keep their exact value, text keeps its case, a blank cell stays blank. */
export function formatCell(value) {
  if (value === null || value === undefined) return "";
  return String(value);
}

/**
 * Prose as the page prints it: one `<p>` per blank-line separated block. A single newline inside a
 * block is a hand-wrapped line, not a paragraph break, so it collapses to a space. Content written
 * before explanations had paragraphs lands here as exactly one `<p>`, unchanged.
 */
export function renderParagraphs(text, { className = null } = {}) {
  const attribute = className ? ` class="${esc(className)}"` : "";
  return String(text ?? "")
    .split(/\n[ \t]*\n/)
    .map((paragraph) => paragraph.replace(/\s*\n\s*/g, " ").trim())
    .filter((paragraph) => paragraph.length > 0)
    .map((paragraph) => `<p${attribute}>${esc(paragraph)}</p>`)
    .join("\n        ");
}
