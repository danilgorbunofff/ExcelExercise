/**
 * The site's view of search: the engine ships to the browser (`packages/search`), and both builds take
 * the index from the same content loader, so a query answers the same in the static pages and in the
 * Next app.
 *
 * The re-export is deliberate rather than an import at each call site: `legacy/` is deployed as a
 * folder of its own, so everything the static build needs has to be reachable from inside it.
 */
export {
  buildSearchIndex,
  hydrate,
  loadIndex,
  queryTerms,
  search,
  serializeIndex,
  words,
} from "./packages.mjs";
