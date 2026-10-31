/**
 * The certificate's own rules, without a database or a browser.
 *
 * Four things here decide what a stranger sees when they hold a piece of paper: the credential id (does it
 * exist, can it be typed), eligibility (did this learner earn it), the day span printed on it, and the
 * name (is it the one they meant, and is it even a name).
 *
 * The credential id is the only one with a distribution: 80 random bits over a 32-symbol alphabet, and the
 * ways that goes wrong are dull and specific — an off-by-one that never emits `X`, a truncation that
 * ignores the last two bytes of entropy, a modulo that biases the first four symbols. So it is checked by
 * drawing thousands and looking at the alphabet rather than by asserting on one fixed output.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ALPHABET,
  CREDENTIAL_LENGTH,
  credentialId,
  isCredentialId,
  normaliseCredentialId,
} from "../lib/certificate/credential.js";
import {
  NAME_MAX,
  NAME_MIN,
  certificateUrl,
  checkName,
  checkNameConfirmation,
  daysTaken,
  eligibility,
  formatIssued,
  linkedInUrl,
  requiredLessonIds,
} from "../lib/certificate/eligibility.js";

const DAY = 86_400_000;
const START = Date.parse("2026-01-05T09:00:00.000Z");

/** A finished track: `n` ids, each with a row. */
function finished(ids, { spread = 0 } = {}) {
  return ids.map((id, at) => ({
    lesson_id: id,
    status: "complete",
    completed_at: new Date(START + Math.round((spread * at) / Math.max(ids.length - 1, 1)) * DAY).toISOString(),
  }));
}

describe("credential ids", () => {
  it("are sixteen symbols of the Crockford alphabet", () => {
    for (let draw = 0; draw < 500; draw += 1) {
      const id = credentialId();
      assert.equal(id.length, CREDENTIAL_LENGTH);
      for (const symbol of id) assert.ok(ALPHABET.includes(symbol), `${id} contains ${symbol}`);
      assert.ok(isCredentialId(id));
    }
  });

  it("never emit I, L, O or U", () => {
    assert.ok(!/[ILOU]/.test(ALPHABET));
    for (let draw = 0; draw < 2000; draw += 1) assert.ok(!/[ILOU]/.test(credentialId()));
  });

  it("reach every one of the 32 symbols across a few thousand draws", () => {
    const seen = new Set();
    for (let draw = 0; draw < 3000; draw += 1) for (const symbol of credentialId()) seen.add(symbol);
    assert.equal(seen.size, 32);
  });

  it("are not one id repeated, and none of them collide", () => {
    const seen = new Set();
    for (let draw = 0; draw < 5000; draw += 1) seen.add(credentialId());
    assert.equal(seen.size, 5000);
  });

  it("use every bit of the ten bytes they are given", () => {
    // The last byte matters: a reader that stops at 75 bits would return the same id for 0x00…ff and
    // 0x00…00. All-zero bytes give the lowest id, all-ones the highest, and they differ everywhere.
    const low = credentialId(() => Buffer.alloc(10, 0));
    const high = credentialId(() => Buffer.alloc(10, 0xff));
    assert.equal(low, "0".repeat(16));
    assert.equal(high, "Z".repeat(16));
    // 80 bits over 16 symbols divides evenly, so the last byte lands whole in the last symbol.
    const flipped = credentialId(() => Buffer.from([0, 0, 0, 0, 0, 0, 0, 0, 0, 1]));
    assert.notEqual(flipped, low);
    assert.equal(flipped, `${"0".repeat(15)}1`);
  });

  it("reject a source that cannot supply ten bytes", () => {
    assert.throws(() => credentialId(() => Buffer.alloc(4)), TypeError);
  });

  it("accept only the shape, upper- or lower-case, trimmed", () => {
    assert.ok(isCredentialId("7K3M9QXZ2HV0RDNC"));
    assert.ok(isCredentialId("  7k3m9qxz2hv0rdnc "));
    assert.ok(!isCredentialId("7K3M9QXZ2HV0RDN"), "fifteen is not sixteen");
    assert.ok(!isCredentialId("7K3M9QXZ2HV0RDNCX"), "seventeen is not sixteen");
    assert.ok(!isCredentialId("7K3M9QXZ2HV0RDNI"), "I is not in the alphabet");
    assert.ok(!isCredentialId("7K3M9QXZ2HV0RDN-"), "no punctuation");
    assert.ok(!isCredentialId(""), "an empty string is not a credential");
    assert.ok(!isCredentialId(null));
  });

  it("normalise to upper case without punctuation", () => {
    assert.equal(normaliseCredentialId(" 7k3m9qxz2hv0rdnc "), "7K3M9QXZ2HV0RDNC");
    assert.equal(normaliseCredentialId(undefined), "");
  });
});

describe("requiredLessonIds", () => {
  it("is the track's lesson ids in catalog order", () => {
    const track = { lessons: [{ id: "01-a" }, { id: "02-b" }, { nope: true }, { id: "" }, { id: "03-c" }] };
    assert.deepEqual(requiredLessonIds(track), ["01-a", "02-b", "03-c"]);
  });

  it("is empty when there is no track, which nobody can be eligible for", () => {
    assert.deepEqual(requiredLessonIds(undefined), []);
    assert.equal(eligibility([], requiredLessonIds(undefined)).eligible, false);
  });
});

describe("eligibility", () => {
  const required = ["01-a", "02-b", "03-c"];

  it("needs every lesson, in any order", () => {
    assert.equal(eligibility(finished(["03-c", "01-a", "02-b"]), required).eligible, true);
  });

  it("counts a partial track and names what is missing", () => {
    const state = eligibility(finished(["01-a"]), required);
    assert.deepEqual(state, { total: 3, finished: 1, missing: ["02-b", "03-c"], eligible: false });
  });

  it("does not count a lesson that is only in progress", () => {
    const rows = [{ lesson_id: "01-a", status: "in_progress" }, ...finished(["02-b", "03-c"])];
    const state = eligibility(rows, required);
    assert.equal(state.finished, 2);
    assert.deepEqual(state.missing, ["01-a"]);
  });

  it("ignores progress in another track, because the required list is the filter", () => {
    const rows = [...finished(["01-a", "02-b", "03-c"]), { lesson_id: "sql-01", status: "complete" }];
    assert.equal(eligibility(rows, required).finished, 3);
    assert.equal(eligibility(rows, required).eligible, true);
  });

  it("is not eligible for an empty requirement", () => {
    assert.equal(eligibility(finished(required), []).eligible, false);
  });

  it("survives a missing progress array", () => {
    assert.deepEqual(eligibility(undefined, required), { total: 3, finished: 0, missing: required, eligible: false });
  });
});

describe("daysTaken", () => {
  const required = ["01-a", "02-b", "03-c"];

  it("is the span from the first finished lesson to the last", () => {
    const rows = [
      { lesson_id: "01-a", status: "complete", completed_at: new Date(START).toISOString() },
      { lesson_id: "03-c", status: "complete", completed_at: new Date(START + 6 * DAY + 3_600_000).toISOString() },
      { lesson_id: "02-b", status: "complete", completed_at: new Date(START + 2 * DAY).toISOString() },
    ];
    assert.equal(daysTaken(rows, required), 6);
  });

  it("is zero for a track finished the same day", () => {
    const rows = finished(required, { spread: 0 });
    assert.equal(daysTaken(rows, required), 0);
  });

  it("is null when there is only one timestamp, rather than guessing a span", () => {
    const rows = [{ lesson_id: "01-a", status: "complete", completed_at: new Date(START).toISOString() }];
    assert.equal(daysTaken(rows, required), null);
  });

  it("is null when the timestamps are missing or unreadable", () => {
    assert.equal(daysTaken(finished(required).map((row) => ({ ...row, completed_at: null })), required), null);
    assert.equal(daysTaken(finished(required).map((row) => ({ ...row, completed_at: "not a date" })), required), null);
  });

  it("ignores lessons outside the requirement", () => {
    const rows = [
      ...finished(["01-a", "02-b", "03-c"]),
      { lesson_id: "other", status: "complete", completed_at: new Date(START - 400 * DAY).toISOString() },
    ];
    assert.equal(daysTaken(rows, required), 0);
  });
});

describe("names", () => {
  it("are taken as typed once they are trimmed", () => {
    assert.deepEqual(checkName("  Ada Lovelace  "), { error: null, value: "Ada Lovelace" });
  });

  it("reject one character", () => {
    assert.equal(checkName("A").error !== null, true);
    assert.equal(checkName("A").value.length, NAME_MIN - 1);
  });

  it("reject more than the column holds", () => {
    assert.equal(checkName("a".repeat(NAME_MAX)).error, null);
    assert.equal(checkName("a".repeat(NAME_MAX + 1)).error !== null, true);
  });

  it("strip control characters, which would break the printed line", () => {
    assert.equal(checkName("Ada\u0000 Lovelace\n").value, "Ada Lovelace");
  });

  it("reject a blank string and a missing one", () => {
    assert.equal(checkName("   ").error !== null, true);
    assert.equal(checkName(undefined).error !== null, true);
    assert.equal(checkName(null).error !== null, true);
  });

  it("must match when typed twice, after the same trimming", () => {
    assert.deepEqual(checkNameConfirmation("Ada Lovelace", " Ada Lovelace "), { error: null, value: "Ada Lovelace" });
    assert.match(checkNameConfirmation("Ada Lovelace", "Ada Lovelase").error, /do not match/);
  });

  it("report the first entry's problem before the mismatch", () => {
    assert.match(checkNameConfirmation("A", "B").error, /at least/);
  });
});

describe("issued date", () => {
  it("is a readable English date in UTC, whatever the machine's zone", () => {
    assert.equal(formatIssued("2026-10-30T00:30:00.000Z"), "30 October 2026");
  });

  it("is null when the date cannot be read", () => {
    assert.equal(formatIssued("not a date"), null);
    assert.equal(formatIssued(undefined), null);
  });
});

describe("the public URL", () => {
  it("is the verify path under the origin, without a doubled slash", () => {
    assert.equal(certificateUrl("https://excel.example", "7K3M9QXZ2HV0RDNC"), "https://excel.example/verify/7K3M9QXZ2HV0RDNC");
    assert.equal(certificateUrl("https://excel.example/", "7K3M9QXZ2HV0RDNC"), "https://excel.example/verify/7K3M9QXZ2HV0RDNC");
  });
});

describe("the LinkedIn deep link", () => {
  const url = new URL(
    linkedInUrl({ credential: "7K3M9QXZ2HV0RDNC", issuedAt: "2026-10-30T12:00:00.000Z", origin: "https://excel.example" }),
  );

  it("is LinkedIn's add-certification task", () => {
    assert.equal(url.origin, "https://www.linkedin.com");
    assert.equal(url.pathname, "/profile/add");
    assert.equal(url.searchParams.get("startTask"), "CERTIFICATION_NAME");
  });

  it("fills in the credential, the verify URL and the issue month", () => {
    assert.equal(url.searchParams.get("certId"), "7K3M9QXZ2HV0RDNC");
    assert.equal(url.searchParams.get("certUrl"), "https://excel.example/verify/7K3M9QXZ2HV0RDNC");
    assert.equal(url.searchParams.get("issueYear"), "2026");
    assert.equal(url.searchParams.get("issueMonth"), "10");
  });

  it("names the issuer rather than leaving LinkedIn to guess", () => {
    assert.match(url.searchParams.get("organizationName"), /Excel Supreme/);
    assert.match(url.searchParams.get("name"), /Certificate of Completion/);
  });

  it("omits the month when the date is unknown, rather than sending NaN", () => {
    const bare = new URL(linkedInUrl({ credential: "7K3M9QXZ2HV0RDNC", issuedAt: null, origin: "https://excel.example" }));
    assert.equal(bare.searchParams.get("issueYear"), null);
    assert.equal(bare.searchParams.get("certId"), "7K3M9QXZ2HV0RDNC");
  });

  it("encodes a name and origin that need escaping", () => {
    const odd = new URL(
      linkedInUrl({ credential: "7K3M9QXZ2HV0RDNC", issuedAt: "2026-01-01T00:00:00.000Z", origin: "https://excel.example/a b" }),
    );
    assert.equal(odd.searchParams.get("certUrl"), "https://excel.example/a b/verify/7K3M9QXZ2HV0RDNC");
    assert.ok(!odd.href.includes(" "));
  });
});

describe("the module's own constants", () => {
  it("state the length the database check constraint states", () => {
    assert.equal(CREDENTIAL_LENGTH, 16);
    assert.equal(ALPHABET.length, 32);
  });
});
