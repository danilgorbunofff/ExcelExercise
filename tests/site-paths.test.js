/**
 * `lib/site.js` is the seam where the legacy content model becomes the Next app's: the same lessons,
 * but served — and declared canonical — at `/learn/excel/<slug>` instead of the legacy `/excel/<slug>`.
 * One leaked legacy path turns a `<link rel=canonical>` or a rail link into a redirect, and the browser
 * suite would only catch it on the pages it happens to visit, so the model is pinned here.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { loadSite } from "../lib/site.js";

import { LESSONS } from "./lessons.js";

const { index } = loadSite();

// The route prefix the app serves lessons under — repeated here rather than imported, because a test
// that reads the constant it is checking proves nothing.
const LESSON_BASE = "/learn/excel";

describe("the paths the Next app renders", () => {
  it("points every lesson at its own /learn/excel route", () => {
    assert.equal(index.length, LESSONS.length, "every lesson file gets exactly one route, and no route is unused");
    for (const entry of index) assert.equal(entry.path, `/learn/excel/${entry.slug}`);
  });

  it("keeps the pager inside the app, with the ends falling back to the track", () => {
    assert.equal(index[0].prevPath, "/");
    assert.equal(index.at(-1).nextPath, null);
    // `prev`/`next` are the bare exercises from the content package (no paths of their own), so the
    // pager path is the only thing that can drift here.
    for (const entry of index) {
      if (entry.prev) assert.equal(entry.prevPath, `${LESSON_BASE}/${entry.prev.slug}`);
      if (entry.next) assert.equal(entry.nextPath, `${LESSON_BASE}/${entry.next.slug}`);
    }
  });
});
