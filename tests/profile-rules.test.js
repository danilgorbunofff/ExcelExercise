/**
 * The profile rules, imported rather than restated: `lib/auth/profile.js` is what the server action
 * and the form both run, so a test that retyped the regex would only prove the test still agrees with
 * itself.
 *
 * The points worth pinning are the ones a permissive check would let through: a username that reads
 * as staff, a LinkedIn link pointing anywhere else, and a "profile is incomplete" decision that fires
 * on a failed read instead of on an empty name.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  NAME_MAX,
  ONBOARDING_PATH,
  USERNAME_MAX,
  afterSignIn,
  needsOnboarding,
  parseDisplayName,
  parseLinkedin,
  parseProfile,
  parseUsername,
} from "../lib/auth/profile.js";

describe("parseUsername", () => {
  it("accepts a plain handle and lowercases it", () => {
    assert.deepEqual(parseUsername("Alice.Probe_1"), { ok: true, value: "alice.probe_1" });
    assert.deepEqual(parseUsername("  bob  "), { ok: true, value: "bob" });
  });

  it("accepts dots, underscores and hyphens between letters or digits", () => {
    for (const handle of ["a.b", "a_b", "a-b", "abc123", "x.y-z_9"]) {
      assert.equal(parseUsername(handle).ok, true, handle);
    }
  });

  it("refuses an empty handle", () => {
    for (const value of ["", "   ", null, undefined, 42]) {
      const result = parseUsername(value);
      assert.equal(result.ok, false, String(value));
      assert.match(result.error, /username/i);
    }
  });

  it("enforces the length bounds", () => {
    assert.equal(parseUsername("ab").ok, false);
    assert.equal(parseUsername("abc").ok, true);
    assert.equal(parseUsername("a".repeat(USERNAME_MAX)).ok, true);
    const tooLong = parseUsername("a".repeat(USERNAME_MAX + 1));
    assert.equal(tooLong.ok, false);
    assert.match(tooLong.error, new RegExp(`at most ${USERNAME_MAX}`));
  });

  it("refuses a handle that starts or ends with punctuation", () => {
    for (const handle of [".alice", "alice.", "-alice", "alice-", "_alice", "alice_"]) {
      assert.equal(parseUsername(handle).ok, false, handle);
    }
  });

  it("refuses spaces and other punctuation", () => {
    for (const handle of ["alice probe", "alice@example.com", "alice/probe", "alicé"]) {
      assert.equal(parseUsername(handle).ok, false, handle);
    }
  });

  it("refuses handles that read as the deployment rather than a learner", () => {
    for (const handle of ["admin", "SUPPORT", " Login ", "signup", "account", "learn", "api"]) {
      const result = parseUsername(handle);
      assert.equal(result.ok, false, handle);
      assert.match(result.error, /reserved/);
    }
  });
});

describe("parseDisplayName", () => {
  it("treats an empty name as a blank rather than an error", () => {
    for (const value of ["", "   ", null, undefined]) {
      assert.deepEqual(parseDisplayName(value), { ok: true, value: null });
    }
  });

  it("collapses whitespace and trims", () => {
    assert.deepEqual(parseDisplayName("  Alice   van  Probe "), { ok: true, value: "Alice van Probe" });
  });

  it("caps the length", () => {
    assert.equal(parseDisplayName("a".repeat(NAME_MAX)).ok, true);
    assert.equal(parseDisplayName("a".repeat(NAME_MAX + 1)).ok, false);
  });
});

describe("parseLinkedin", () => {
  it("treats an empty value as no link", () => {
    for (const value of ["", "   ", null, undefined]) {
      assert.deepEqual(parseLinkedin(value), { ok: true, value: null });
    }
  });

  it("normalises a bare host, a missing scheme and a tracking query", () => {
    for (const value of [
      "linkedin.com/in/alice",
      "http://linkedin.com/in/alice",
      "https://www.linkedin.com/in/alice?trk=public_profile",
      "  https://www.linkedin.com/in/alice/  ",
    ]) {
      assert.deepEqual(parseLinkedin(value), { ok: true, value: "https://www.linkedin.com/in/alice" }, value);
    }
  });

  it("refuses any other host", () => {
    for (const value of [
      "example.com/in/alice",
      "https://linkedin.com.evil.example/in/alice",
      "https://www.linkedin.co/in/alice",
      "https://notlinkedin.com/in/alice",
    ]) {
      const result = parseLinkedin(value);
      assert.equal(result.ok, false, value);
      assert.match(result.error, /linkedin\.com/);
    }
  });

  it("refuses a scheme that is not http(s)", () => {
    for (const value of ["javascript:alert(1)", "data:text/html,x", "ftp://linkedin.com/in/alice"]) {
      const result = parseLinkedin(value);
      assert.equal(result.ok, false, value);
      assert.match(result.error, /https/);
    }
  });

  it("refuses the front page, which is not a profile", () => {
    for (const value of ["linkedin.com", "https://www.linkedin.com/", "https://www.linkedin.com"]) {
      const result = parseLinkedin(value);
      assert.equal(result.ok, false, value);
      assert.match(result.error, /profile/);
    }
  });
});

describe("parseProfile", () => {
  it("hands back the three columns the table takes", () => {
    assert.deepEqual(
      parseProfile({
        username: " Alice.Probe ",
        display_name: " Alice ",
        linkedin_url: "linkedin.com/in/alice",
      }),
      {
        ok: true,
        value: {
          username: "alice.probe",
          display_name: "Alice",
          linkedin_url: "https://www.linkedin.com/in/alice",
        },
      },
    );
  });

  it("turns the optional blanks into nulls, not empty strings", () => {
    assert.deepEqual(parseProfile({ username: "bob" }), {
      ok: true,
      value: { username: "bob", display_name: null, linkedin_url: null },
    });
  });

  it("reports one error per bad field at once", () => {
    const result = parseProfile({ username: "!!", display_name: "a".repeat(NAME_MAX + 1), linkedin_url: "x.com" });
    assert.equal(result.ok, false);
    assert.deepEqual(Object.keys(result.errors).sort(), ["display_name", "linkedin_url", "username"]);
  });

  it("does not invent a field for a valid one", () => {
    const result = parseProfile({ username: "bob", linkedin_url: "nope" });
    assert.equal(result.ok, false);
    assert.deepEqual(Object.keys(result.errors), ["linkedin_url"]);
  });
});

describe("needsOnboarding", () => {
  it("is true only when the row exists and the name is blank", () => {
    assert.equal(needsOnboarding({ username: "bob", display_name: "" }), true);
    assert.equal(needsOnboarding({ username: "bob", display_name: "   " }), true);
    assert.equal(needsOnboarding({ username: "bob", display_name: null }), true);
    assert.equal(needsOnboarding({ username: "bob", display_name: "Bob" }), false);
  });

  it("is false when the profile could not be read", () => {
    // A failed read must not force a page: the learner cannot fix a row they cannot see, and a
    // sign-in that always redirects would be a loop with no way out.
    assert.equal(needsOnboarding(null), false);
    assert.equal(needsOnboarding(undefined), false);
    assert.equal(needsOnboarding("bob"), false);
  });
});

describe("afterSignIn", () => {
  it("sends a nameless account to the profile step", () => {
    assert.equal(afterSignIn("/learn", { display_name: "" }), ONBOARDING_PATH);
    assert.equal(afterSignIn(null, { display_name: null }), ONBOARDING_PATH);
  });

  it("leaves an account with a name alone", () => {
    assert.equal(afterSignIn("/learn", { display_name: "Alice" }), "/learn");
    assert.equal(afterSignIn(null, { display_name: "Alice" }), "/learn");
  });

  it("never overrides a page the learner asked for", () => {
    assert.equal(afterSignIn("/keys", { display_name: "" }), "/keys");
    assert.equal(afterSignIn("/account", { display_name: "" }), "/account");
  });

  it("falls back to the default when no next was given and the profile is unreadable", () => {
    assert.equal(afterSignIn(null, null), "/learn");
    assert.equal(afterSignIn("", null), "/learn");
  });
});
