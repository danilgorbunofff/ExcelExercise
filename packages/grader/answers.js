/**
 * Grading a screen whose answer is typed text rather than a formula. A picture screen shows the
 * learner a sheet and asks what it says, so the accepted answers are a list of spellings of one
 * fact and grading is a lookup, not an evaluation.
 *
 * The normaliser is exported because the content gate has to agree with the grader: without it two
 * accepted answers could normalise to the same string and a lesson would grade differently than it
 * lints. Keeping it here, beside `grade.js`, also means the browser ships one grader, not two.
 */

const ZERO_WIDTH = /[\u200B-\u200D\u2060\uFEFF]/g;

/**
 * One spelling of an answer. Case, spacing and the absolute markers are presentation: a learner who
 * copies `$B$2:$B$6` out of the bar has named the same range as one who types `b2:b6`.
 */
export function normaliseAnswer(raw) {
  return String(raw ?? "")
    .replace(ZERO_WIDTH, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\$/g, "");
}

/**
 * The verdict for a typed answer, in the shape `grade()` returns, so the player's score loop,
 * its attempt counter and its hint panel are the same code for both screen types.
 */
export function gradeAnswer(screen, raw) {
  const answers = Array.isArray(screen?.answers) ? screen.answers : [];
  const said = normaliseAnswer(raw);
  const ok = said !== "" && answers.some((candidate) => normaliseAnswer(candidate) === said);
  const expected = answers[0] ?? "";

  if (ok) {
    return { ok: true, rule: "correct", message: "Correct.", hint: "", value: said, expected, code: null, position: null };
  }
  return {
    ok: false,
    rule: "value",
    message: "That is not what the image shows.",
    hint: screen?.hints?.value ?? "",
    // Nothing echoes the expected answer: a wrong attempt must not print the answer it wants.
    value: said,
    expected: null,
    code: null,
    position: null,
  };
}
