/**
 * The two deployables. This site ships twice — the Next app, and a folder of HTML with no server —
 * and the static edition used to link the pages only the other one has, so two of its links were
 * 404s (D15) and its error page was the host's plain text (D13).
 *
 * The rule this file pins is one sentence: a static page links an account-only destination at
 * `SITE_APP_URL` when that deployment exists, and does not link it at all when it does not. That is
 * checked at the renderer and again through a real build, because the renderer being right is no use
 * if the build forgets to pass the value down.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, describe, it } from "node:test";

import { build } from "../legacy/src/build.mjs";
import { siteConfig } from "../legacy/src/site/config.mjs";
import { loadArticles, loadContent } from "../legacy/src/site/content.mjs";
import { prepareLegalPage } from "../legacy/src/site/legal-page.mjs";
import { preparePricingPage } from "../legacy/src/site/pricing-page.mjs";
import { renderDocument, renderWaysOut } from "../legacy/src/site/shell.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const APP = "https://app.drills.example";
const ENV = { SITE_URL: "https://drills.example", SITE_BUILT_AT: "2026-10-28" };
const { track, index } = loadContent(join(ROOT, "legacy/content"));
const articles = loadArticles(join(ROOT, "legacy/content"));

describe("the static edition's address for the app", () => {
  it("is absent by default, which means this build is the whole site", () => {
    assert.equal(siteConfig({ ...ENV }).appUrl, null);
  });

  it("is an origin when it is set", () => {
    assert.equal(siteConfig({ ...ENV, SITE_APP_URL: APP }).appUrl, APP);
  });

  it("refuses a value that is not a bare origin", () => {
    for (const bad of ["app.example", "https://app.example/path", "ftp://app.example", "https://app.example?x=1"]) {
      assert.throws(() => siteConfig({ ...ENV, SITE_APP_URL: bad }), /SITE_APP_URL/, `${bad} was accepted`);
    }
  });
});

describe("the chrome's account doors", () => {
  const about = renderWaysOut({ variant: "dashboard", appUrl: null });
  const aboutApp = renderWaysOut({ variant: "dashboard", appUrl: APP });
  const home = renderWaysOut({ variant: "home", appUrl: null });
  const homeApp = renderWaysOut({ variant: "home", appUrl: APP });

  it("does not offer a page this build cannot serve", () => {
    assert.ok(!about.includes('href="/account"'), "the dashboard offers an account page that is not here");
    assert.ok(!about.includes('href="/certificate"'), "the dashboard offers a certificate page that is not here");
    assert.ok(!home.includes('href="/certificate"'), "the front page offers a certificate page that is not here");
  });

  it("points at the deployment that can serve them when one is named", () => {
    assert.ok(aboutApp.includes(`href="${APP}/account"`), "the account link is not absolute");
    assert.ok(homeApp.includes(`href="${APP}/certificate"`), "the front page does not link the certificate");
    assert.ok(!homeApp.includes('href="/certificate"'), "a certificate link was left relative");
  });

  it("keeps the links relative on a host that serves them itself", () => {
    const next = renderWaysOut({ variant: "dashboard", appPagesAvailable: true, appUrl: APP });
    assert.ok(next.includes('href="/account"'), "the Next host should link its own page");
    assert.ok(!next.includes(APP), "the Next host should not send the reader to another origin");
  });
});

describe("the pricing call to action", () => {
  const render = (extra) => preparePricingPage({ config: siteConfig(ENV), track, index, ...extra }).body;

  it("offers an account on a host that has one", () => {
    assert.ok(render({}).includes('href="/signup?next=/pricing"'));
  });

  it("is omitted, not broken, when there is no signup page", () => {
    const body = render({ signupHref: null });
    assert.ok(!body.includes("Create an account"), "the page still offers an account it cannot create");
    assert.ok(!/href="(null|undefined|\/signup)/.test(body), "the page still points somewhere it cannot serve");
    assert.ok(body.includes("Do drill 1"), "with no account door the free drill has to be the call to action");
    const next = render({ signupHref: `${APP}/signup?next=/pricing` });
    assert.ok(next.includes(`href="${APP}/signup?next=/pricing"`), "the signup button is not absolute");
  });

  it("posts a payment to the host that can take it", () => {
    const body = render({ checkout: { enabled: true }, checkoutAction: `${APP}/api/stripe/checkout?plan=annual` });
    assert.ok(body.includes(`action="${APP}/api/stripe/checkout?plan=annual"`), "the form posts to a route this build has");
  });
});

describe("the legal pages' account reference", () => {
  const render = (accountHref) =>
    ["privacy", "terms"].map((kind) => prepareLegalPage({ config: siteConfig(ENV), track, index, kind, accountHref }).body);

  it("links the account page when one exists", () => {
    for (const body of render("/account")) assert.ok(body.includes('<a href="/account">account page</a>'));
  });

  it("still names the account page when the reader has to reach it elsewhere", () => {
    for (const body of render(null)) {
      assert.ok(body.includes("account page"), "the policy stopped mentioning the account page");
      assert.ok(!body.includes('href="/account"'), "the policy links a page this build does not have");
    }
  });

  it("links the sibling deployment when one is named", () => {
    for (const body of render(`${APP}/account`)) assert.ok(body.includes(`href="${APP}/account"`));
  });
});

describe("a built static edition", () => {
  let out;
  const files = new Map();

  before(() => {
    out = mkdtempSync(join(tmpdir(), "es-parity-"));
    build({ out, env: { ...ENV, SITE_APP_URL: APP }, quiet: true });
    for (const file of ["pricing/index.html", "privacy/index.html", "terms/index.html", "404.html"]) {
      files.set(file, readFileSync(join(out, file), "utf8"));
    }
  });

  after(() => rmSync(out, { recursive: true, force: true }));

  it("sends the account-only links to the app deployment", () => {
    assert.ok(files.get("pricing/index.html").includes(`href="${APP}/signup?next=/pricing"`));
    for (const file of ["privacy/index.html", "terms/index.html"]) {
      assert.ok(files.get(file).includes(`href="${APP}/account"`), `${file} does not link the app's account page`);
    }
  });

  it("writes the 404 document a static host can serve", () => {
    const html = files.get("404.html");
    assert.ok(html.includes("<h1>That page is not here</h1>"));
    assert.ok(html.includes('<header class="site"') && html.includes('<footer class="foot"'));
    assert.ok(html.includes('<meta name="robots" content="noindex">'));
  });

  it("gives every page the same chrome, error page included", () => {
    const page = { path: "/404", title: "Page not found", description: "", counter: "", badge: "", skipLabel: "the error" };
    assert.equal(renderDocument({ config: siteConfig(ENV), page, body: "" }).includes('<header class="site"'), true);
  });
});

describe("the notes stay reachable from the static front door", () => {
  it("lists the hub in the chrome when the notes ship", () => {
    assert.ok(renderWaysOut({ variant: "home" }).includes('href="/excel-functions"'));
    assert.ok(articles.length > 0, "a hub with no notes behind it is not a page worth linking");
  });
});
