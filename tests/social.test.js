import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, describe, it } from "node:test";

import { build } from "../legacy/src/build.mjs";
import { siteConfig } from "../legacy/src/site/config.mjs";
import {
  CARD_KEYS,
  CARD_PATH,
  cardKey,
  cardUrl,
  extractCopy,
  renderManifest,
  SOCIAL_FILES,
  SOCIAL_SIZE,
} from "../legacy/src/site/social.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ENV = { SITE_URL: "https://drills.example", SITE_BUILT_AT: "2026-10-28" };
const config = siteConfig(ENV);

/** Width and height out of a PNG's IHDR, which is the only part of the file this suite has to read. */
function pngSize(path) {
  const bytes = readFileSync(path);
  assert.equal(bytes.subarray(1, 4).toString("ascii"), "PNG", `${path} is not a PNG`);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function htmlFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...htmlFiles(full));
    else if (entry.name.endsWith(".html")) out.push(full);
  }
  return out.sort();
}

const meta = (html, attribute, name) => {
  const match = html.match(new RegExp(`<meta ${attribute}="${name}" content="([^"]*)"`));
  return match ? match[1] : null;
};

describe("which card a page gets", () => {
  it("sends the four page kinds to their own card and everything else home", () => {
    assert.equal(cardKey("/"), "home");
    assert.equal(cardKey("/learn"), "learn");
    assert.equal(cardKey("/learn/groups/arithmetic"), "learn");
    assert.equal(cardKey("/pricing"), "pricing");
    assert.equal(cardKey("/excel/sum-basics"), "lesson");
    // A page with no card of its own still shares something: a generic card beats a broken image, and
    // `/about` is shared less often than the index but not never.
    assert.equal(cardKey("/about"), "home");
    assert.equal(cardKey("/privacy"), "home");
  });

  it("makes the URL absolute, because no crawler resolves og:image relatively", () => {
    assert.equal(CARD_PATH("home"), "/assets/social/home.png");
    assert.equal(cardUrl(config, "/"), `${config.baseUrl}/assets/social/home.png`);
    assert.equal(cardUrl(config, "/excel/sum-basics"), `${config.baseUrl}/assets/social/lesson.png`);
  });
});

describe("the copy a card is made of", () => {
  it("reads the heading and the description out of a page", () => {
    const copy = extractCopy(
      '<html><head><title>Ignored · Site</title><meta name="description" content="88 tasks, graded."></head>' +
        "<body><h1>The free half</h1></body></html>",
    );
    assert.deepEqual(copy, { title: "The free half", note: "88 tasks, graded." });
  });

  it("decodes entities and flattens markup, because the heading is usually marked up", () => {
    const copy = extractCopy(
      '<meta name="description" content="A &amp; B">' + "<h1>Type <em>the</em> formula&nbsp;&mdash; get told</h1>",
    );
    assert.equal(copy.title, "Type the formula \u2014 get told");
    assert.equal(copy.note, "A & B");
  });

  it("falls back to the document title when a page has no h1", () => {
    assert.equal(extractCopy("<title>Only a title</title>").title, "Only a title");
  });
});

describe("the manifest", () => {
  it("is JSON a phone can install, with colour and scope that match the site", () => {
    const manifest = JSON.parse(renderManifest({ config }));
    assert.equal(manifest.start_url, "/");
    assert.equal(manifest.scope, "/");
    // Not `standalone`: the value of the site is a page you read and an exercise you play, and an installed
    // copy that hides the address bar costs a phone the back button.
    assert.equal(manifest.display, "browser");
    assert.equal(manifest.theme_color, config.themeColor.light);
    assert.equal(manifest.background_color, config.themeColor.light);
    assert.equal(manifest.name, config.name);
    assert.ok(manifest.icons.some((icon) => icon.purpose === "maskable"), "no maskable icon");
  });
});

describe("the app's metadata", () => {
  // `next:check` proves the prerendered routes; this proves the routes it cannot reach — `/account`,
  // `/certificate`, anything dynamic. A page that overrides `openGraph` without asking for an image
  // drops the layout's card, because Next replaces the object instead of merging into it.
  const pages = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name === "page.js") pages.push(full);
    }
  };
  walk(join(ROOT, "app"));

  it("asks for a card wherever a page replaces the openGraph block", () => {
    assert.ok(pages.length > 20, "no pages found — is the walk looking in the right place?");
    for (const file of pages) {
      const source = readFileSync(file, "utf8");
      if (!source.includes("openGraph:")) continue;
      assert.ok(source.includes("images: [socialImage("), `${file} sets openGraph but no preview image`);
      assert.ok(source.includes("twitter: socialTwitter("), `${file} sets openGraph but no twitter image`);
    }
  });
});

describe("a built site", () => {
  let out;

  before(() => {
    out = mkdtempSync(join(tmpdir(), "es-social-"));
    build({ out, env: ENV, quiet: true });
  });

  after(() => {
    rmSync(out, { recursive: true, force: true });
  });

  it("writes every generated file it advertises", () => {
    for (const file of SOCIAL_FILES) {
      assert.ok(existsSync(join(out, file)), `${file} was not written`);
    }
    assert.equal(SOCIAL_FILES.length, CARD_KEYS.length + 4 + 1);
  });

  it("writes share cards at the size every crawler crops from", () => {
    for (const key of CARD_KEYS) {
      assert.deepEqual(pngSize(join(out, CARD_PATH(key))), SOCIAL_SIZE, `${key} card is the wrong size`);
    }
  });

  it("writes the icons at the sizes they claim", () => {
    for (const [file, size] of [
      ["assets/icons/icon-192.png", 192],
      ["assets/icons/icon-512.png", 512],
      ["assets/icons/icon-maskable-512.png", 512],
      ["assets/icons/apple-touch-icon.png", 180],
    ]) {
      assert.deepEqual(pngSize(join(out, file)), { width: size, height: size }, `${file} is the wrong size`);
    }
  });

  it("serves a manifest whose icons all exist at the size the manifest declares", () => {
    const manifest = JSON.parse(readFileSync(join(out, "manifest.webmanifest"), "utf8"));
    for (const icon of manifest.icons) {
      const path = join(out, icon.src);
      assert.ok(existsSync(path), `${icon.src} is in the manifest but not on disk`);
      const [width, height] = icon.sizes.split("x").map(Number);
      assert.deepEqual(pngSize(path), { width, height }, `${icon.src} does not match its declared sizes`);
    }
  });

  it("points every page's preview at a card that exists, and asks for the large card", () => {
    for (const file of htmlFiles(out)) {
      const html = readFileSync(file, "utf8");
      const relative = file.slice(out.length + 1);
      const image = meta(html, "property", "og:image");
      assert.ok(image, `${relative} has no og:image`);
      assert.equal(new URL(image).origin, ENV.SITE_URL, `${relative} names a foreign origin`);
      const card = join(out, new URL(image).pathname);
      assert.ok(existsSync(card), `${relative} previews ${image}, which is not in dist`);
      assert.deepEqual(pngSize(card), SOCIAL_SIZE, `${relative} previews a card of the wrong size`);
      assert.equal(meta(html, "name", "twitter:card"), "summary_large_image", `${relative} asks for the small card`);
      assert.equal(meta(html, "name", "twitter:image"), image, `${relative} disagrees about its own image`);
      assert.ok(meta(html, "property", "og:image:alt"), `${relative} has no alt text for its preview`);
      assert.equal(meta(html, "property", "og:image:width"), String(SOCIAL_SIZE.width));
      assert.equal(meta(html, "property", "og:image:height"), String(SOCIAL_SIZE.height));
    }
  });

  it("links the manifest and the touch icon from every page", () => {
    for (const file of htmlFiles(out)) {
      const html = readFileSync(file, "utf8");
      assert.match(html, /<link rel="manifest" href="\/manifest\.webmanifest">/, `${file} has no manifest link`);
      assert.match(html, /<link rel="apple-touch-icon" href="\/assets\/icons\/apple-touch-icon\.png">/, `${file} has no touch icon`);
    }
  });

  it("draws each card from the heading of the page it belongs to", () => {
    // The card's text cannot be read back out of a PNG here, so this pins the other end of the wire:
    // the pages the build takes copy from do have a heading and a description to take.
    for (const file of ["index.html", "learn/index.html", "pricing/index.html"]) {
      const copy = extractCopy(readFileSync(join(out, file), "utf8"));
      assert.ok(copy.title.length > 0, `${file} has no heading, so its card would be blank`);
      assert.ok(copy.note.length > 0, `${file} has no description, so its card would be silent`);
    }
  });
});
