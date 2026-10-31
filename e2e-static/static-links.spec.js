/**
 * Invariant 3, static side: the shipped `legacy/dist` contains no dead internal link. The Next
 * build has a crawl already (`e2e/routes.spec.js`); this one walks the static artefact the other
 * deploy publishes, so "no dead links" is a property of both builds rather than of whichever one
 * a reviewer happened to open.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

const DIST = fileURLToPath(new URL("../legacy/dist", import.meta.url));
const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i;

/**
 * Empty on purpose. The list used to hold the two account surfaces this build shipped but could not
 * serve (D15); it now links them at `SITE_APP_URL` when that deployment exists, and omits them when
 * it does not, so there is nothing left to excuse. Kept as the seam a future exception has to argue
 * for, by name, in one place.
 */
const KNOWN_DEAD = new Set();

function htmlFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return htmlFiles(path);
    return entry.name.endsWith(".html") ? [path] : [];
  });
}

const urlOf = (file) => {
  const path = "/" + relative(DIST, file).split(sep).join("/");
  return path.endsWith("/index.html") ? path.slice(0, -"index.html".length) : path;
};

const targetsOf = (html) => [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map((match) => match[1]);

test("no internal link in the static build is dead", async ({ request }) => {
  test.setTimeout(300_000);
  const files = htmlFiles(DIST);
  expect(files.length).toBeGreaterThan(100);

  const targets = new Set();
  for (const file of files) {
    const page = urlOf(file);
    const base = page.endsWith("/") ? page : page.slice(0, page.lastIndexOf("/") + 1);
    for (const raw of targetsOf(readFileSync(file, "utf8"))) {
      if (EXTERNAL.test(raw)) continue;
      const resolved = new URL(raw, "http://static.invalid" + base);
      if (resolved.origin !== "http://static.invalid") continue;
      targets.add(resolved.pathname + resolved.search);
    }
  }

  expect(targets.size).toBeGreaterThan(50);
  const dead = [];
  for (const target of targets) {
    const response = await request.get(target);
    if (response.status() >= 400 && !KNOWN_DEAD.has(target)) dead.push(`${response.status()} ${target}`);
  }
  expect(dead).toEqual([]);
});
