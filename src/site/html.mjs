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

/** `28 Oct 2026` — one date drives the byline and <lastmod> alike. */
export function humanDate(isoDate) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${isoDate}T00:00:00Z`));
}

/** Numbers keep their exact value, text keeps its case, a blank cell stays blank. */
export function formatCell(value) {
  if (value === null || value === undefined) return "";
  return String(value);
}
