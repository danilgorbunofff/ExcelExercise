import { renderManifest } from "../../legacy/src/site/social.mjs";
import { loadSite } from "../../lib/site.js";

const { config } = loadSite();

/**
 * The same manifest the static build writes, from the same function: the icons it names are the ones
 * `scripts/next-assets.mjs` copies out of `legacy/dist/assets`, so the two editions cannot install with
 * different names, colours or icon sets.
 */
export function GET() {
  return new Response(renderManifest({ config }), {
    headers: { "content-type": "application/manifest+json; charset=utf-8" },
  });
}
