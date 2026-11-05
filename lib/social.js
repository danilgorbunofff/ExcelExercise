/**
 * The preview image, in the one shape both metadata fields want.
 *
 * Next merges metadata shallowly: a page that sets `openGraph` replaces the layout's whole object, so a
 * page that forgets `images` silently drops the card the layout set up. That is why this is a function
 * every page calls with its own path, rather than a default in `app/layout.js` that half the site would
 * override — and why `scripts/check-next-pages.mjs` fails a page that overrides `openGraph` without
 * asking for an image.
 *
 * The paths are the static build's own (`legacy/src/site/social.mjs`): one generator draws the cards,
 * so an app page and the equivalent static page cannot preview differently.
 */
import { CARD_PATH, cardKey, SOCIAL_SIZE } from "../legacy/src/site/social.mjs";

export function socialImage({ path, title }) {
  return { url: CARD_PATH(cardKey(path)), width: SOCIAL_SIZE.width, height: SOCIAL_SIZE.height, alt: title };
}

export function socialTwitter({ path, title }) {
  return { card: "summary_large_image", images: [socialImage({ path, title })] };
}
