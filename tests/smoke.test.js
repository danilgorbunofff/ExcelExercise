/**
 * The post-deploy smoke, tested against origins that are wrong on purpose.
 *
 * `scripts/smoke.mjs` is the one thing in this repository that runs after a release, against an origin
 * nobody controls from here — so its own failure modes matter more than its happy path. A smoke that
 * silently passes because it could not reach a page is worse than no smoke at all: the deploy notes
 * would record a green run over a broken build.
 *
 * Every check is driven here through the exported `runSmoke` against a local server that serves
 * exactly what the case needs, plus one run against the real `legacy/dist` through the same static
 * server the browser suite uses, so the script is proven against shipped files and not only fixtures.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, describe, it } from "node:test";

import {
  firstGradableScreen,
  firstLessonHref,
  parseArgs,
  runSmoke,
  sameOriginAssets,
  trimOrigin,
} from "../scripts/smoke.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const HUB = `<!doctype html><html><head>
  <link rel="stylesheet" href="/assets/app.css">
</head><body><main>
  <a href="/excel/what-a-formula-actually-does">Start here</a>
</main></body></html>`;

const DRILL = `<!doctype html><html><head>
  <link rel="stylesheet" href="/assets/app.css">
  <script src="/assets/client/drill.js"></script>
</head><body><main>
  <section id="drill">
    <script type="application/json" id="exercise-data">${JSON.stringify({
      id: "formula-1",
      slug: "what-a-formula-actually-does",
      screens: [
        {
          prompt: "Total Q1.",
          grid: { startCell: "A1", rows: [["Region", "Q1"], ["North", 1200], ["Total", null]] },
          answerCell: "B3",
          expect: { value: 1200 },
          hints: { func: "Add the cells: =SUM(B2:B2)." },
        },
      ],
    })}</script>
  </section>
</main></body></html>`;

const NOTES = `<!doctype html><html><head><link rel="stylesheet" href="/assets/app.css"></head><body><main>Notes</main></body></html>`;
const PRICING = `<!doctype html><html><head><link rel="stylesheet" href="/assets/app.css"></head><body><main>Pricing</main></body></html>`;

const SHEET = `<!doctype html><html><head><link rel="stylesheet" href="/assets/print.css"></head><body><main>
  <p class="certificate-print-url">Check this credential at https://drills.example/verify/ABCDEFGH23456789</p>
</main></body></html>`;

const GATE = `<!doctype html><html><body><main>
  <a href="/login?next=/certificate">Sign in</a>
</main></body></html>`;

const OFF = `<!doctype html><html><body><main>
  <div class="auth-notice">Accounts are not switched on for this deployment.</div>
</main></body></html>`;

const NOT_FOUND = `<!doctype html><html><body><main><h1>Nothing at this address</h1></main></body></html>`;

const PRINT_CSS = `@media print { @page { margin: 16mm; } .certificate-help { display: none; } }`;

/**
 * A whole origin in one object: routes, a health body, and which of them should be missing.
 *
 * `assets` is separate from `routes` because half the checks are about assets, and a route that
 * exists while its stylesheet 404s is the failure a deploy actually produces (a host that uploads
 * HTML but not the folder beside it).
 */
function fakeOrigin({ routes = {}, assets = {}, health = null, notFound = 404 } = {}) {
  // A `null` entry means "this one is missing", which is how a case subtracts from the healthy set
  // without rebuilding it: `healthy({ routes: { "/pricing": null } })`.
  const present = (table) => Object.fromEntries(Object.entries(table).filter(([, body]) => body !== null));
  routes = present(routes);
  assets = present(assets);
  const server = createServer((request, response) => {
    const path = new URL(request.url, "http://127.0.0.1").pathname;
    if (health !== null && path === "/api/health") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(health));
      return;
    }
    if (path in routes) {
      const body = routes[path];
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(body);
      return;
    }
    if (path in assets) {
      const body = assets[path];
      response.writeHead(200, { "content-type": "text/css; charset=utf-8" });
      response.end(body);
      return;
    }
    response.writeHead(notFound, { "content-type": "text/html; charset=utf-8" });
    response.end(NOT_FOUND);
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const origin = `http://127.0.0.1:${server.address().port}`;
      resolve({ origin, close: () => new Promise((done) => server.close(done)) });
    });
  });
}

/** The full happy path, which every case then breaks in exactly one place. */
function healthy(overrides = {}) {
  return {
    routes: {
      "/excel-exercises": HUB,
      "/learn/excel/what-a-formula-actually-does": DRILL,
      "/excel/what-a-formula-actually-does": DRILL,
      "/excel-functions": NOTES,
      "/pricing": PRICING,
      "/certificate": SHEET,
      ...overrides.routes,
    },
    assets: {
      "/assets/app.css": PRINT_CSS,
      "/assets/print.css": PRINT_CSS,
      "/assets/client/drill.js": "export const grade = () => {};",
      ...overrides.assets,
    },
    health: overrides.health === undefined ? { status: "ok", sha: "abc1234" } : overrides.health,
    notFound: overrides.notFound ?? 404,
  };
}

async function smoke(args) {
  const report = await runSmoke(args);
  const failures = report.failures.map((row) => `${row.name}: ${row.detail}`);
  return { report, failures, rows: report.rows };
}

describe("smoke — the arguments a runbook passes", () => {
  it("takes the origin positionally and the rest as flags, in both spellings", () => {
    const options = parseArgs(["https://app.example", "--sha", "abc1234", "--cookie=session=1", "--static=https://www2.example"]);
    assert.equal(options.origin, "https://app.example");
    assert.equal(options.sha, "abc1234");
    assert.equal(options.cookie, "session=1");
    assert.equal(options.staticOrigin, "https://www2.example");
    assert.equal(options.timeout, 15_000);
  });

  it("falls back to the local port and to RELEASE_SHA rather than to silence", () => {
    const previous = process.env.RELEASE_SHA;
    process.env.RELEASE_SHA = "deadbee";
    try {
      const options = parseArgs([]);
      assert.equal(options.origin, "http://127.0.0.1:3000");
      assert.equal(options.sha, "deadbee");
    } finally {
      if (previous === undefined) delete process.env.RELEASE_SHA;
      else process.env.RELEASE_SHA = previous;
    }
  });

  it("refuses an option it does not know instead of ignoring it", () => {
    assert.throws(() => parseArgs(["https://app.example", "--she"]), /unknown option --she/);
  });

  it("trims a trailing slash so the same host is not checked twice", () => {
    assert.equal(trimOrigin("https://app.example/"), "https://app.example");
    assert.equal(trimOrigin("https://app.example///"), "https://app.example");
  });
});

describe("smoke — what the page says about itself", () => {
  it("finds the assets the page loads and leaves other hosts alone", () => {
    const assets = sameOriginAssets(
      `<link rel="stylesheet" href="/a.css"><script src="/b.js"></script>
       <img src="https://cdn.example/c.png"><img src="/d.png"><link rel="stylesheet" href="https://cdn.example/e.css">`,
      "https://app.example",
    );
    assert.deepEqual(assets.sort(), ["/a.css", "/b.js", "/d.png"]);
  });

  it("reads the drill payload out of the page", () => {
    assert.equal(firstGradableScreen(JSON.parse(/id="exercise-data">([\s\S]*?)<\/script>/.exec(DRILL)[1])).formula, "=SUM(B2:B2)");
  });

  it("has no gradable screen when no hint spells out a formula", () => {
    assert.equal(firstGradableScreen({ screens: [{ expect: { value: 1 }, hints: { value: "Try again." } }] }), null);
  });

  it("follows the hub's own link rather than a list typed into the script", () => {
    assert.equal(firstLessonHref(HUB), "/excel/what-a-formula-actually-does");
    assert.equal(firstLessonHref("<main>no links</main>"), null);
  });
});

describe("smoke — a healthy origin", () => {
  let origin;
  before(async () => {
    origin = await fakeOrigin(healthy());
  });
  after(async () => {
    await origin.close();
  });

  it("passes every check, including the release identity", async () => {
    const { report, rows } = await smoke([origin.origin, "--sha", "abc1234"]);
    assert.deepEqual(report.failures, []);
    assert.ok(rows.some((row) => row.name === "the release is the one that was deployed" && row.ok));
    // The refusal half is part of the row's detail: a grader that accepted the wrong answer would
    // print without it, so the detail is the witness rather than the tick alone.
    const graded = rows.find((row) => /grades a drill/.test(row.name));
    assert.ok(graded.ok);
    assert.match(graded.detail, /=1 refused/);
    assert.ok(rows.some((row) => /print stylesheet/.test(row.name) && row.ok));
  });

  it("reports an unverified release rather than a tick when no --sha is given", async () => {
    const { report, rows } = await smoke([origin.origin]);
    assert.deepEqual(report.failures, []);
    const identity = rows.find((row) => row.name === "the release is the one that was deployed");
    assert.ok(identity.skipped, "a run with no expected sha cannot claim the release is right");
  });
});

describe("smoke — the ways a deploy goes wrong", () => {
  it("fails when the old build is still answering", async () => {
    const site = await fakeOrigin(healthy({ health: { status: "ok", sha: "old0000" } }));
    try {
      const { failures } = await smoke([site.origin, "--sha", "abc1234"]);
      assert.match(failures.join("\n"), /served old0000, deploy notes say abc1234/);
    } finally {
      await site.close();
    }
  });

  it("fails when the health endpoint answers with something that is not a health report", async () => {
    const site = await fakeOrigin(healthy({ health: { status: "degraded" } }));
    try {
      const { failures } = await smoke([site.origin]);
      assert.match(failures.join("\n"), /unexpected body/);
    } finally {
      await site.close();
    }
  });

  it("fails when a deep page is missing, and says which address", async () => {
    const site = await fakeOrigin(healthy({ routes: { "/excel-functions": null } }));
    try {
      const { failures } = await smoke([site.origin]);
      assert.match(failures.join("\n"), /serves \/excel-functions: status 404/);
    } finally {
      await site.close();
    }
  });

  it("fails when a page's stylesheet 404s — the host that uploads HTML but not the folder beside it", async () => {
    const site = await fakeOrigin(healthy({ assets: { "/assets/app.css": null } }));
    try {
      const { failures } = await smoke([site.origin]);
      assert.match(failures.join("\n"), /\/assets\/app\.css → 404/);
    } finally {
      await site.close();
    }
  });

  it("fails when the drill page ships no payload", async () => {
    const site = await fakeOrigin(healthy({ routes: { "/learn/excel/what-a-formula-actually-does": "<html><main>gone</main></html>" } }));
    try {
      const { failures } = await smoke([site.origin]);
      assert.match(failures.join("\n"), /no #exercise-data/);
    } finally {
      await site.close();
    }
  });

  it("fails when the hint formula no longer grades correct", async () => {
    const broken = DRILL.replace("=SUM(B2:B2)", "=SUM(B9:B9)");
    const site = await fakeOrigin(healthy({ routes: { "/learn/excel/what-a-formula-actually-does": broken } }));
    try {
      const { failures } = await smoke([site.origin]);
      assert.match(failures.join("\n"), /from the page's own hint was refused/);
    } finally {
      await site.close();
    }
  });

  it("fails when the sheet prints no verification address", async () => {
    const site = await fakeOrigin(healthy({ routes: { "/certificate": `<html><body><main><p>Certificate</p></main></body></html>` } }));
    try {
      const { failures } = await smoke([site.origin]);
      assert.match(failures.join("\n"), /a screen this check does not know/);
    } finally {
      await site.close();
    }
  });

  it("fails when the sheet loses its print rules", async () => {
    const site = await fakeOrigin(healthy({ assets: { "/assets/app.css": PRINT_CSS, "/assets/print.css": ".certificate-sheet { border: 1px }" } }));
    try {
      const { failures } = await smoke([site.origin]);
      assert.match(failures.join("\n"), /no @media print block with a @page margin/);
    } finally {
      await site.close();
    }
  });

  it("reads the sign-in gate and the accounts-off screen as correct, not as a broken sheet", async () => {
    for (const [body, expected] of [
      [GATE, /the sign-in gate/],
      [OFF, /accounts are not switched on/],
    ]) {
      const site = await fakeOrigin(healthy({ routes: { "/certificate": body } }));
      try {
        const { report, rows } = await smoke([site.origin]);
        assert.deepEqual(report.failures, []);
        assert.match(rows.find((row) => /answers \/certificate/.test(row.name)).detail, expected);
      } finally {
        await site.close();
      }
    }
  });

  it("fails an unknown address that answers 500 instead of the site's 404", async () => {
    const site = await fakeOrigin(healthy({ notFound: 500 }));
    try {
      const { failures } = await smoke([site.origin]);
      assert.match(failures.join("\n"), /unknown address with 404: status 500/);
    } finally {
      await site.close();
    }
  });

  it("skips the 404 check when the host serves the error page with 200", async () => {
    const site = await fakeOrigin(healthy({ notFound: 200 }));
    try {
      const { report, rows } = await smoke([site.origin]);
      assert.deepEqual(report.failures, []);
      assert.ok(rows.find((row) => /unknown address/.test(row.name)).skipped);
    } finally {
      await site.close();
    }
  });

  it("fails an origin that is not there at all, rather than crashing", async () => {
    const { failures } = await smoke(["http://127.0.0.1:9", "--timeout", "1000"]);
    assert.ok(failures.length > 0, "an unreachable origin has to be a red run");
  });
});

describe("smoke — the shipped static edition", () => {
  let child;
  let origin;

  before(async () => {
    child = spawn(process.execPath, [join(ROOT, "scripts/serve-static.mjs"), "legacy/dist", "0"], {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "pipe"],
    });
    origin = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("the static server did not start")), 10_000);
      child.stdout.on("data", (chunk) => {
        const match = /http:\/\/[^\s]+:(\d+)/.exec(String(chunk));
        if (match) {
          clearTimeout(timer);
          resolve(`http://127.0.0.1:${match[1]}`);
        }
      });
      child.on("exit", (code) => reject(new Error(`the static server exited with ${code}`)));
    });
  });

  after(() => {
    child.kill();
  });

  it("passes against the real dist: hub, drill, grading, assets and the build's own 404", async () => {
    const { report, rows } = await smoke([origin]);
    assert.deepEqual(report.failures, []);
    // The two checks a static host cannot answer, named rather than quietly ticked.
    const skipped = rows.filter((row) => row.skipped).map((row) => row.name);
    assert.ok(skipped.some((name) => /api\/health/.test(name)));
    assert.ok(skipped.some((name) => /\/certificate/.test(name)));
  });

  it("fails against a copy of dist with its lesson page removed", async () => {
    const copy = mkdtempSync(join(tmpdir(), "smoke-dist-"));
    cpSync(join(ROOT, "legacy/dist"), copy, { recursive: true });
    rmSync(join(copy, "learn"), { recursive: true, force: true });
    rmSync(join(copy, "excel/what-a-formula-actually-does.html"), { force: true });
    const broken = spawn(process.execPath, [join(ROOT, "scripts/serve-static.mjs"), copy, "0"], {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "pipe"],
    });
    try {
      const brokenOrigin = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("the static server did not start")), 10_000);
        broken.stdout.on("data", (chunk) => {
          const match = /http:\/\/[^\s]+:(\d+)/.exec(String(chunk));
          if (match) {
            clearTimeout(timer);
            resolve(`http://127.0.0.1:${match[1]}`);
          }
        });
        broken.on("exit", (code) => reject(new Error(`the static server exited with ${code}`)));
      });
      const { failures } = await smoke([brokenOrigin]);
      assert.match(failures.join("\n"), /serves the drill the hub links/);
    } finally {
      broken.kill();
      rmSync(copy, { recursive: true, force: true });
    }
  });
});
