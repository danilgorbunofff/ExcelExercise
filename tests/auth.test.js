/**
 * The auth rules that can be wrong without anyone noticing: where `?next=` is allowed to send a
 * browser, whether the deployment is configured, what a password has to be, and which server error
 * text is safe to show. All four are pure functions, so this file imports them rather than
 * re-describing them — a copy of this logic in a test would pass while the app drifted.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { KEY_VARIABLE, NOT_CONFIGURED, URL_VARIABLE, accountsEnabled, authConfig } from "../lib/auth/config.js";
import { MIN_PASSWORD, validateCredentials } from "../lib/auth/credentials.js";
import { friendly } from "../lib/auth/errors.js";
import { DEFAULT_NEXT, loginUrl, safeNext } from "../lib/auth/redirect.js";

describe("safeNext", () => {
  it("keeps a same-origin path, query and fragment", () => {
    assert.equal(safeNext("/learn/excel/01-sum-basics?from=rail#top"), "/learn/excel/01-sum-basics?from=rail#top");
    assert.equal(safeNext("/"), "/");
  });

  it("falls back to the dashboard for anything else", () => {
    for (const bad of [
      "//evil.com",
      "/\\evil.com",
      "\\\\evil.com",
      "https://evil.com",
      "javascript:alert(1)",
      "learn/excel/01",
      " /learn",
      "",
      "   ",
    ]) {
      assert.equal(safeNext(bad), DEFAULT_NEXT, `${JSON.stringify(bad)} must not be followed`);
    }
  });

  it("refuses control characters rather than stripping them", () => {
    for (const bad of ["/learn\n", "/learn\r\nSet-Cookie: x=1", "/learn\u0000", "/learn\u007f"]) {
      assert.equal(safeNext(bad), DEFAULT_NEXT, `${JSON.stringify(bad)} must not be followed`);
    }
  });

  it("refuses values that are not strings", () => {
    for (const bad of [null, undefined, 42, {}, ["/learn"]]) assert.equal(safeNext(bad), DEFAULT_NEXT);
  });

  it("honours a custom fallback", () => {
    assert.equal(safeNext("//evil.com", "/elsewhere"), "/elsewhere");
  });
});

describe("loginUrl", () => {
  it("carries a safe target through the query string", () => {
    assert.equal(loginUrl("/account"), "/login?next=%2Faccount");
  });

  it("drops an unsafe target instead of passing it on", () => {
    assert.equal(loginUrl("//evil.com"), "/login");
    assert.equal(loginUrl(null), "/login");
  });

  it("keeps extra parameters and skips the empty ones", () => {
    assert.equal(loginUrl("/account", { plan: "annual", empty: "", none: null }), "/login?next=%2Faccount&plan=annual");
  });
});

describe("authConfig", () => {
  const env = { [URL_VARIABLE]: "http://127.0.0.1:54351", [KEY_VARIABLE]: "public-anon-key" };

  it("is disabled, with a reason naming both variables, when the environment is empty", () => {
    const config = authConfig({});
    assert.equal(config.enabled, false);
    assert.equal(config.url, null);
    assert.equal(config.reason, NOT_CONFIGURED);
    assert.match(config.reason, new RegExp(URL_VARIABLE));
    assert.match(config.reason, new RegExp(KEY_VARIABLE));
  });

  it("is disabled when only one of the two is set", () => {
    assert.equal(authConfig({ [URL_VARIABLE]: "http://127.0.0.1:54351" }).enabled, false);
    assert.equal(authConfig({ [KEY_VARIABLE]: "public-anon-key" }).enabled, false);
  });

  it("accepts a project URL and strips a trailing slash", () => {
    const config = authConfig({ ...env, [URL_VARIABLE]: "https://abc.supabase.co/" });
    assert.equal(config.enabled, true);
    assert.equal(config.url, "https://abc.supabase.co", "a doubled slash would 404 at the proxy");
    assert.equal(config.anonKey, "public-anon-key");
  });

  it("refuses a value that is not an http(s) URL", () => {
    const notAUrl = authConfig({ ...env, [URL_VARIABLE]: "abc.supabase.co" });
    assert.equal(notAUrl.enabled, false);
    assert.match(notAUrl.reason, /not a URL/);

    const wrongScheme = authConfig({ ...env, [URL_VARIABLE]: "ftp://abc.supabase.co" });
    assert.equal(wrongScheme.enabled, false);
    assert.match(wrongScheme.reason, /must be http or https/);
  });

  it("treats whitespace as unset, and reports the boolean for callers that only need it", () => {
    assert.equal(authConfig({ [URL_VARIABLE]: "  ", [KEY_VARIABLE]: "  " }).enabled, false);
    assert.equal(accountsEnabled(env), true);
    assert.equal(accountsEnabled({}), false);
  });
});

describe("validateCredentials", () => {
  const ok = { email: "alice@example.com", password: "password123" };

  it("accepts a plausible pair", () => {
    assert.deepEqual(validateCredentials(ok), { ok: true, errors: {} });
  });

  it("trims the address before judging it", () => {
    assert.equal(validateCredentials({ ...ok, email: "  alice@example.com  " }).ok, true);
  });

  it("rejects a missing or malformed address", () => {
    assert.equal(validateCredentials({ ...ok, email: "" }).errors.email, "Enter your email address.");
    for (const bad of ["alice", "alice@", "alice@example", "@example.com", "al ice@example.com"]) {
      assert.equal(validateCredentials({ ...ok, email: bad }).errors.email, "That does not look like an email address.");
    }
  });

  it("holds the password to 8 to 72 characters", () => {
    assert.equal(MIN_PASSWORD, 8);
    assert.equal(validateCredentials({ ...ok, password: "a".repeat(7) }).errors.password, "Use at least 8 characters.");
    assert.equal(validateCredentials({ ...ok, password: "a".repeat(8) }).ok, true);
    assert.equal(validateCredentials({ ...ok, password: "a".repeat(72) }).ok, true);
    assert.equal(
      validateCredentials({ ...ok, password: "a".repeat(73) }).errors.password,
      "Use at most 72 characters.",
      "bcrypt ignores bytes past 72, so a longer password would not mean what the form says",
    );
  });

  it("skips the password rule for the password-less flows", () => {
    assert.equal(validateCredentials({ email: ok.email, password: "" }, { requirePassword: false }).ok, true);
    assert.equal(validateCredentials({ email: "nope" }, { requirePassword: false }).ok, false);
  });

  it("reports both problems at once", () => {
    const { ok: good, errors } = validateCredentials({ email: "", password: "" });
    assert.equal(good, false);
    assert.deepEqual(Object.keys(errors).sort(), ["email", "password"]);
  });
});

describe("friendly", () => {
  it("rewrites the failures a visitor can act on", () => {
    assert.equal(friendly("Invalid login credentials"), "That email and password do not match an account.");
    assert.equal(friendly("Email not confirmed"), "Confirm your email first — the link is in your inbox.");
    assert.equal(friendly("User already registered"), "That email already has an account. Sign in instead.");
    assert.match(friendly("Password should be at least 6 characters."), /at least 8/);
  });

  it("passes an unmapped message through, so a misconfiguration stays readable", () => {
    assert.equal(friendly("Error sending confirmation email"), "Error sending confirmation email");
  });

  it("says something when there is no message at all", () => {
    assert.equal(friendly(""), "That did not work. Try again.");
    assert.equal(friendly(undefined), "That did not work. Try again.");
    assert.equal(friendly(null), "That did not work. Try again.");
  });
});
