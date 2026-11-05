/**
 * The engine matrix. H1 asks for three behaviours on Safari — a playable exercise, Tab reaching the
 * answer field, and the certificate printing — and `launch-log.md` now tells whoever signs H1 that the
 * code half is already proved on WebKit, leaving them the Safari app and the OS print stack.
 *
 * That sentence is only true while the matrix still runs those specs. Dropping one from `testMatch`
 * would turn the claim into a comfortable lie that nothing else catches: the suite would stay green,
 * and the human would be told to check less than they think. So the mapping is pinned here, by
 * importing the real config rather than reading its source as text.
 *
 * The other invariant is why the set can be what it is: `page.pdf()` exists only in Chromium, so any
 * spec that calls it cannot run on WebKit at all. That spec keeps its home in `e2e-accounts`, where
 * the PDF half of H7 runs on the one engine that can produce a PDF.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const { default: config } = await import("../playwright.config.js");

const project = (name) => config.projects.find((candidate) => candidate.name === name);

/** `testMatch` is a list of globs; the specs behind them are what a reader cares about. */
const matched = (name) => project(name).testMatch ?? [];

describe("the engine matrix", () => {
  it("runs all three behaviours H1 names on WebKit", () => {
    const webkit = matched("webkit");
    for (const spec of ["drill.spec.js", "keyboard.spec.js", "certificate.spec.js"]) {
      assert.ok(
        webkit.some((glob) => glob.endsWith(spec)),
        `H1 names a behaviour proved by ${spec}, but the webkit project does not run it. ` +
          `Either add it back or correct what launch-log.md promises the person signing H1.`,
      );
    }
  });

  it("runs the input-handling behaviours on Firefox too, so a disagreement is not read as Safari's opinion", () => {
    const firefox = matched("firefox");
    for (const spec of ["drill.spec.js", "keyboard.spec.js"]) {
      assert.ok(
        firefox.some((glob) => glob.endsWith(spec)),
        `the two behaviours engines actually disagree about are typing and focus, and ${spec} covers one`,
      );
    }
    // The certificate spec is WebKit-only on purpose: no sign-off row names Firefox, so running it
    // there would buy nothing and cost a browser. H2 is Edge, which shares the Chromium project.
  });

  it("never sends a spec that needs page.pdf to an engine without it", () => {
    const specs = new Set(
      [...matched("webkit"), ...matched("firefox")]
        .map((glob) => glob.replace(/^\*\*\//, ""))
        .filter((path) => path.endsWith(".spec.js")),
    );
    assert.ok(specs.size > 0, "the matrix matched nothing, which would make this test vacuous");
    for (const spec of specs) {
      const source = readFileSync(join(ROOT, "e2e", spec), "utf8");
      assert.ok(
        !source.includes("page.pdf("),
        `${spec} calls page.pdf(), which only Chromium has, so it cannot run on webkit or firefox`,
      );
    }
  });
});
