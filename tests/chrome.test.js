/**
 * The chrome's one job beyond the mark: give a reader a way back into their account.
 *
 * This test exists because the header was built as "the mark, the exercise count and the badge" — a
 * deliberate removal of a twelve-link wall — and the removal took the only global route to `/account`
 * with it. Accounts, billing and certificates all live behind that door. A visitor who lands on an exercise
 * from a search result could not reach it at all.
 *
 * The assertion is about the *header*, not the page: a link in the body of one page is not a way in.
 * The count and the badge are both gone now — the row is the mark, two ways in and the menu — so the
 * same file proves nothing crept back in beside them.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { readIcons } from "../legacy/src/site/assets.mjs";
import { renderChrome, renderDocument } from "../legacy/src/site/shell.mjs";

const ICONS = readIcons(new URL("../legacy/vendor/icons", import.meta.url).pathname);

const CONFIG = {
  name: "Excel Exercises",
  baseUrl: "https://example.test",
  appUrl: null,
  contact: null,
  pathPrefix: "",
  author: null,
  builtAt: "2026-01-01",
  inLanguage: "en",
  themeColor: { light: "#f9f9f8", dark: "#191918" },
};

const PAGE = {
  isHome: true,
  title: "Home",
  description: "Exercises.",
  path: "/",
  skipLabel: "drills",
  bodyClass: "",
};

const headerOf = (html) => {
  const open = html.indexOf('<header class="site"');
  assert.notEqual(open, -1, "no site header in the markup");
  const close = html.indexOf("</header>", open);
  assert.notEqual(close, -1, "the site header is never closed");
  return html.slice(open, close);
};

describe("the site header", () => {
  it("carries the account way in on the host that serves it", () => {
    const { header } = renderChrome({ config: CONFIG, page: PAGE, appPagesAvailable: true });
    const inner = headerOf(header);
    assert.match(inner, /href="\/account"/, "the header does not link the account page");
    assert.match(inner, />Account</, "the header link has no label a reader can see");
  });

  it("links the sibling deployment absolutely when this build has no account page", () => {
    const config = { ...CONFIG, appUrl: "https://app.example.test" };
    const { header } = renderChrome({ config, page: PAGE, appPagesAvailable: false });
    const inner = headerOf(header);
    assert.match(inner, /href="https:\/\/app\.example\.test\/account"/, "the account link does not point at the App host");
    assert.equal(inner.includes('href="/account"'), false, "a relative account link on a host with no /account is a 404");
  });

  it("omits the link rather than pointing at a page this build does not have", () => {
    const { header } = renderChrome({ config: CONFIG, page: PAGE, appPagesAvailable: false });
    assert.equal(header.includes("/account"), false, "the static build with no App host linked an account page it does not serve");
  });

  it("is the mark and the ways in, with no fact between them", () => {
    const { header } = renderChrome({ config: CONFIG, page: PAGE, appPagesAvailable: true });
    const inner = headerOf(header);
    assert.match(inner, /class="brand"/, "the mark left the header");
    // The wall of navigation was removed on purpose; this is not its way back in. Two links are all
    // that is allowed — the mark, the account — plus search, which is a way to find an exercise rather than
    // a menu: its name was the thing a learner could not remember without it.
    const hrefs = [...inner.matchAll(/<a [^>]*href="([^"]+)"/g)].map((match) => match[1]).sort();
    assert.deepEqual(hrefs, ["/", "/account", "/search"], "the header grew navigation beyond the mark, search and the account link");
  });

  it("carries no count and no badge on any page, whatever the page sets", () => {
    // The header used to print the page's place in its set, and a second bordered chip beside it on
    // some pages — one fact in two boxes. Both slots are gone from the shell, so a page cannot put one
    // back by setting a field: the row is the mark, two ways in and the menu on every route.
    for (const page of [
      { ...PAGE, counter: "3 free · 85 paid" },
      { ...PAGE, badge: "Free exercises · paid track" },
      { ...PAGE, path: "/excel-functions/countif", isHome: false },
    ]) {
      const inner = headerOf(renderChrome({ config: CONFIG, page, appPagesAvailable: true }).header);
      assert.equal(inner.includes("drill-count"), false, "a count came back into the header");
      assert.equal(inner.includes('class="badge"'), false, "a second fact chip came back into the header");
      assert.equal(inner.includes("undefined"), false, "the header printed undefined where a fact goes");
    }
  });

  it("gives the two ways in a glyph as well as a word", () => {
    // Search and account are the two links whose meaning a reader can take in before reading: a
    // magnifier and a person. The glyph never replaces the word — it is the scannable half.
    const inner = headerOf(renderChrome({ config: CONFIG, page: PAGE, appPagesAvailable: true, icons: ICONS }).header);
    for (const [label, path] of [["Search", "/search"], ["Account", "/account"]]) {
      const link = new RegExp(`<a class="head-link[^"]*"[^>]*href="${path}"[^>]*>([\\s\\S]*?)</a>`).exec(inner);
      assert.ok(link, `the header has no ${label} link`);
      assert.match(link[1], /<svg[^>]*class="icon icon-head"/, `the ${label} link has no glyph`);
      assert.equal(link[1].replace(/<[^>]+>/g, "").trim(), label, `the ${label} link lost its word to the glyph`);
    }
  });

  it("spells the menu button's name instead of leaving a bare icon", () => {
    // An icon-only square is the control desktop readers walk past, and next to four other bordered
    // squares it read as one more link. The label is visible text, so it is also the accessible name.
    const { header } = renderChrome({ config: CONFIG, page: PAGE, appPagesAvailable: true });
    const inner = headerOf(header);
    const button = /<button class="menu-toggle"[^>]*>([\s\S]*?)<\/button>/.exec(inner);
    assert.ok(button, "the header has no menu button");
    assert.match(button[1], /class="menu-label">Menu</, "the menu button has no visible name");
    assert.equal(button[1].includes("visually-hidden"), false, "the name is hidden from sight and read twice by a screen reader");
  });

  it("opens the drawer from a button, so the header stays links only", () => {
    const { header } = renderChrome({ config: CONFIG, page: PAGE, appPagesAvailable: true });
    const inner = headerOf(header);
    const button = /<button class="menu-toggle"[^>]*>/.exec(inner);
    assert.ok(button, "the header has no menu button");
    assert.match(button[0], /aria-controls="site-menu"/, "the button does not say what it opens");
    assert.match(button[0], /aria-expanded="false"/, "the button does not start closed");
    assert.match(button[0], /aria-haspopup="dialog"/, "the button does not announce that it opens a dialog");
    assert.equal(/href/.test(button[0]), false, "the menu button is a link, which puts navigation back in the header");
  });
});

describe("the drawer", () => {
  const menuOf = (html) => {
    const open = html.indexOf('<dialog class="menu"');
    assert.notEqual(open, -1, "the page has no drawer");
    const close = html.indexOf("</dialog>", open);
    return html.slice(open, close);
  };

  it("is one dialog, rendered beside the page rather than inside it", () => {
    const html = renderDocument({ config: CONFIG, page: PAGE, body: "<main id=\"main\">x</main>", appPagesAvailable: true });
    assert.equal(html.match(/<dialog class="menu"/g).length, 1, "more than one drawer in one document");
    const main = html.indexOf("<main");
    assert.ok(html.indexOf('<dialog class="menu"') < main, "the drawer is inside the page body");
  });

  it("holds every destination the footer used to carry", () => {
    const html = renderDocument({ config: CONFIG, page: PAGE, body: "", appPagesAvailable: true, projectsAvailable: true });
    const hrefs = [...menuOf(html).matchAll(/href="([^"]+)"/g)].map((match) => match[1]).sort();
    assert.deepEqual(
      hrefs,
      ["/account", "/certificate", "/daily", "/excel-exercises", "/excel-functions", "/flashcards", "/leaderboard", "/pricing", "/projects", "/shortcuts", "/start"],
      "the drawer does not hold the walls it replaced",
    );
  });

  it("keeps the rows relative on the host that serves them", () => {
    const html = renderDocument({ config: { ...CONFIG, appUrl: "https://app.example.test" }, page: PAGE, body: "", appPagesAvailable: true });
    assert.equal(menuOf(html).includes("https://app.example.test"), false, "the Next host sent the reader to another origin");
  });

  it("names each row in words, with a glyph beside the word rather than instead of it", () => {
    const menu = menuOf(renderDocument({ config: CONFIG, page: PAGE, body: "", appPagesAvailable: true, icons: ICONS }));
    const links = [...menu.matchAll(/<a class="menu-row"[^>]*>([\s\S]*?)<\/a>/g)].map((match) => match[1]);
    assert.ok(links.length >= 8, `the rows are not plain labels: ${links.length} matched`);
    for (const inner of links) {
      assert.match(inner, /<svg[^>]*class="icon icon-row"/, "a row has no glyph");
      const text = inner.replace(/<[^>]+>/g, "").trim();
      // A row whose text is one character is a glyph tile coming back, and a glyph encodes nothing a
      // reader can act on — "Leaderboard" is what they need, not a square.
      assert.ok([...text].length >= 3, `a row's whole label is a symbol: ${JSON.stringify(text)}`);
    }
  });

  it("does not caption eleven links with five headings", () => {
    const menu = menuOf(renderDocument({ config: CONFIG, page: PAGE, body: "", appPagesAvailable: true }));
    // Captions at 2.2 rows each are headers the reader has to skip past; the foot rule is the one
    // break the list needs, between the work and the account.
    assert.equal(menu.includes('class="menu-group"'), false, "the drawer is captioned again");
    assert.equal(menu.match(/class="menu-list/g).length, 2, "the drawer lost its foot block");
  });

  it("keeps the same rows when scripting is off", () => {
    const menu = menuOf(renderDocument({ config: CONFIG, page: PAGE, body: "", appPagesAvailable: true }));
    assert.match(menu, /<noscript><style>[^<]*#menu-open/, "the no-JS fallback does not hide the button");
    assert.match(menu, /dialog\.menu:not\(\[open\]\)/, "the no-JS fallback does not put the rows back in the flow");
  });
});

describe("the document shell", () => {
  it("puts the account way in on every page it renders", () => {
    const html = renderDocument({
      config: CONFIG,
      page: { ...PAGE, path: "/privacy", isHome: false, title: "Privacy" },
      body: "<main id=\"main\">x</main>",
      appPagesAvailable: true,
    });
    assert.match(headerOf(html), /href="\/account"/);
  });
});

/**
 * The other half of the same problem: a learner with a complaint, a correction or a deletion request
 * needs an address, and the privacy page promises one. The footer is the only line every page carries,
 * so the address belongs there — when the build has one. A build with `SITE_CONTACT` unset must not
 * print a `mailto:` to nowhere, which is what a hardcoded default would do.
 */
describe("the footer's way to a human", () => {
  const footerOf = (html) => {
    const open = html.indexOf('<footer class="foot"');
    assert.notEqual(open, -1, "no footer in the markup");
    return html.slice(open, html.indexOf("</footer>", open));
  };

  it("prints the configured address as a mailto", () => {
    const { footer } = renderChrome({ config: { ...CONFIG, contact: "hello@example.test" }, page: PAGE });
    assert.match(footerOf(footer), /<a href="mailto:hello@example\.test">Email us<\/a>/);
  });

  it("keeps a mailto: prefix if the address already had one", () => {
    const { footer } = renderChrome({ config: { ...CONFIG, contact: "mailto:hi@example.test" }, page: PAGE });
    assert.match(footerOf(footer), /href="mailto:hi@example\.test"/);
  });

  it("prints nothing when the build has no address", () => {
    const { footer } = renderChrome({ config: { ...CONFIG, contact: null }, page: PAGE });
    assert.equal(footerOf(footer).includes("mailto:"), false);
  });
});
