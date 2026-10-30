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
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { renderSitemap } from "../legacy/src/site/assets.mjs";
import { siteConfig } from "../legacy/src/site/config.mjs";
import { loadContent } from "../legacy/src/site/content.mjs";
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
  it("lists both legal pages, and the count is the catalog plus three", () => {
    const xml = renderSitemap({ config, track, index });
    for (const path of ["/privacy", "/terms"]) {
      assert.ok(xml.includes(`<loc>https://drills.example${path}</loc>`), `sitemap is missing ${path}`);
    }
    assert.equal((xml.match(/<loc>/g) ?? []).length, index.length + 3);
    // The three that are not lessons, named: the home page and the two legal pages.
    for (const path of ["/learn", "/pricing", "/account"]) {
      assert.ok(!xml.includes(`<loc>https://drills.example${path}</loc>`), `sitemap should not list ${path}`);
    }
  });

  it("keeps the Next route in step with the static build", async () => {
    const { default: sitemap } = await import("../app/sitemap.js");
    const entries = sitemap();
    assert.equal(entries.length, index.length + 3);
    const urls = entries.map((entry) => entry.url);
    for (const path of ["/privacy", "/terms"]) {
      assert.ok(urls.includes(`https://drills.example${path}`) || urls.some((url) => url.endsWith(path)), `next sitemap is missing ${path}`);
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
