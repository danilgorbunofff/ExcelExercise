/**
 * The templates are split into fragments so the Next.js routes can render them inside their own
 * document. If `renderDocument` ever adds markup that is not in a fragment, the port silently loses it
 * — so every page is checked for the three pieces appearing, in order, in the shipped document.
 */
import assert from "node:assert/strict";
import { join } from "node:path";
import { describe, it } from "node:test";

import { siteConfig } from "../legacy/src/site/config.mjs";
import { loadContent } from "../legacy/src/site/content.mjs";
import { readIcons } from "../legacy/src/site/assets.mjs";
import { prepareExercisePage, renderExercisePage } from "../legacy/src/site/exercise-page.mjs";
import { prepareIndexPage, renderIndexPage } from "../legacy/src/site/index-page.mjs";
import { renderChrome, renderDocument } from "../legacy/src/site/shell.mjs";

const ROOT = join(import.meta.dirname, "..");
const config = siteConfig({ SITE_BUILT_AT: "2026-10-28" });
const { track, index } = loadContent(join(ROOT, "legacy/content"));
const icons = readIcons(join(ROOT, "legacy/vendor/icons"));

function assertFragmentsReassemble({ name, prepare, fetchArgs, renderPage }) {
  const { body, page } = prepare({ config, track, index, icons, clientAvailable: true, ...fetchArgs });
  const { skip, header, footer } = renderChrome({ config, page });
  const document = renderPage({ config, track, index, icons, clientAvailable: true, ...fetchArgs });

  // `renderPage` must be the document renderer, not a lookalike: anything the document adds outside
  // the fragments (a banner, a wrapper) would never reach the Next.js routes.
  assert.equal(document, renderDocument({ config, page, body }), `${name}: the page is no longer the document renderer`);

  const positions = [skip, header, body, footer].map((fragment) => {
    assert.ok(fragment.length > 0, `${name}: a fragment is empty`);
    const at = document.indexOf(fragment);
    assert.notEqual(at, -1, `${name}: a fragment is missing from the document`);
    return at;
  });
  assert.deepEqual([...positions].sort((a, b) => a - b), positions, `${name}: fragments are out of document order`);
  assert.ok(document.includes(`<script type="application/ld+json">${page.jsonLd}</script>`), `${name}: JSON-LD is not in the head`);
}

describe("page fragments", () => {
  it("reassemble the shipped lesson document", () => {
    for (const entry of index) {
      assertFragmentsReassemble({
        name: entry.slug,
        prepare: prepareExercisePage,
        renderPage: renderExercisePage,
        fetchArgs: { entry },
      });
    }
  });

  it("reassemble the shipped index document", () => {
    assertFragmentsReassemble({ name: "index", prepare: prepareIndexPage, renderPage: renderIndexPage, fetchArgs: {} });
  });
});
