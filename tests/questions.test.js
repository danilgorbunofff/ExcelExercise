/**
 * The questions fold, checked once for every page that uses it.
 *
 * Five pages answer questions; before this module each one wrote its own `<h3>`+`<p>` stack, so a
 * change to how the site folds content had to be made five times and was made zero times. What is
 * pinned here is the behaviour a reader depends on rather than the markup as such: the answer exists
 * before the fold is opened, the question is still a heading, more than one can be open, and the
 * element that opens it is the one the browser already knows how to work without a script.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { renderQuestions } from "../legacy/src/site/questions.mjs";

const render = (questions, extra = {}) => renderQuestions({ questions, ...extra });

describe("a questions fold", () => {
  const html = render([
    { question: "Are the exercises free?", answer: "Ten of them are." },
    { question: "Do I need Excel installed?", answers: ["No.", "The sheet is on the page."] },
  ]);

  it("folds each question into its own details element", () => {
    assert.equal((html.match(/<details class="faq">/g) ?? []).length, 2);
    assert.equal((html.match(/<summary>/g) ?? []).length, 2);
  });

  it("keeps the question a heading inside the summary", () => {
    // The pages relied on their questions being <h3>s for the outline; the fold must not cost that.
    assert.match(html, /<summary><h3>Are the exercises free\?<\/h3><\/summary>/);
  });

  it("lets a reader open every one of them at once", () => {
    // `name` turns `<details>` into a single-open accordion, which hides an answer being read.
    assert.doesNotMatch(html, /\sname="/);
  });

  it("keeps every answer in the HTML while the fold is closed", () => {
    // The point of the native element: no script, so the text is there for find-in-page and for
    // whatever reads the page without opening it.
    assert.match(html, /<p>Ten of them are\.<\/p>/);
    assert.match(html, /<p>No\.<\/p>\s*<p>The sheet is on the page\.<\/p>/);
  });

  it("names its section once, so the region has an accessible name", () => {
    assert.match(html, /<section class="qa-block" aria-labelledby="questions-heading">/);
    assert.match(html, /<h2 id="questions-heading">Common questions<\/h2>/);
    const custom = render([{ question: "Q?", answer: "A." }], { id: "faq-heading", heading: "Before you pay" });
    assert.match(custom, /aria-labelledby="faq-heading"/);
    assert.match(custom, /<h2 id="faq-heading">Before you pay<\/h2>/);
  });

  it("can end on a closing line inside the same section", () => {
    const withFooter = render([{ question: "Q?", answer: "A." }], {
      footer: '        <p class="how-note"><a href="mailto:a@b.c">a@b.c</a></p>',
    });
    assert.match(withFooter, /<\/div>\n\s*<p class="how-note">[\s\S]*<\/section>$/);
  });

  it("passes rendered HTML through untouched, so one answer can carry a link", () => {
    // Escaping is the writer's job, because a link is markup and the page owns the address.
    const linked = render([{ question: "Q?", answer: 'Read <a href="/about">the about page</a>.' }]);
    assert.match(linked, /<a href="\/about">the about page<\/a>/);
  });
});
