/**
 * Build-time configuration. Nothing here is a secret: it all ends up in the HTML.
 * Every value can be overridden from the environment so the same source can build
 * a preview (localhost) and production (real base URL).
 */

export const FALLBACK_BASE_URL = "http://localhost:4173";
export const SITE_NAME = "Excel Supreme";

const PATH_PREFIX = "/excel";

/** Today in UTC, `YYYY-MM-DD`. Overridable so builds and tests are reproducible. */
export function today(env = process.env) {
  const override = env.SITE_BUILT_AT?.trim();
  if (override) {
    const parsed = new Date(`${override}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(override) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== override) {
      throw new Error(`SITE_BUILT_AT must be a real date such as 2026-10-28, got "${override}"`);
    }
    return override;
  }
  return new Date().toISOString().slice(0, 10);
}

export function siteConfig(env = process.env) {
  const raw = env.SITE_URL?.trim() || FALLBACK_BASE_URL;
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`SITE_URL must be an absolute origin such as https://example.com, got "${raw}"`);
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error(`SITE_URL must be http or https, got "${raw}"`);
  }
  if (parsed.search || parsed.hash || parsed.pathname !== "/") {
    throw new Error(`SITE_URL must be a bare origin without a path, got "${raw}"`);
  }

  return {
    name: SITE_NAME,
    baseUrl: parsed.origin,
    pathPrefix: PATH_PREFIX,
    author: env.SITE_AUTHOR?.trim() || null,
    contact: env.SITE_CONTACT?.trim() || null,
    builtAt: today(env),
    inLanguage: "en",
    // The mobile browser bar: both values are `--bg` (= `--sand-2`) from `tokens.css`, repeated here
    // because a `<meta>` cannot read a custom property. `tests/styles.test.js` compares the three.
    themeColor: { light: "#f9f9f8", dark: "#191918" },
  };
}
