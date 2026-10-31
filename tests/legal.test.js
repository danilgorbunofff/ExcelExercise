/**
 * Item 10 — the legal pages and the data rights that back them.
 *
 * The pages are asserted as generated output rather than as prose: what matters is that the sentence
 * a learner relies on ("nothing that names you is kept") is on the page, that the page is indexable,
 * and that the privacy page names the same storage keys the client actually writes. The export and
 * the confirmation rule are pure functions and are tested directly; the two routes import
 * `next/server` and assembled SQL reads, so their wiring is pinned with source probes — the same
 * approach `tests/paywall.test.js` uses for `proxy.js`.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { renderSitemap } from "../legacy/src/site/assets.mjs";
import { siteConfig } from "../legacy/src/site/config.mjs";
import { loadArticles, loadContent } from "../legacy/src/site/content.mjs";
import { dashboardGroups } from "../legacy/src/site/dashboard-page.mjs";
import { legalSections, prepareLegalPage, renderLegalPage, RETENTION } from "../legacy/src/site/legal-page.mjs";
import { PRICE } from "../legacy/src/site/pricing-page.mjs";
import {
  buildExport,
  CONFIRMATION,
  confirmed,
  EXPORT_FORMAT,
  EXPORT_VERSION,
  exportFilename,
} from "../lib/legal.js";

const ROOT = join(import.meta.dirname, "..");
const ENV = { SITE_URL: "https://drills.example", SITE_BUILT_AT: "2026-11-02" };
const config = siteConfig(ENV);
const { track, index } = loadContent(join(ROOT, "legacy/content"));
const articles = loadArticles(join(ROOT, "legacy/content"));
// The notes, and the `/excel-functions` hub that only exists when there are notes to list.
const notePages = articles.length + (articles.length > 0 ? 1 : 0);
const KINDS = ["privacy", "terms"];
const page = (kind) => prepareLegalPage({ config, track, index, kind });
const source = (path) => readFileSync(join(ROOT, path), "utf8");

describe("the legal pages", () => {
  it("renders both as indexable pages with a heading and a footer that links to the other", () => {
    for (const kind of KINDS) {
      const html = renderLegalPage({ config, track, index, kind });
      assert.ok(html.includes(`<h1>`), `${kind}: no h1`);
      assert.ok(!html.includes('<meta name="robots" content="noindex">'), `${kind}: noindex`);
      assert.ok(html.includes('href="/privacy"'), `${kind}: footer privacy link`);
      assert.ok(html.includes('href="/terms"'), `${kind}: footer terms link`);
      assert.ok(html.includes(`rel="canonical" href="https://drills.example/${kind}"`), `${kind}: canonical`);
    }
  });

  it("carries eleven sections each, and every one has an id so it can be linked to", () => {
    const documents = legalSections({ config, track });
    for (const kind of KINDS) {
      assert.equal(documents[kind].sections.length, 11, `${kind}: section count`);
      for (const entry of documents[kind].sections) {
        assert.match(entry.id, /^[a-z][a-z0-9-]*$/, `${kind}: section id "${entry.id}"`);
        assert.ok(entry.heading.trim().length > 3, `${kind}: section "${entry.id}" has no heading`);
      }
    }
    const { body } = page("privacy");
    assert.equal((body.match(/<h2 id="/g) ?? []).length, 11, "the body does not render all eleven sections");
  });

  it("names the browser storage keys the client actually writes, and nothing invented", () => {
    const { body } = page("privacy");
    for (const key of ["es.progress", "es.trial", "es.grace", "es.feedback"]) {
      assert.ok(body.includes(`<dt>${key}</dt>`), `privacy does not name ${key}`);
    }
    // The list is the client's, so read it out of the client instead of trusting a second copy of the
    // names: every `*_KEY` constant the two modules export has to be documented, and nothing invented.
    const client = source("legacy/src/client/state.js") + source("legacy/src/client/feedback.js");
    const written = [...client.matchAll(/^(?:export )?const \w*KEY = "(es\.[a-z]+)";$/gm)].map((match) => match[1]);
    assert.equal(written.length, 4, `expected four storage keys in the client, found ${written.join(", ")}`);
    assert.deepEqual([...written].sort(), ["es.feedback", "es.grace", "es.progress", "es.trial"]);
  });

  it("prints the retention list verbatim, and says nothing that names the learner survives", () => {
    const { body } = page("privacy");
    for (const row of RETENTION) {
      assert.ok(body.includes(`<dt>${row.what}</dt>`), `privacy is missing the "${row.what}" row`);
      assert.ok(body.includes(row.keeps), `privacy is missing what the "${row.what}" row keeps`);
    }
    assert.ok(body.includes("Kept, unlinked from you:"), "privacy does not frame the list");
    assert.ok(body.includes('href="/account"'), "privacy does not say where to delete");
  });

  it("says what this build never does, rather than what it intends", () => {
    const { body } = page("privacy");
    for (const probe of [
      "no analytics script",
      "no advertising or tracking cookie",
      "no third-party font, stylesheet, image or script",
    ]) {
      assert.ok(body.includes(probe), `privacy does not say: ${probe}`);
    }
    // One essential cookie and no banner: the page has to say which, or a banner decision looks arbitrary.
    assert.match(body, /cookie/i, "privacy never mentions cookies");
  });

  it("sells the track at the price the pricing page charges, and lists the whole track", () => {
    const { body } = page("terms");
    assert.ok(body.includes(`>${PRICE}<`) || body.includes(`${PRICE} for the whole thing`), "terms does not name the price");
    assert.ok(body.includes(`${track.freeLessonCount}`), "terms does not say how many drills are free");
    assert.ok(body.includes("not affiliated with, endorsed by or connected to"), "terms does not disclaim affiliation");
    assert.ok(body.includes("Excel is a trademark of Microsoft Corporation"), "terms does not name the trademark owner");
    assert.ok(body.includes("refund"), "terms has no refund term");
  });

  it("admits its own status: a grader is not an authority, and no lawyer has read the page", () => {
    assert.ok(page("terms").body.includes("not been reviewed by a lawyer"), "terms hides that it is unreviewed");
    assert.ok(
      page("terms").body.includes("Excel's formula rules vary by version and by locale"),
      "terms does not warn that the grader follows one locale",
    );
    assert.ok(
      page("terms").body.includes("the remedy is a refund"),
      "terms does not say what happens when it fails to deliver",
    );
  });

  it("sets the page metadata the shell needs, and keeps the counter honest", () => {
    for (const kind of KINDS) {
      const { page: meta } = page(kind);
      assert.equal(meta.path, `/${kind}`);
      assert.equal(meta.counter, `${index.length} drills`);
      assert.ok(meta.description.length > 20, `${kind}: description too short to be a description`);
      assert.equal(meta.bodyClass, "legal");
    }
  });
});

describe("the sitemap", () => {
  it("lists both legal pages among the pages that are not lessons", () => {
    const groups = dashboardGroups({ track, index });
    const xml = renderSitemap({
      config,
      track,
      index,
      groups,
      articles: articles.map((article) => ({ path: `/excel-functions/${article.slug}`, updated: article.updated })),
      extra: articles.length > 0 ? ["exercises", "functions", "about", "privacy", "terms"] : ["exercises", "about", "privacy", "terms"],
    });
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
    for (const path of ["/privacy", "/terms"]) {
      assert.ok(locs.includes(`${config.baseUrl}${path}`), `sitemap is missing ${path}`);
    }
    // The sitemap is `indexablePaths()` and nothing else: no dashboard, no pricing, no account, and no
    // duplicate whether a path arrives as a group or as a lesson.
    assert.equal(new Set(locs).size, locs.length, "a URL is listed twice");
    assert.equal(locs.length, 1 + 4 + groups.length + index.length + notePages);
    for (const path of ["/learn", "/pricing", "/account"]) {
      assert.ok(!locs.includes(`${config.baseUrl}${path}`), `sitemap should not list ${path}`);
    }
  });

  it("keeps the Next route in step with the static build", async () => {
    const { default: sitemap } = await import("../app/sitemap.js");
    const groups = dashboardGroups({ track, index });
    const urls = sitemap().map((entry) => entry.url);
    assert.equal(urls.length, 1 + 4 + groups.length + index.length + notePages);
    for (const path of ["/privacy", "/terms", "/about", "/excel-exercises", ...(articles.length > 0 ? ["/excel-functions"] : [])]) {
      assert.ok(urls.some((url) => url.endsWith(`${path}`) || url.endsWith(`${path}/`)), `next sitemap is missing ${path}`);
    }
  });
});

describe("buildExport", () => {
  const user = { id: "8f14e45f-ceea-467a-9a3e-1b3f0e6a5f00", email: "learner@example.com" };
  const rows = [
    { lesson_id: "01-sum-basics", score: 100 },
    { lesson_id: "02-average-scores", score: 80 },
  ];

  it("is a versioned document that names its owner", () => {
    const document = buildExport({ user, generatedAt: new Date("2026-11-02T10:00:00Z") });
    assert.equal(document.format, EXPORT_FORMAT);
    assert.equal(document.version, EXPORT_VERSION);
    assert.equal(document.exported_at, "2026-11-02T10:00:00.000Z");
    assert.deepEqual(document.account, { id: user.id, email: user.email });
  });

  it("counts every collection it prints, so a truncated read is visible in the file itself", () => {
    const document = buildExport({ user, progress: rows, attempts: [{}], points: [{}], streaks: [{}], entitlements: [{}] });
    assert.deepEqual(document.counts, {
      progress: 2,
      attempts: 1,
      points: 1,
      streaks: 1,
      entitlements: 1,
      payments: 0,
    });
    assert.equal(document.progress, rows);
  });

  it("tells the reader what will outlive them, and never names a person in that list", () => {
    const document = buildExport({ user });
    assert.deepEqual(document.retained_after_deletion, RETENTION);
    const retained = JSON.stringify(document.retained_after_deletion);
    assert.ok(!retained.includes(user.email), "the retention list repeats the email address");
  });

  it("starts with the account and the export time, not with a bare array", () => {
    const document = buildExport({ user });
    assert.deepEqual(Object.keys(document).slice(0, 4), ["format", "version", "exported_at", "account"]);
  });
});

describe("the confirmation rule", () => {
  it("accepts the word, with padding and any case", () => {
    for (const value of [CONFIRMATION, "  Delete My Account ", "DELETE MY ACCOUNT", "delete my account\n"]) {
      assert.equal(confirmed(value), true, JSON.stringify(value));
    }
  });

  it("refuses everything else, including the near misses", () => {
    for (const value of ["delete", "delete account", "delete my account!", "", "   ", null, undefined, 1, ["delete my account"]]) {
      assert.equal(confirmed(value), false, JSON.stringify(value) ?? String(value));
    }
  });
});

describe("exportFilename", () => {
  it("is sortable, dated, and changes with the day", () => {
    assert.equal(exportFilename(new Date("2026-11-02T23:59:59Z")), "excel-supreme-export-2026-11-02.json");
    assert.notEqual(exportFilename(new Date("2026-11-02T00:00:00Z")), exportFilename(new Date("2026-11-03T00:00:00Z")));
    assert.match(exportFilename(), /^excel-supreme-export-\d{4}-\d{2}-\d{2}\.json$/);
  });
});

describe("the export route", () => {
  const route = source("app/api/account/export/route.js");

  it("answers unconfigured and signed-out callers before it reads anything", () => {
    assert.ok(route.includes("account_export_unconfigured"), "no 503 path");
    assert.ok(route.includes("sign_in_required"), "no 401 path");
    assert.ok(route.includes("authConfig().enabled"), "does not check whether accounts are configured");
    assert.ok(route.indexOf("authConfig().enabled") < route.indexOf("currentUser()"), "reads the session before the config check");
  });

  it("reaches the money tables through the self-scoped RPCs, never a service key", () => {
    assert.ok(route.includes('rpc("my_entitlements")'), "entitlements are not read through the definer RPC");
    assert.ok(route.includes('rpc("my_payments")'), "payments are not read through the definer RPC");
    assert.ok(!route.includes("SERVICE_ROLE"), "the export reaches for the service-role key");
    assert.ok(!route.includes("progressClient"), "the export uses the privileged client");
  });

  it("refuses rather than returning a document with a hole in it", () => {
    assert.ok(route.includes("failed.error"), "no error check on the reads");
    assert.ok(route.includes("export_failed"), "a failed read is not a refusal");
  });

  it("is a download, and is not cacheable", () => {
    assert.ok(route.includes("content-disposition"), "no content-disposition");
    assert.ok(route.includes("exportFilename()"), "the filename is not derived from the export day");
    assert.ok(route.includes("no-store"), "an export could be cached");
  });
});

describe("the delete route", () => {
  const route = source("app/api/account/delete/route.js");

  it("requires the word before it requires anything else", () => {
    const confirmation = route.indexOf("confirmed(submitted)");
    assert.ok(confirmation > -1, "the confirmation word is not checked");
    assert.ok(route.indexOf("confirmation_required", confirmation) > confirmation, "no 400 for a missing word");
    assert.ok(route.indexOf('rpc("request_account_deletion")') > confirmation, "deletes before confirming");
  });

  it("erases through the definer RPC and revokes the identity with the admin client", () => {
    assert.ok(route.includes('rpc("request_account_deletion")'), "the erase RPC is not called");
    assert.ok(route.includes("auth.admin.deleteUser"), "the identity is never deleted");
    assert.ok(route.includes("progressClient"), "the admin client is not the one from lib/progress/write.js");
  });

  it("says so when the data is gone but the sign-in is not", () => {
    assert.ok(route.includes("identity_purge_failed"), "a failed purge would report success");
    assert.ok(route.includes("502"), "a failed purge has no failure status");
  });

  it("sends a form to the confirmation page, and clears the session", () => {
    assert.ok(route.includes('location: "/account/deleted"'), "a form post has nowhere to go");
    assert.ok(route.includes("signOut"), "the session is left in place");
  });
});

describe("the account page", () => {
  const pageSource = source("app/account/page.js");

  it("offers the export as a download", () => {
    assert.ok(pageSource.includes('href="/api/account/export"'), "no export link");
    assert.ok(pageSource.includes("download"), "the export is not a download");
  });

  it("posts the deletion to the route with the word in the body", () => {
    assert.ok(pageSource.includes('action="/api/account/delete"'), "no delete form");
    assert.ok(pageSource.includes('method="post"'), "the delete form is not a post");
    assert.ok(pageSource.includes('name="confirm"'), "the form cannot carry the confirmation word");
    assert.ok(pageSource.includes("required"), "the field is not required");
  });

  it("keeps the destructive form away from the sign-out button, and says it cannot be undone", () => {
    assert.ok(pageSource.indexOf("auth-danger") > pageSource.indexOf("signOut"), "delete sits above sign out");
    assert.ok(pageSource.includes("cannot be"), "the form does not say the deletion is final");
    assert.ok(pageSource.includes('href="/privacy"'), "the form does not point at what is kept");
  });
});

describe("the proxy", () => {
  const proxy = source("proxy.js");

  it("lets the confirmation page through, because the session is gone by the time it renders", () => {
    assert.ok(proxy.includes("PUBLIC"), "there is no exemption for the deleted page");
    assert.ok(proxy.includes("/^\\/account\\/deleted\\/?$/"), "the exemption does not name the deleted page");
    const gate = proxy.indexOf("GATED.some");
    const exemption = proxy.indexOf("PUBLIC.some");
    assert.ok(exemption > gate, "the exemption is not in the gate condition");
  });
});

// The lint is the only thing standing between a false promise and a reader who relies on it, so it is
// tested the way the copy is: plant each claim it is supposed to refuse and watch it refuse, then plant
// nothing and watch it pass.
describe("the legal lint", async () => {
  const { lintDocuments, lintLegal } = await import("../packages/content-lint/legal.js");
  const documents = () => structuredClone(legalSections({ config, track }));
  const lint = (mutate, options = {}) => {
    const copy = documents();
    mutate?.(copy);
    return lintDocuments({ documents: copy, root: options.root ?? ROOT });
  };
  const messages = (report) => report.findings.map((finding) => `${finding.where} ${finding.field}: ${finding.message}`).join("\n");

  it("passes on the copy both builds print, and counts what it read", () => {
    const report = lintLegal({ config, track });
    assert.equal(report.stats.errors, 0, messages(report));
    assert.deepEqual(report.stats, { documents: 2, sections: 22, retention: 3, errors: 0 });
    assert.ok(report.ok);
  });

  it("refuses each of the five things this site does not sell", () => {
    const claims = [
      ["organizations", "Ask your organization about a discount."],
      ["universities", "This track is used by universities in three countries."],
      ["cohorts", "Your cohort starts on Monday."],
      ["referrals", "Earn a month free with referrals."],
      ["institutional seats", "Buy institutional seats for your team."],
      ["classrooms", "A classroom edition is available."],
    ];
    for (const [name, sentence] of claims) {
      const report = lint((copy) => {
        copy.terms.sections[0].html = `<p>${sentence}</p>`;
      });
      assert.equal(report.ok, false, `"${name}" was not refused`);
      assert.ok(
        report.findings.some((finding) => finding.severity === "error" && finding.where === "terms.md"),
        `"${sentence}" produced no terms finding`,
      );
    }
  });

  it("names the word it refused, and the terms lede is covered too", () => {
    const report = lint((copy) => {
      copy.privacy.lede = "A privacy policy for cohorts and their institutions.";
    });
    assert.equal(report.ok, false);
    assert.match(messages(report), /privacy\.md lede: "cohorts"/);
    assert.match(messages(report), /privacy\.md lede: "institution"/);
  });

  it("refuses a missing section, because a missing section is a missing promise", () => {
    const report = lint((copy) => {
      copy.privacy.sections = copy.privacy.sections.filter((section) => section.id !== "export");
    });
    assert.equal(report.ok, false);
    assert.match(messages(report), /privacy\.md section: the "export" section is missing/);
  });

  it("refuses decorative punctuation, the same as every other page", () => {
    const report = lint((copy) => {
      copy.terms.sections[1].html = "<p>The whole track — one payment.</p>";
    });
    assert.equal(report.ok, false);
    assert.match(messages(report), /en dash|em dash/);
  });

  it("refuses a retention row the deletion section does not name", () => {
    const report = lint((copy) => {
      copy.privacy.sections.find((section) => section.id === "delete").html = "<p>Nothing is kept.</p>";
    });
    assert.equal(report.ok, false);
    assert.match(messages(report), /the deletion section does not mention/);
  });

  it("refuses a Next route that prints prose of its own instead of the shared document", () => {
    const root = mkdtempSync(join(tmpdir(), "legal-lint-"));
    try {
      for (const route of ["app/privacy/page.js", "app/terms/page.js"]) {
        mkdirSync(join(root, route, ".."), { recursive: true });
        writeFileSync(join(root, route), `import { prepareLegalPage } from "x";\nexport default () => prepareLegalPage();\n`);
      }
      const clean = lint(undefined, { root });
      assert.equal(clean.stats.errors, 0, messages(clean));

      writeFileSync(
        join(root, "app/terms/page.js"),
        `import { prepareLegalPage } from "x";\nconst lede = "the terms of service for this site, written in plain English and updated";\nexport default () => prepareLegalPage();\n`,
      );
      const copied = lint(undefined, { root });
      assert.equal(copied.ok, false);
      assert.match(messages(copied), /app\/terms\/page\.js copy: carries \d+ words of its own/);

      writeFileSync(join(root, "app/privacy/page.js"), "export default () => null;\n");
      const bypass = lint(undefined, { root });
      assert.equal(bypass.ok, false);
      assert.match(messages(bypass), /does not print the shared legal document/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
