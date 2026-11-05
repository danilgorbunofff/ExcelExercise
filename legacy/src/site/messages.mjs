/**
 * Every string the site furniture says, in one place, so a second language is a second object rather
 * than a second pass over fourteen templates.
 *
 * Three rules, and `tests/messages.test.js` holds all three:
 *
 * 1. A key is dotted lowerCamelCase and names a *position*, not a wording: `chrome.footer.privacy`, not
 *    `privacy`. The English may change; the key is what the template asks for.
 * 2. A value is plain text. No HTML, no entities, no trimming to be done by the caller: the template
 *    does the escaping where escaping belongs, because only the template knows whether it sits in an
 *    attribute or between tags.
 * 3. `{name}` marks a hole and nothing else does. A message that needs a value it was not given throws
 *    in the render rather than printing `{name}` onto a page.
 *
 * Today there is one language, so `t` is not selected by locale and there is no negotiation: the
 * catalogue *is* English. What this buys now is that the strings are enumerable — a copy review reads
 * one file instead of grepping templates — and that the day a second language exists, `t` gains a
 * second argument and the call sites do not move.
 */

export const catalogue = Object.freeze({
  "chrome.skip": "Skip to the {what}",
  "chrome.header.account": "Account",
  "chrome.header.search": "Search",
  "chrome.loading.form": "Loading the form",

  "chrome.footer.copyright": "© {year} {name}",
  "chrome.footer.privacy": "Privacy",
  "chrome.footer.terms": "Terms",
  "chrome.footer.feedback": "Send feedback",
  "chrome.footer.write": "Email us",

  "chrome.feedback.title": "How is this going?",
  "chrome.feedback.legend": "How easy was this page to follow?",
  "chrome.feedback.stuck": "Hard to follow",
  "chrome.feedback.progress": "Clear in parts",
  "chrome.feedback.clicked": "Easy to follow",
  "chrome.feedback.text": "Anything to add? Optional.",
  "chrome.feedback.note": "Your note goes to a person, with this page and your account if you are signed in.",
  "chrome.feedback.send": "Send",
  "chrome.feedback.cancel": "Cancel",
  "chrome.feedback.close": "Close",

  "chrome.menu.toggle": "Menu",
  "chrome.menu.close": "Close",

  "chrome.ways.start": "Start free",
  "chrome.ways.projects": "Projects",
  "chrome.ways.flashcards": "Flashcards",
  "chrome.ways.daily": "Daily challenge",
  "chrome.ways.board": "Leaderboard",
  "chrome.ways.certificate": "Certificate",
  "chrome.ways.account": "Account",
  "chrome.ways.pricing": "Pricing",
  "chrome.ways.exercises": "All exercises",
  "chrome.ways.functions": "Functions",
  "chrome.ways.shortcuts": "Shortcuts",

  "auth.login.title": "Sign in",
  "auth.login.meta": "Sign in to keep your exercise progress on every device you use.",
  "auth.login.lede": "Sign in to pick up the track where you stopped, on any device.",
  "auth.login.submit": "Sign in",
  "auth.login.email": "Email",
  "auth.login.password": "Password",
  "auth.login.magic.label": "Email me a sign-in link instead",
  "auth.login.magic.submit": "Send link",
  "auth.login.signup": "Create an account",
  "auth.login.forgot": "Forgot your password?",

  "auth.signup.title": "Create an account",
  "auth.signup.meta": "Create an account to keep your exercise progress on every device.",
  "auth.signup.lede": "An account keeps your progress on any device. The free exercises stay free either way.",
  "auth.signup.submit": "Create account",
  "auth.signup.email": "Email",
  "auth.signup.password": "Password",
  "auth.signup.name": "Display name (optional)",
  "auth.signup.haveAccount": "I already have an account",

  "auth.reset.title": "Reset your password",
  "auth.reset.meta": "Request a password reset link for your Excel exercise account.",
  "auth.reset.lede": "We email a link that signs you in once, so you can choose a new password.",
  "auth.reset.email": "Email",
  "auth.reset.submit": "Send reset link",
  "auth.reset.back": "Back to sign in",

  "certificate.print": "Print the certificate",
  "certificate.printRecord": "Print this record",
});

const HOLE = /\{(\w+)\}/g;

/**
 * The message for `key`, with `{name}` holes filled from `vars`.
 *
 * Values are interpolated as given — the caller escapes if the target is markup. Throwing on a missing
 * key or a missing value is deliberate: a blank label or a literal `{what}` on a page is a bug that a
 * test should catch at build time, not a graceful degradation.
 */
export function t(key, vars = {}) {
  const message = catalogue[key];
  if (message === undefined) throw new Error(`messages: no entry for "${key}"`);
  return message.replace(HOLE, (_hole, name) => {
    if (!Object.hasOwn(vars, name)) throw new Error(`messages: "${key}" needs {${name}}`);
    return String(vars[name]);
  });
}

/** Every key the catalogue defines, sorted. Used by the test that finds keys nothing asks for. */
export const messageKeys = Object.keys(catalogue).sort();
