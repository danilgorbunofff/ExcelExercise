/**
 * The questions a page answers, as folds.
 *
 * Every page that answers questions answered them the same wrong way: an `<h3>` and a paragraph, in
 * flow, so a reader who wanted one answer read all of them and a reader scanning the page saw a wall
 * of prose where the last screen should be. They are now `<details>` folds.
 *
 * The fold is native, and that is the whole design:
 *
 * - No script. The answer is in the HTML whether the fold is open or not, so it survives find-in-page,
 *   a broken bundle, and whatever a search engine chooses to index. GOV.UK's Details component and the
 *   W3C APG disclosure pattern both describe exactly this element and no other.
 * - Several can be open at once. No `name` attribute ties them together: NN/g's accordion guidance is
 *   explicit that a reader who opens the refund answer must not lose the answer they were reading.
 * - The question stays an `<h3>`, inside `<summary>`. The `summary` content model allows heading
 *   content, so the outline of these pages is unchanged and the questions remain headings a screen
 *   reader can jump between, not just summary text. `<summary>` already carries the button role and
 *   the expanded state, so nothing here writes `role` or `aria-expanded` by hand.
 *
 * Both the question and the answer arrive as HTML. Several answers link to another page, so the writer
 * escapes the parts that came from content (`esc`) and this module concatenates what it is given.
 */

/** One fold: a heading-shaped summary over one or more paragraphs. */
function renderQuestion({ question, answer, answers }) {
  const paragraphs = (answers ?? [answer]).map((text) => `            <p>${text}</p>`).join("\n");
  return `        <details class="faq">
          <summary><h3>${question}</h3></summary>
${paragraphs}
        </details>`;
}

/**
 * A whole questions section: the heading the page already had, the folds, and an optional closing line
 * (the price page ends on "ask a person" rather than on its own stub section for it).
 */
export function renderQuestions({ id = "questions-heading", heading = "Common questions", questions, footer = "" }) {
  const folds = questions.map(renderQuestion).join("\n");
  return `      <section class="qa-block" aria-labelledby="${id}">
        <h2 id="${id}">${heading}</h2>
        <div class="qa">
${folds}
        </div>${footer ? `\n${footer}` : ""}
      </section>`;
}
