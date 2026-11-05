/**
 * What a share card is for, and what it is not.
 *
 * It is not a second design system: every card is the page's own `<h1>` and description, read back out
 * of the HTML the build just wrote, so a preview cannot describe a page that has since changed. It is
 * not a screenshot either — a screenshot of an exercise grid is unreadable at the 600px a preview is
 * actually shown at.
 *
 * This module holds only the decisions (which card a page gets, what the manifest says, how page copy
 * is read out of a document) and imports nothing. The pixels are drawn in `social-render.mjs`, a child
 * process, because the renderer is async and the static build is not.
 */
export const SOCIAL_SIZE = Object.freeze({ width: 1200, height: 630 });

/** The cards the build renders, in the order it writes them. */
export const CARD_KEYS = Object.freeze(["home", "learn", "pricing", "lesson"]);

/**
 * Which card a page gets. Anything unlisted falls back to the home card: a generic card is a worse
 * preview than a targeted one and a much better one than a broken image on every share.
 */
export function cardKey(path) {
  if (path === "/") return "home";
  if (path === "/pricing") return "pricing";
  // The static edition serves an exercise at `/excel/<slug>`; the app serves the same exercise at
  // `/learn/excel/<slug>`. Both are the lesson card, so the exercise check comes before the dashboard one.
  if (/^\/(learn\/)?excel\//.test(path)) return "lesson";
  if (path === "/learn" || path.startsWith("/learn/")) return "learn";
  return "home";
}

export const CARD_PATH = (key) => `/assets/social/${key}.png`;

/** Absolute for `og:image`, which no crawler resolves relatively. */
export const cardUrl = (config, path) => `${config.baseUrl}${CARD_PATH(cardKey(path))}`;

const ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  mdash: "\u2014",
  ndash: "\u2013",
  hellip: "\u2026",
  lsquo: "\u2018",
  rsquo: "\u2019",
  ldquo: "\u201c",
  rdquo: "\u201d",
};

function decode(text) {
  return text.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (whole, name) => {
    if (/^#x/i.test(name)) return String.fromCodePoint(parseInt(name.slice(2), 16));
    if (/^#\d+$/.test(name)) return String.fromCodePoint(parseInt(name.slice(1), 10));
    return ENTITIES[name] ?? whole;
  });
}

const flatten = (fragment) => decode(fragment.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

/**
 * The copy a card is made of: the page's `<h1>` and its meta description. Falls back to the document
 * `<title>` for the heading, because a card without a heading is not a card.
 */
export function extractCopy(html) {
  const heading = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const description = html.match(/<meta\s+name="description"\s+content="([\s\S]*?)"/i);
  const headingText = heading ? flatten(heading[1]) : title ? flatten(title[1]) : "";
  return { title: headingText, note: description ? flatten(description[1]) : "" };
}

/**
 * The web app manifest. `display: "browser"` is the honest one for a site whose value is a page you
 * read and an exercise you play: an installed copy that hides the address bar buys the reader nothing and
 * costs them the back button on a phone. `theme_color` is the same `--bg` the `<meta>` tag carries.
 */
export function renderManifest({ config }) {
  return (
    JSON.stringify(
      {
        name: config.name,
        short_name: config.name,
        description: "Excel formula practice in a spreadsheet, graded as you type.",
        start_url: "/",
        scope: "/",
        display: "browser",
        background_color: config.themeColor.light,
        theme_color: config.themeColor.light,
        icons: [
          { src: "/assets/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/assets/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/assets/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      null,
      2,
    ) + "\n"
  );
}

/** Every generated file, relative to `dist/`, for the build's log line and byte total. */
export const SOCIAL_FILES = Object.freeze([
  ...CARD_KEYS.map((key) => `assets/social/${key}.png`),
  "assets/icons/icon-192.png",
  "assets/icons/icon-512.png",
  "assets/icons/icon-maskable-512.png",
  "assets/icons/apple-touch-icon.png",
  "manifest.webmanifest",
]);
