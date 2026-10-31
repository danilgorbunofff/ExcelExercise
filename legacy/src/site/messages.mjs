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
  "chrome.badge.free": "Free · no signup",
  "chrome.loading.form": "Loading the form…",

  "chrome.footer.claim": "{name} grades formulas in the browser. Nothing you type is sent anywhere.",
  "chrome.footer.privacy": "Privacy",
  "chrome.footer.terms": "Terms",
  "chrome.footer.feedback": "Send feedback",

  "chrome.feedback.title": "How is this going?",
  "chrome.feedback.legend": "Pick the one that fits",
  "chrome.feedback.stuck": "I am stuck",
  "chrome.feedback.progress": "Getting there",
  "chrome.feedback.clicked": "It clicked",
  "chrome.feedback.text": "Anything to add? Optional.",
  "chrome.feedback.note": "Nothing is sent yet: your note is kept in this browser, and that is all.",
  "chrome.feedback.send": "Send",
  "chrome.feedback.cancel": "Cancel",
  "chrome.feedback.close": "Close",

  "chrome.ways.home": "More ways in",
  "chrome.ways.tools": "Your tools",
  "chrome.ways.projects": "Guided projects",
  "chrome.ways.flashcards": "Flashcards",
  "chrome.ways.daily": "Daily challenge",
  "chrome.ways.board": "Today's board",
  "chrome.ways.certificate": "Certificate",
  "chrome.ways.account": "Your account",
  "chrome.ways.pricing": "Pricing",
  "chrome.ways.exercises": "All Excel exercises",
  "chrome.ways.functions": "Excel functions",

  "auth.login.title": "Sign in",
  "auth.login.meta": "Sign in to keep your Excel drill progress across devices.",
  "auth.login.lede": "An account keeps your progress on every device. The drills themselves stay free.",
  "auth.login.submit": "Sign in",
  "auth.login.email": "Email",
  "auth.login.password": "Password",
  "auth.login.magic.label": "Email me a sign-in link instead",
  "auth.login.magic.submit": "Send link",
  "auth.login.signup": "Create an account",
  "auth.login.forgot": "Forgot your password?",

  "auth.signup.title": "Create an account",
  "auth.signup.meta": "Create an account to keep your Excel drill progress across devices.",
  "auth.signup.lede": "One account, every device. Your unsolved drills stay free either way.",
  "auth.signup.submit": "Create account",
  "auth.signup.email": "Email",
  "auth.signup.password": "Password",
  "auth.signup.name": "Display name (optional)",
  "auth.signup.haveAccount": "I already have an account",

  "auth.reset.title": "Reset your password",
  "auth.reset.meta": "Request a password reset link for your Excel drill account.",
  "auth.reset.lede": "We email you a link that signs you in once, so you can set a new password.",
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
