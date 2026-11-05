/**
 * The server-side event line: how a broken checkout becomes visible afterwards.
 *
 * There is no analytics provider here and `/privacy` promises none, so the only operational record is
 * what this process writes to its own log. That makes two things true at once, and both are tested:
 * a failure must leave a line behind, and the line must not be a way to identify a person — no email,
 * no account id, no IP. `/privacy` says the host's access logs are not joined to an account, and a
 * log line carrying `user_id` would make that sentence false.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { EVENTS, logEvent } from "../lib/log-event.js";

const ROOT = join(import.meta.dirname, "..");

/** Collects what the sink was given, so the line can be parsed as the log reader would parse it. */
function capture() {
  const lines = [];
  const sink = { info: (line) => lines.push(line), error: (line) => lines.push(line) };
  return { lines, sink };
}

describe("the event line", () => {
  it("writes one parsable JSON line, on one line, whatever the fields hold", () => {
    const { lines, sink } = capture();
    logEvent(EVENTS.checkoutFailed, { plan: "annual", reason: "stripe_unavailable" }, { sink });
    assert.equal(lines.length, 1);
    assert.equal(lines[0].includes("\n"), false, "a stack trace or a message with a newline splits the record");
    const record = JSON.parse(lines[0]);
    assert.equal(record.event, "checkout_failed");
    assert.equal(record.plan, "annual");
    assert.equal(record.reason, "stripe_unavailable");
    assert.match(record.at, /^\d{4}-\d{2}-\d{2}T/, "an event with no time cannot be placed after a deploy");
  });

  it("names the events a launch needs to be able to see", () => {
    assert.deepEqual(Object.values(EVENTS).sort(), [
      "checkout_failed",
      "checkout_refused",
      "checkout_started",
      "content_rendered",
      "drill_completed",
      "drill_started",
      "feedback_failed",
      "feedback_received",
      "paywall_shown",
    ]);
  });

  it("keeps a funnel line to a page, a surface and two counts", () => {
    // `scripts/content-report.mjs` groups on these four, so a rename here is a silent zero in a rate.
    const { lines, sink } = capture();
    logEvent(EVENTS.drillCompleted, { surface: "lesson", slug: "sum-basics", attempts: 2, seconds: 41 }, { sink });
    const record = JSON.parse(lines[0]);
    assert.equal(record.event, "drill_completed");
    assert.deepEqual(
      { surface: record.surface, slug: record.slug, attempts: record.attempts, seconds: record.seconds },
      { surface: "lesson", slug: "sum-basics", attempts: 2, seconds: 41 },
    );
  });

  it("drops an identity field rather than writing it to a log somebody else can read", () => {
    // The guard is the point: this is the one place a future edit would quietly put an email in a log.
    const { lines, sink } = capture();
    logEvent(EVENTS.checkoutStarted, { plan: "annual", email: "someone@example.com", user_id: "u_1" }, { sink });
    const record = JSON.parse(lines[0]);
    assert.equal(record.plan, "annual");
    assert.equal("email" in record, false, "an address reached the log");
    assert.equal("user_id" in record, false, "an account id reached the log");
    assert.equal(lines[0].includes("someone@example.com"), false, "the address is still in the line");
  });

  it("drops a value that looks like an address, even under a field name nobody expects", () => {
    const { lines, sink } = capture();
    logEvent(EVENTS.feedbackReceived, { note: "write to someone@example.com" }, { sink });
    const record = JSON.parse(lines[0]);
    assert.equal(JSON.stringify(record).includes("someone@example.com"), false, "an address got through");
  });

  it("never throws at a caller that is already handling a failure", () => {
    // A logger that fails a request is worse than no logger: `logEvent` is called from catch blocks.
    assert.doesNotThrow(() => logEvent(undefined, null, { sink: undefined }));
    assert.doesNotThrow(() => logEvent(EVENTS.checkoutFailed, { when: 10n }, { sink: { info: () => { throw new Error("closed"); } } }));
  });
});

describe("the routes that write it", () => {
  const read = (path) => readFileSync(join(ROOT, path), "utf8");

  it("leaves a line when a checkout starts, is refused, or fails", () => {
    const checkout = read("app/api/stripe/checkout/route.js");
    assert.match(checkout, /logEvent\(EVENTS\.checkoutStarted/, "a started purchase leaves no trace");
    assert.match(checkout, /logEvent\(EVENTS\.checkoutRefused/, "a refused purchase leaves no trace");
    assert.match(checkout, /logEvent\(EVENTS\.checkoutFailed/, "a failed purchase leaves no trace");
  });

  it("counts a page render and a funnel step from the route that can see them", () => {
    // The proxy is the only place a render is knowable, and the endpoint the only place a browser step is.
    assert.match(read("proxy.js"), /logEvent\(EVENTS\.contentRendered/, "no render is counted");
    assert.match(read("app/api/events/route.js"), /logEvent\(EVENTS\[KINDS\[event\]\]/, "a funnel step is not logged");
  });

  it("leaves a line when a note from the feedback dialog arrives or cannot be stored", () => {
    const feedback = read("app/api/feedback/route.js");
    assert.match(feedback, /logEvent\(EVENTS\.feedbackReceived/);
    assert.match(feedback, /logEvent\(EVENTS\.feedbackFailed/);
  });
});
