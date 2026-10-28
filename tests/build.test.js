import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, describe, it } from "node:test";

import { assertSelfContained, build, removeDotFiles } from "../src/build.mjs";
import { createStaticServer, resolvePath, startServer } from "../src/serve.mjs";
import { buildStyles, readIcons } from "../src/site/assets.mjs";
import { siteConfig } from "../src/site/config.mjs";
import { loadContent } from "../src/site/content.mjs";
import { renderIndexPage } from "../src/site/index-page.mjs";
import { esc } from "../src/site/html.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const ENV = { SITE_URL: "https://drills.example", SITE_BUILT_AT: "2026-10-28" };
const BASE = ENV.SITE_URL;

const track = readJson(join(ROOT, "content/track.json"));
const lessonFiles = readdirSync(join(ROOT, "content/exercises")).filter((name) => name.endsWith(".json")).sort();
const lessons = lessonFiles.map((name) => readJson(join(ROOT, "content/exercises", name)));

const htmlFiles = (dir) => {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...htmlFiles(full));
    else if (entry.name.endsWith(".html")) out.push(full);
  }
  return out.sort();
};

describe("build", () => {
  let out;
  let summary;

  before(() => {
    out = mkdtempSync(join(tmpdir(), "es-build-"));
    summary = build({ out, env: ENV, quiet: true });
  });

  after(() => {
    rmSync(out, { recursive: true, force: true });
  });

  it("writes one page per lesson plus the index", () => {
    const pages = htmlFiles(out).map((file) => file.slice(out.length + 1));
    assert.equal(pages.length, 11, `expected 11 pages, got ${pages.length}`);
    assert.ok(pages.includes("index.html"));
    for (const exercise of lessons) assert.ok(pages.includes(`excel/${exercise.slug}.html`), `${exercise.slug} page is missing`);
    assert.equal(summary.pages, 11);
  });

  it("copies the assets the pages ask for", () => {
    for (const file of [
      "assets/styles.css",
      "assets/favicon.svg",
      "assets/fonts/plex-sans-latin.woff2",
      "assets/fonts/newsreader-latin.woff2",
      "assets/grader/index.js",
      "assets/grader/grade.js",
      "sitemap.xml",
      "robots.txt",
    ]) {
      assert.doesNotThrow(() => readFileSync(join(out, file)), `${file} was not written`);
    }
    assert.equal(summary.grader, 9, "every grader module must be copied as an ES module");
    assert.equal(summary.fonts, 4);
  });

  it("ships no dotfiles", () => {
    const walk = (dir) =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = join(dir, entry.name);
        return entry.isDirectory() ? walk(full) : [full.slice(out.length + 1)];
      });
    assert.deepEqual(walk(out).filter((path) => path.split("/").some((part) => part.startsWith("."))), []);
  });

  it("removes dotfiles that appear while the build runs", () => {
    // macOS re-creates .DS_Store inside a directory as it is written, after the
    // initial wipe, so the sweep has to be exercised on its own.
    const dir = mkdtempSync(join(tmpdir(), "es-dots-"));
    try {
      mkdirSync(join(dir, "excel"));
      writeFileSync(join(dir, ".DS_Store"), "junk");
      writeFileSync(join(dir, "excel", ".DS_Store"), "junk");
      writeFileSync(join(dir, "excel", "kept.html"), "fine");
      assert.equal(removeDotFiles(dir), 2);
      assert.deepEqual(readdirSync(dir), ["excel"]);
      assert.deepEqual(readdirSync(join(dir, "excel")), ["kept.html"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("is idempotent", () => {
    const snapshot = () =>
      new Map(htmlFiles(out).map((file) => [file, readFileSync(file, "utf8")]));
    const before = snapshot();
    build({ out, env: ENV, quiet: true });
    const after = snapshot();
    assert.deepEqual([...after.keys()], [...before.keys()]);
    for (const [file, contents] of after) assert.equal(contents, before.get(file), `${file} changed on a second build`);
  });

  it("links the index only to pages that exist", () => {
    const html = readFileSync(join(out, "index.html"), "utf8");
    const hrefs = [...html.matchAll(/href="([^"#]+)"/g)].map((match) => match[1]);
    const internal = hrefs.filter((href) => href.startsWith("/"));
    assert.ok(internal.length >= lessons.length, "the index must link every lesson");
    for (const href of new Set(internal)) {
      assert.ok(resolvePath(out, href), `index links to ${href}, which does not resolve to a file`);
    }
    const lessonLinks = internal.filter((href) => href.startsWith("/excel/"));
    assert.equal(new Set(lessonLinks).size, lessons.length, "every lesson needs exactly one link");
  });

  it("gives every lesson page its own content, not a template with swapped nouns", () => {
    lessons.forEach((exercise, position) => {
      const html = readFileSync(join(out, "excel", `${exercise.slug}.html`), "utf8");
      const swap = lessons[position + 1] ?? lessons[0];
      assert.ok(html.includes(esc(exercise.prompt)), `${exercise.slug}: prompt is missing`);
      assert.ok(html.includes(esc(exercise.docs.reference)), `${exercise.slug}: reference formula is missing`);
      assert.ok(html.includes(esc(exercise.docs.dataset)), `${exercise.slug}: dataset name is missing`);
      assert.ok(html.includes(esc(exercise.docs.atWork)), `${exercise.slug}: "at work" paragraph is missing`);
      const swapHtml = readFileSync(join(out, "excel", `${swap.slug}.html`), "utf8");
      assert.notEqual(html, swapHtml, `${exercise.slug}: page is identical to ${swap.slug}`);
      assert.ok(!html.includes(esc(swap.prompt)), `${exercise.slug}: contains the prompt of ${swap.slug}`);
    });
  });

  it("server-renders the docs instead of deferring them to the client", () => {
    for (const heading of ["What it does", "Syntax", "Worked example", "Common errors", "At work"]) {
      const html = readFileSync(join(out, "excel/sum-basics.html"), "utf8");
      assert.match(html, new RegExp(`<h2[^>]*>${heading}</h2>`), `docs heading "${heading}" is not in the HTML`);
    }
    const html = readFileSync(join(out, "excel/sum-basics.html"), "utf8");
    assert.ok((html.match(/<td/g) ?? []).length > 0, "the error table has no rows");
  });

  it("emits the mount contract the client will use", () => {
    const html = readFileSync(join(out, "excel", "sum-basics.html"), "utf8");
    for (const id of ["drill", "sheet", "sheet-grid", "formula-bar", "ref-chip", "formula", "check", "feedback", "hint", "solution", "progress-count", "exercise-data"]) {
      assert.match(html, new RegExp(`id="${id}"`), `#${id} is missing`);
    }
    assert.match(html, /<section class="sheet-card" id="drill"/);
    assert.match(html, /data-cell="B5" data-kind="target" tabindex="0" aria-selected="true"/);
    // Four columns on screen: the row-header column plus A, B and C.
    assert.match(html, /aria-colcount="4"/);
    assert.match(html, /aria-rowcount="6"/);
    // The address chip is a value display; the input carries its own name.
    assert.match(html, /<span class="ref-chip" id="ref-chip">B5<\/span>/);
    assert.match(html, /id="formula"[^>]*aria-label="Your formula for B5"/);
    assert.ok(!/name="formula"/.test(html), "a named control would leak the draft into the URL on a no-JS submit");
    // Phase 5 additions: the answer reveal and the client-filled progress bar.
    assert.match(html, /id="show-answer"[^>]*hidden/, "the answer reveal must ship hidden");
    assert.match(html, /<div class="rail-track" aria-hidden="true"><span class="rail-fill" id="progress-fill"><\/span><\/div>/);
  });

  it("mounts the client from a path its own imports resolve", () => {
    for (const file of ["assets/client/drill.js", "assets/client/state.js", "assets/grader/index.js"]) {
      assert.doesNotThrow(() => readFileSync(join(out, file)), `${file} was not written`);
    }
    assert.equal(summary.client, 2, "drill.js and its state module");

    for (const page of ["excel/sum-basics.html", "index.html"]) {
      const html = readFileSync(join(out, page), "utf8");
      assert.match(html, /<script type="module" src="\/assets\/client\/drill\.js"><\/script>/, `${page} does not load the client`);
    }

    // drill.js reaches the grader with `../grader/index.js`; that only works from assets/client.
    const source = readFileSync(join(out, "assets/client/drill.js"), "utf8");
    const specifiers = [...source.matchAll(/from "(\.[^"]+)"/g)].map((match) => match[1]);
    assert.ok(specifiers.length >= 2, "the client should import the grader and its own state module");
    for (const specifier of specifiers) {
      assert.doesNotThrow(
        () => readFileSync(join(out, "assets/client", specifier), "utf8"),
        `${specifier} does not resolve from assets/client`,
      );
    }
  });

  it("gives the track page progress markup that stays invisible without JavaScript", () => {
    const html = readFileSync(join(out, "index.html"), "utf8");
    assert.match(html, /<div class="track-progress" id="track-progress" hidden>/);
    assert.match(html, /id="track-fill"/);
    assert.match(html, /id="track-progress-note"/);
    assert.equal((html.match(/data-lesson="/g) ?? []).length, lessons.length, "every row needs a lesson id for the client");
  });

  it("parses the exercise payload for every lesson", () => {
    lessons.forEach((exercise) => {
      const html = readFileSync(join(out, "excel", `${exercise.slug}.html`), "utf8");
      const match = /<script type="application\/json" id="exercise-data">([\s\S]*?)<\/script>/.exec(html);
      assert.ok(match, `${exercise.slug}: no exercise-data script`);
      const payload = JSON.parse(match[1]);
      assert.equal(payload.id, exercise.id);
      assert.equal(payload.answerCell, exercise.answerCell);
      assert.deepEqual(payload.grid.rows, exercise.grid.rows);
      assert.deepEqual(payload.expect, exercise.expect);
      assert.deepEqual(payload.require, exercise.require);
      assert.equal(payload.docs.reference, exercise.docs.reference);
      assert.equal(payload.track.total, lessons.length);
      assert.equal(payload.track.nextPath, exercise.slug === lessons.at(-1).slug ? null : `/excel/${lessons[lessons.indexOf(exercise) + 1].slug}`);
    });
  });

  it("emits valid structured data", () => {
    const index = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(readFileSync(join(out, "index.html"), "utf8"))[1]);
    assert.equal(index["@type"], "Course");
    assert.equal(index.name, track.title);
    assert.equal(index.hasPart.length, lessons.length);

    const lesson = JSON.parse(
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(readFileSync(join(out, "excel", "sum-basics.html"), "utf8"))[1],
    );
    assert.equal(lesson["@type"], "LearningResource");
    assert.equal(lesson["@context"], "https://schema.org");
    assert.equal(lesson.name, lessons[0].title);
    assert.equal(lesson.teaches, lessons[0].docs.teaches);
    assert.equal(lesson.educationalLevel, "Beginner");
    assert.equal(lesson.inLanguage, "en");
    assert.equal(lesson.isAccessibleForFree, true);
    assert.equal(lesson.isPartOf["@type"], "Course");
    assert.ok(!/rating|review/i.test(JSON.stringify(lesson)), "structured data must not invent ratings");

    const gated = JSON.parse(
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(readFileSync(join(out, "excel", `${lessons.at(-1).slug}.html`), "utf8"))[1],
    );
    assert.equal(gated.isAccessibleForFree, false, "the last lesson is behind the trial");
  });

  it("fetches nothing from a third party", () => {
    const allowed = [BASE, "https://schema.org"];
    for (const file of htmlFiles(out)) {
      const html = readFileSync(file, "utf8");
      for (const match of html.matchAll(/(?:https?:)?\/\/[^\s"'<>)]+/g)) {
        assert.ok(
          allowed.some((origin) => match[0].startsWith(origin)),
          `${file.slice(out.length + 1)} refers to ${match[0]}`,
        );
      }
    }
    const lesson = readFileSync(join(out, "excel", "sum-basics.html"), "utf8");
    assert.match(lesson, /<link rel="preload" href="\/assets\/fonts\/plex-sans-latin\.woff2" as="font" type="font\/woff2" crossorigin/);
    assert.match(lesson, /<html lang="en">/);
    assert.match(lesson, /<body class="light lesson">/);
    assert.match(lesson, new RegExp(`<link rel="canonical" href="${BASE}/excel/sum-basics">`));
  });

  it("ships one concatenated stylesheet in the only order that resolves", () => {
    const css = readFileSync(join(out, "assets/styles.css"), "utf8");
    assert.ok(!/@import/.test(css), "styles.css must not import any other stylesheet");
    const sand = css.indexOf("--sand-1");
    const sizes = css.indexOf("--size-1");
    assert.ok(sand > -1 && sizes > -1);
    assert.ok(sand < sizes, "Radix scales must come before the size scale");
    assert.match(css, /src\/build\.mjs/, "the header should say the file is generated");
    assert.deepEqual(
      readdirSync(join(out, "assets")).filter((name) => name.endsWith(".css")),
      ["styles.css"],
      "there must be exactly one stylesheet",
    );
  });

  it("writes a sitemap of exactly the published URLs", () => {
    const xml = readFileSync(join(out, "sitemap.xml"), "utf8");
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
    assert.equal(locs.length, 11);
    for (const loc of locs) assert.ok(loc.startsWith(`${BASE}/`), `${loc} is not absolute against the configured base`);
    assert.ok(locs.includes(`${BASE}/`));
    for (const exercise of lessons) assert.ok(locs.includes(`${BASE}/excel/${exercise.slug}`));
    assert.equal((xml.match(/<lastmod>2026-10-28<\/lastmod>/g) ?? []).length, 11);
    assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  });

  it("writes robots.txt that crawls everything and names the sitemap", () => {
    const robots = readFileSync(join(out, "robots.txt"), "utf8");
    assert.match(robots, /User-agent: \*\nAllow: \//);
    assert.match(robots, new RegExp(`Sitemap: ${BASE}/sitemap\\.xml`));
  });

  it("keeps the author off the byline when no author is configured", () => {
    const html = readFileSync(join(out, "excel", "sum-basics.html"), "utf8");
    assert.ok(!/\bBy \w/.test(html), "no author is configured, so no name may be claimed");
    assert.match(html, /Updated 28 Oct 2026/);
    assert.ok(!/~\d+ min/.test(html), "the index must not claim a duration");
  });

  it("uses SITE_AUTHOR and SITE_URL when they are set", () => {
    const other = mkdtempSync(join(tmpdir(), "es-build-author-"));
    try {
      build({ out: other, env: { ...ENV, SITE_AUTHOR: "Dana Silva", SITE_URL: "https://excel.example.org" }, quiet: true });
      const html = readFileSync(join(other, "excel", "sum-basics.html"), "utf8");
      assert.match(html, /By Dana Silva/);
      assert.match(html, /<link rel="canonical" href="https:\/\/excel\.example\.org\/excel\/sum-basics">/);
      const xml = readFileSync(join(other, "sitemap.xml"), "utf8");
      assert.ok(xml.includes("https://excel.example.org/"), "the sitemap must follow the configured base");
    } finally {
      rmSync(other, { recursive: true, force: true });
    }
  });
});

describe("the self-contained page gate", () => {
  const config = siteConfig(ENV);

  it("allows our own origin, schema.org, and protocol-relative forms of our own origin", () => {
    assert.doesNotThrow(() =>
      assertSelfContained(
        `<link rel="canonical" href="${BASE}/excel/x">` +
          '<script type="application/ld+json">"@type": "https://schema.org/Course"</script>' +
          '<img src="//drills.example/assets/icons/x.svg">',
        config,
        "page.html",
      ),
    );
  });

  it("refuses an origin that only looks like ours", () => {
    assert.throws(
      () => assertSelfContained(`<img src="${BASE}.evil.net/x.png">`, config, "page.html"),
      /page\.html: refers to https:\/\/drills\.example\.evil\.net\/x\.png/,
    );
  });

  it("refuses a protocol-relative fetch, which needs no scheme to be external", () => {
    assert.throws(
      () => assertSelfContained('<script src="//cdn.example.net/x.js"></script>', config, "page.html"),
      /page\.html: refers to \/\/cdn\.example\.net\/x\.js/,
    );
  });
});

describe("build validation", () => {
  const exercise = readJson(join(ROOT, "content/exercises/01-sum-basics.json"));

  function withContent(mutate) {
    const dir = mkdtempSync(join(tmpdir(), "es-content-"));
    mkdirSync(join(dir, "exercises"), { recursive: true });
    const copy = structuredClone(exercise);
    const { track: customTrack, exercises } = mutate(copy) ?? {};
    writeFileSync(join(dir, "track.json"), JSON.stringify(customTrack ?? { ...track, lessons: [copy.id], freeLessonCount: 1 }));
    const list = exercises ?? [copy];
    for (const item of list) writeFileSync(join(dir, "exercises", `${item.id}.json`), JSON.stringify(item));
    return dir;
  }

  function fails(mutate, pattern) {
    const dir = withContent(mutate);
    try {
      assert.throws(() => loadContent(dir), pattern);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  it("fails loudly when docs are missing", () => {
    fails((copy) => {
      delete copy.docs;
    }, /content\/exercises\/01-sum-basics\.json: docs is required/);
  });

  it("fails loudly on a ragged grid", () => {
    fails((copy) => {
      copy.grid.rows[2].push("stray");
    }, /grid\.rows\[2\] has 4 cells, expected 3/);
  });

  it("fails loudly when two lessons share a slug", () => {
    const dir = withContent((copy) => {
      const twin = structuredClone(copy);
      twin.id = "01b-sum-again";
      return { exercises: [copy, twin] };
    });
    try {
      assert.throws(() => loadContent(dir), /duplicate slug "sum-basics"/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("fails loudly when the track points at a lesson that does not exist", () => {
    fails(() => ({ track: { ...track, lessons: [exercise.id, "11-missing"], freeLessonCount: 1 } }), /"11-missing".*does not exist/);
  });

  it("fails loudly when a lesson is not in the track", () => {
    const other = readJson(join(ROOT, "content/exercises/02-average-scores.json"));
    fails((copy) => ({ exercises: [copy, structuredClone(other)] }), /content\/exercises\/02-average-scores\.json: is not listed in track.json/);
  });

  it("fails loudly when the answer cell is outside the grid", () => {
    fails((copy) => {
      copy.answerCell = "Z9";
    }, /answerCell "Z9" is outside the 5x3 grid starting at A1/);
  });

  it("fails loudly when the answer cell is not a canonical address", () => {
    fails((copy) => {
      copy.answerCell = "b5";
    }, /answerCell "b5" must be written "B5"/);
  });

  it("fails loudly on a rule type the grader does not apply", () => {
    fails((copy) => {
      copy.rules = [{ type: "matchtype", id: "r1", func: "SUM", arg: 1, values: [1] }];
    }, /rules\[0\]\.type "matchtype" is not a rule the grader applies/);
  });

  it("fails loudly when a rule names a function the grader does not know", () => {
    fails((copy) => {
      copy.require = [{ id: "func-sum", func: "SUMM", minArgs: 1 }];
    }, /require\[0\]\.func "SUMM" is not a function the grader knows/);
  });

  it("fails loudly when nothing is free", () => {
    fails((copy) => ({ track: { ...track, lessons: [copy.id], freeLessonCount: 0 } }), /freeLessonCount must be at least 1/);
  });

  it("fails loudly on an impossible build date", () => {
    assert.throws(() => siteConfig({ SITE_BUILT_AT: "2026-13-01" }), /SITE_BUILT_AT must be a real date/);
    assert.throws(() => siteConfig({ SITE_BUILT_AT: "2026-02-30" }), /SITE_BUILT_AT must be a real date/);
    assert.equal(siteConfig({ SITE_BUILT_AT: "2026-02-28" }).builtAt, "2026-02-28");
  });

  it("refuses a stylesheet that would load a remote resource", () => {
    const dir = mkdtempSync(join(tmpdir(), "es-css-"));
    try {
      for (const name of ["radix", "open-props"]) mkdirSync(join(dir, "vendor", name), { recursive: true });
      mkdirSync(join(dir, "styles"));
      writeFileSync(join(dir, "vendor/radix/a.css"), ":root{--x:1}");
      writeFileSync(join(dir, "styles/base.css"), '@font-face{src:url("https://fonts.example/x.woff2")}');
      assert.throws(
        () => buildStyles({ vendorDir: join(dir, "vendor"), stylesDir: join(dir, "styles") }),
        /loads a remote resource/,
      );
      writeFileSync(join(dir, "styles/base.css"), "@import url(x.css);");
      assert.throws(() => buildStyles({ vendorDir: join(dir, "vendor"), stylesDir: join(dir, "styles") }), /contains @import/);
      writeFileSync(join(dir, "styles/base.css"), '@font-face{src:url(//fonts.example/x.woff2)}');
      assert.throws(
        () => buildStyles({ vendorDir: join(dir, "vendor"), stylesDir: join(dir, "styles") }),
        /loads a remote resource/,
      );
      writeFileSync(join(dir, "styles/base.css"), '@font-face{src:url("/assets/fonts/x.woff2")}');
      assert.doesNotThrow(() => buildStyles({ vendorDir: join(dir, "vendor"), stylesDir: join(dir, "styles") }));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("does not promise a trial when the whole track is open", () => {
    const { track: realTrack, index } = loadContent(join(ROOT, "content"));
    const html = renderIndexPage({
      config: siteConfig(ENV),
      track: { ...realTrack, freeLessonCount: index.length },
      index,
      icons: readIcons(join(ROOT, "vendor/icons")),
    });
    assert.match(html, new RegExp(`All ${index.length} drills are open`));
    assert.ok(!html.includes("free trial"), "no lesson is gated, so the page must not mention a trial");
  });

  it("refuses a relative SITE_URL instead of shipping a broken canonical", () => {
    const dir = mkdtempSync(join(tmpdir(), "es-build-bad-url-"));
    try {
      assert.throws(() => build({ out: dir, env: { SITE_URL: "example.com" }, quiet: true }), /SITE_URL must be an absolute origin/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("runs the CLI through a symlinked path instead of silently doing nothing", () => {
    // node resolves symlinks in import.meta.url but not in argv[1]; macOS /tmp and
    // /var are symlinks, so the old guard made `node /tmp/x/src/build.mjs` a no-op.
    const real = mkdtempSync(join(tmpdir(), "es-cli-"));
    const link = `${real}-link`;
    try {
      for (const dir of ["content", "vendor", "src"]) cpSync(join(ROOT, dir), join(real, dir), { recursive: true });
      try {
        symlinkSync(real, link, "dir");
      } catch {
        return; // no symlink support on this filesystem
      }
      const result = spawnSync(process.execPath, ["src/build.mjs"], {
        cwd: link,
        env: { ...process.env, SITE_URL: "not a url" },
        encoding: "utf8",
      });
      assert.equal(result.status, 1, "the CLI must run, not exit 0 with no output");
      assert.match(result.stderr, /build failed: SITE_URL/);
    } finally {
      rmSync(link, { recursive: true, force: true });
      rmSync(real, { recursive: true, force: true });
    }
  });

  it("exits non-zero with a message when the CLI cannot build", () => {
    const result = spawnSync(process.execPath, ["src/build.mjs"], {
      cwd: ROOT,
      env: { ...process.env, SITE_URL: "not a url" },
      encoding: "utf8",
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /build failed: SITE_URL must be an absolute origin/);
  });
});

describe("serve", () => {
  let out;
  let server;

  before(async () => {
    out = mkdtempSync(join(tmpdir(), "es-serve-"));
    build({ out, env: ENV, quiet: true });
    server = createStaticServer({ distDir: out });
    await new Promise((resolve) => server.listen(0, resolve));
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    rmSync(out, { recursive: true, force: true });
  });

  it("takes PORT from the environment, including 0", async () => {
    const saved = process.env.PORT;
    process.env.PORT = "0";
    let ephemeral;
    try {
      ephemeral = startServer({ distDir: out });
      await new Promise((resolve) => ephemeral.once("listening", resolve));
      assert.ok(ephemeral.address().port > 0, "port 0 must bind an ephemeral port, not fall back to 4173");
    } finally {
      if (ephemeral) await new Promise((resolve) => ephemeral.close(resolve));
      if (saved === undefined) delete process.env.PORT;
      else process.env.PORT = saved;
    }
  });

  it("resolves clean URLs the way the pages link them", () => {
    assert.equal(resolvePath(out, "/"), join(out, "index.html"));
    assert.equal(resolvePath(out, "/excel/sum-basics"), join(out, "excel/sum-basics.html"));
    assert.equal(resolvePath(out, "/assets/styles.css"), join(out, "assets/styles.css"));
    assert.equal(resolvePath(out, "/nope"), null);
    assert.equal(resolvePath(out, "/excel/nope"), null);
  });

  it("refuses to walk out of dist", () => {
    assert.equal(resolvePath(out, "/../package.json"), null);
    assert.equal(resolvePath(out, "/%2e%2e/package.json"), null);
    assert.equal(resolvePath(out, "/excel/../../package.json"), null);
    assert.equal(resolvePath(out, "/%00"), null);
  });

  it("serves the generated pages over HTTP", async () => {
    const base = `http://127.0.0.1:${server.address().port}`;
    const lesson = await fetch(`${base}/excel/sum-basics`);
    assert.equal(lesson.status, 200);
    assert.match(lesson.headers.get("content-type"), /text\/html/);
    assert.equal(lesson.headers.get("cache-control"), "no-store");
    const html = await lesson.text();
    assert.ok(html.includes(esc(lessons[0].prompt)), "the served page is missing the prompt");

    const css = await fetch(`${base}/assets/styles.css`);
    assert.equal(css.status, 200);
    assert.match(css.headers.get("content-type"), /text\/css/);

    const font = await fetch(`${base}/assets/fonts/newsreader-latin.woff2`);
    assert.equal(font.headers.get("content-type"), "font/woff2");

    assert.equal((await fetch(`${base}/excel/does-not-exist`)).status, 404);
    assert.equal((await fetch(`${base}/`, { method: "POST" })).status, 405);
  });
});
