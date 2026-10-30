/**
 * The design system's rules, as assertions. Phase 5A is a set of constraints (one
 * radius, one shadow, no gradients, no raw colour outside tokens, no motion unless
 * asked for), and constraints rot silently unless something checks them. This file is
 * also the class-coverage check: every class the templates emit has a rule.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { buildStyles, readIcons } from "../legacy/src/site/assets.mjs";
import { siteConfig } from "../legacy/src/site/config.mjs";
import { loadContent } from "../legacy/src/site/content.mjs";
import { renderDashboardPage } from "../legacy/src/site/dashboard-page.mjs";
import { renderExercisePage } from "../legacy/src/site/exercise-page.mjs";
import { renderIndexPage } from "../legacy/src/site/index-page.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "legacy");
const STYLES = join(ROOT, "src/styles");
const file = (name) => readFileSync(join(STYLES, name), "utf8");

const tokens = file("tokens.css");
const base = file("base.css");
const components = file("components.css");
const authored = [base, components];

const { css, sources } = buildStyles({ vendorDir: join(ROOT, "vendor"), stylesDir: STYLES });
const config = siteConfig({ SITE_URL: "https://drills.example", SITE_BUILT_AT: "2026-10-28" });
const { track, index } = loadContent(join(ROOT, "content"));
const icons = readIcons(join(ROOT, "vendor/icons"));

const html = [
  renderIndexPage({ config, track, index, icons, clientAvailable: true }),
  renderDashboardPage({ config, track, index, icons, clientAvailable: true }),
  ...index.map((entry) => renderExercisePage({ config, track, index, entry, icons, clientAvailable: true })),
].join("\n");

const declarations = (text, property) =>
  [...text.matchAll(new RegExp(`${property}\\s*:\\s*([^;}]+)`, "g"))].map((match) => match[1].trim());

describe("tokens", () => {
  it("are the semantic layer the components read", () => {
    for (const token of [
      "--bg",
      "--surface",
      "--surface-sunk",
      "--line",
      "--line-strong",
      "--text",
      "--text-muted",
      "--ok",
      "--warn",
      "--err",
      "--btn-bg",
      "--btn-text",
      "--focus",
      "--font-display",
      "--font-ui",
      "--font-mono",
      "--shadow-1",
      "--prose",
      "--shell",
      "--rail",
    ]) {
      assert.match(tokens, new RegExp(`${token}\\s*:`), `${token} is not defined`);
    }
  });

  it("fixes the measure, the shell and the two radii the design system allows", () => {
    assert.match(tokens, /--prose:\s*68ch;/);
    assert.match(tokens, /--shell:\s*1080px;/);
    assert.match(tokens, /--rail:\s*260px;/);
    assert.match(tokens, /--r-1:\s*3px;/);
    assert.match(tokens, /--r-2:\s*5px;/);
    assert.equal(declarations(tokens, "border-radius").length, 0, "tokens define values, not rules");
  });

  it("is the only file allowed to hold a raw colour", () => {
    for (const text of authored) {
      const withoutUrls = text.replace(/url\([^)]*\)/g, "");
      assert.equal(/#[0-9a-fA-F]{3,8}\b/.test(withoutUrls), false, "a raw hex colour escaped tokens.css");
      assert.equal(/\brgba?\(/.test(withoutUrls), false, "an rgb() colour escaped tokens.css");
      assert.equal(/\bhsla?\(/.test(withoutUrls), false, "an hsl() colour escaped tokens.css");
    }
  });

  it("carries dark overrides that are ready without being the default", () => {
    assert.match(tokens, /\.dark\s*\{/);
    assert.equal(/prefers-color-scheme/.test(tokens), false, "the site ships light-only on purpose");
  });
});

describe("visual constraints", () => {
  it("uses no gradient anywhere in the authored CSS", () => {
    for (const text of [tokens, ...authored]) {
      assert.equal(/gradient/i.test(text), false, "gradients are not part of this design system");
    }
  });

  it("keeps one shadow and one radius scale", () => {
    for (const value of declarations(components, "border-radius")) {
      const px = /^(\d+)px$/.exec(value);
      if (px) assert.ok(Number(px[1]) <= 5, `border-radius: ${value} is larger than the 5px ceiling`);
      else if (!value.startsWith("var(--r-") && value !== "0") {
        assert.fail(`border-radius: ${value} is not a token, 0, or a hairline`);
      }
    }
    const shadows = declarations(components, "box-shadow").filter((value) => !value.startsWith("inset") && value !== "none");
    for (const value of shadows) assert.equal(value, "var(--shadow-1)", `unexpected shadow: ${value}`);
  });

  it("keeps uppercase for the grid headers and one eyebrow only", () => {
    const total = authored.reduce((sum, text) => sum + (text.match(/text-transform:\s*uppercase/g) ?? []).length, 0);
    assert.equal(total, 2);
  });

  it("never uses !important except to make the hidden attribute win", () => {
    for (const text of authored) {
      for (const line of text.split("\n").filter((row) => row.includes("!important"))) {
        assert.match(line, /display:\s*none !important/);
      }
    }
    assert.match(base, /\[hidden\]\s*\{\s*display:\s*none !important;?\s*\}/);
  });

  it("keeps every font size readable, with the grid headers as the only exception", () => {
    for (const text of authored) {
      for (const value of declarations(text, "font-size")) {
        if (value.startsWith("var(--fs-")) continue;
        const rem = /^([\d.]+)rem$/.exec(value);
        assert.ok(rem, `font-size: ${value} is not a token or a rem value`);
        assert.ok(Number(rem[1]) >= 0.8125 || value === "0.75rem", `font-size: ${value} is below the 13px floor`);
      }
    }
    // 12px is allowed in exactly two places: the column and the row header.
    const small = [...components.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .filter((match) => /font-size:\s*0\.75rem/.test(match[2]))
      .map((match) => match[1].trim());
    assert.equal(small.length, 2, `12px is used by ${small.join(" | ")}`);
    for (const selector of small) assert.match(selector, /^\.sheet-grid (thead|tbody) th$/);
  });

  it("declares the four vendored faces as same-origin swap", () => {
    const faces = [...base.matchAll(/@font-face\s*\{[^}]*\}/g)].map((match) => match[0]);
    assert.equal(faces.length, 4);
    for (const face of faces) {
      assert.match(face, /font-display:\s*swap/);
      assert.match(face, /src:\s*url\("\/assets\/fonts\/[\w-]+\.woff2"\)\s*format\("woff2"\)/);
      assert.match(face, /unicode-range:/);
    }
  });

  it("moves only when the reader has not asked for less", () => {
    // Smooth scrolling used to sit inside base.css's `html` rule with a `reduce` override beside it.
    // It is opt-in now like every other movement, so there is nothing left to override — and the
    // override is gone, which is why this asserts the positive instead of looking for it.
    const optIn = (text) => text.replace(/@media \(prefers-reduced-motion: no-preference\)[\s\S]*?\n\}/g, "");
    assert.match(base, /@media \(prefers-reduced-motion: no-preference\) \{[\s\S]*?scroll-behavior: smooth/);
    assert.equal(/scroll-behavior/.test(optIn(base)), false, "smooth scrolling still applies to everyone");
    const animated = [...components.matchAll(/@media \(prefers-reduced-motion: no-preference\)\s*\{/g)];
    assert.ok(animated.length >= 2, "component motion should live inside no-preference blocks");
    assert.equal(/^\s*(animation|transition):/m.test(optIn(components)), false);
  });

  it("has one focus treatment, applied through :focus-visible", () => {
    const outlines = authored.flatMap((text) => declarations(text, "outline"));
    assert.ok(outlines.length >= 1);
    for (const value of outlines) assert.equal(value, "2px solid var(--focus)");
    for (const text of authored) {
      assert.equal(/outline:\s*none/.test(text), false, "removing the ring is never allowed");
    }
    assert.match(base, /:focus-visible/);
  });

  it("gives the Next-only stylesheets the same ring", () => {
    // The auth pages and the flashcard deck ship their own CSS, outside `components.css` and so outside
    // the rule above: the deck's grade buttons wore a ring in the muted sand, which reads as no ring at
    // all on the surface behind them. Every outline in every stylesheet is the one focus token now.
    const app = ["auth.css", "flashcards/flashcards.css", "globals.css"].map((name) =>
      readFileSync(join(ROOT, "..", "app", name), "utf8"),
    );
    const outlines = app.flatMap((text) => declarations(text, "outline"));
    assert.ok(outlines.length >= 1, "the app stylesheets declare a focus ring");
    for (const value of outlines) assert.equal(value, "2px solid var(--focus)");
    for (const text of app) assert.equal(/outline:\s*none/.test(text), false);
  });

  it("guards the Next-only stylesheets' motion as well", () => {
    // `components.css` and `base.css` are checked above; the app stylesheets ship outside them, so a
    // skeleton pulse could start animating for a reader who asked for less and nothing would notice.
    const app = ["auth.css", "flashcards/flashcards.css", "globals.css"].map((name) =>
      readFileSync(join(ROOT, "..", "app", name), "utf8"),
    );
    for (const text of app) {
      const outside = text.replace(/@media \(prefers-reduced-motion: no-preference\)[\s\S]*?\n\}/g, "");
      assert.equal(
        /^\s*(animation|transition):/m.test(outside),
        false,
        "an animation in the app stylesheets applies to everyone",
      );
    }
  });

  it("defines every custom property it reads", () => {
    const defined = new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map((match) => match[1]));
    const used = new Set([...css.matchAll(/var\((--[\w-]+)/g)].map((match) => match[1]));
    const missing = [...used].filter((name) => !defined.has(name));
    assert.deepEqual(missing, [], `undefined custom properties: ${missing.join(", ")}`);
  });
});

describe("class coverage", () => {
  const cssClasses = new Set([...css.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((match) => match[1]));
  const htmlClasses = new Set(
    [...html.matchAll(/class="([^"]*)"/g)].flatMap((match) => match[1].split(/\s+/).filter(Boolean)),
  );

  it("styles every class the pages render", () => {
    // <body class="light lesson"> / "light track" are page hooks, not styled components.
    const pageHooks = new Set(["dashboard", "dashboard-page", "lesson", "track"]);
    const missing = [...htmlClasses].filter((name) => !cssClasses.has(name) && !pageHooks.has(name)).sort();
    assert.deepEqual(missing, [], `classes rendered but never styled: ${missing.join(", ")}`);
  });

  it("styles every class the client adds at runtime", () => {
    const clientOnly = [
      "badge-pill",
      "cell-correct",
      "cell-wrong",
      "dash-recent-item",
      "dash-recent-link",
      "dash-recent-title",
      "dash-when",
      "feedback-caret",
      "feedback-meta",
      "is-active",
      "is-done",
      "is-live",
      "link-btn-quiet",
      "next-cta",
      "paywall",
      "paywall-body",
      "paywall-error",
      "paywall-form",
      "paywall-input",
      "paywall-note",
      "paywall-title",
      "track-progress",
    ];
    const missing = clientOnly.filter((name) => !cssClasses.has(name));
    assert.deepEqual(missing, [], `client classes with no rule: ${missing.join(", ")}`);
  });

  it("styles every class the Next.js error boundary renders", () => {
    // `app/error.js` cannot reuse the server fragments, so it writes its own chrome: prove it only
    // reaches for classes that exist, or the boundary would look broken exactly when it is needed.
    const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "app/error.js"), "utf8");
    const rendered = [...source.matchAll(/className="([^"]*)"/g)].flatMap((match) =>
      match[1].split(/\s+/).filter(Boolean),
    );
    assert.ok(rendered.length >= 6, "the error boundary no longer renders its own chrome");
    const missing = [...new Set(rendered)].filter((name) => !cssClasses.has(name)).sort();
    assert.deepEqual(missing, [], `error boundary classes with no rule: ${missing.join(", ")}`);
  });

  it("loads vendor palette, then tokens, then base, then components", () => {
    const order = sources.map((source) => source.split("/").slice(-2).join("/"));
    const last = order.slice(-3);
    assert.deepEqual(last, ["styles/tokens.css", "styles/base.css", "styles/components.css"]);
    assert.ok(order.slice(0, -3).every((name) => name.startsWith("radix/") || name.startsWith("open-props/")));
  });
});
