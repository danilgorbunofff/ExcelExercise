/**
 * The guard on `/verify/<id>`, whose reason to exist is that certificate ids are not secret but the
 * whole list of them should not be harvestable one request at a time. What has to hold: an honest
 * reader never notices it, a crawler does, and the bookkeeping cannot be turned into a memory leak by
 * inventing addresses. That last one is the trap — a limiter keyed on an attacker-supplied header is
 * an unbounded map unless it says otherwise, so it is tested rather than assumed.
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  VERIFY_LIMIT,
  admitVerifyRequest,
  clientAddress,
  refusalPage,
  resetVerifyWindows,
} from "../lib/verify/limit.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const { max, windowMs } = VERIFY_LIMIT;
const T0 = 1_760_000_000_000;

beforeEach(() => resetVerifyWindows());

describe("the window", () => {
  it("allows exactly the budget, then refuses", () => {
    for (let i = 1; i <= max; i += 1) {
      assert.equal(admitVerifyRequest({ address: "198.51.100.4", now: T0 }).allowed, true, `request ${i} was refused`);
    }
    const refused = admitVerifyRequest({ address: "198.51.100.4", now: T0 });
    assert.equal(refused.allowed, false, "the request after the budget must be refused");
  });

  it("reports a positive, bounded wait so the client can be told how long", () => {
    for (let i = 0; i <= max; i += 1) admitVerifyRequest({ address: "198.51.100.4", now: T0 });
    const { retryAfter } = admitVerifyRequest({ address: "198.51.100.4", now: T0 });
    assert.ok(retryAfter >= 1, "a zero second wait would make Retry-After a lie");
    assert.ok(retryAfter <= windowMs / 1000, "the wait cannot outlast the window");
  });

  it("shortens the wait as the window runs out", () => {
    for (let i = 0; i <= max; i += 1) admitVerifyRequest({ address: "198.51.100.4", now: T0 });
    const early = admitVerifyRequest({ address: "198.51.100.4", now: T0 }).retryAfter;
    const late = admitVerifyRequest({ address: "198.51.100.4", now: T0 + windowMs - 1_000 }).retryAfter;
    assert.ok(late < early, `the wait did not shrink: ${early} then ${late}`);
    assert.equal(late, 1);
  });

  it("forgets the window when it has elapsed", () => {
    for (let i = 0; i <= max; i += 1) admitVerifyRequest({ address: "198.51.100.4", now: T0 });
    const after = admitVerifyRequest({ address: "198.51.100.4", now: T0 + windowMs });
    assert.equal(after.allowed, true, "a window that has run out must not carry its count forward");
  });

  it("rolls over on the first request after the gap, not sooner", () => {
    for (let i = 0; i <= max; i += 1) admitVerifyRequest({ address: "198.51.100.4", now: T0 });
    assert.equal(admitVerifyRequest({ address: "198.51.100.4", now: T0 + windowMs - 1 }).allowed, false);
    assert.equal(admitVerifyRequest({ address: "198.51.100.4", now: T0 + windowMs }).allowed, true);
  });

  it("counts each address on its own, so one network cannot exhaust another's", () => {
    for (let i = 0; i <= max; i += 1) admitVerifyRequest({ address: "198.51.100.4", now: T0 });
    assert.equal(admitVerifyRequest({ address: "198.51.100.4", now: T0 }).allowed, false);
    assert.equal(admitVerifyRequest({ address: "203.0.113.9", now: T0 }).allowed, true);
  });

  it("treats a missing address as one shared bucket rather than no limit", () => {
    for (let i = 0; i <= max; i += 1) admitVerifyRequest({ address: "", now: T0 });
    assert.equal(admitVerifyRequest({ address: undefined, now: T0 }).allowed, false);
  });

  it("keeps the wait honest for a default `now`, so the plain call path works", () => {
    for (let i = 0; i <= max; i += 1) admitVerifyRequest({ address: "198.51.100.4" });
    const { allowed, retryAfter } = admitVerifyRequest({ address: "198.51.100.4" });
    assert.equal(allowed, false);
    assert.ok(retryAfter >= 1 && retryAfter <= windowMs / 1000);
  });
});

describe("the address", () => {
  const headers = (map) => ({ get: (name) => map[name] ?? null });

  it("is the first hop of x-forwarded-for, not the last", () => {
    assert.equal(clientAddress(headers({ "x-forwarded-for": "198.51.100.4, 10.0.0.1, 10.0.0.2" })), "198.51.100.4");
  });

  it("trims the hop, since every host pads it differently", () => {
    assert.equal(clientAddress(headers({ "x-forwarded-for": "  198.51.100.4 " })), "198.51.100.4");
  });

  it("falls back to x-real-ip, then to a single shared name", () => {
    assert.equal(clientAddress(headers({ "x-real-ip": "198.51.100.4" })), "198.51.100.4");
    assert.equal(clientAddress(headers({})), "unidentified");
    assert.equal(clientAddress(undefined), "unidentified");
  });

  it("prefers x-forwarded-for when a host sets both", () => {
    const both = headers({ "x-forwarded-for": "198.51.100.4", "x-real-ip": "10.0.0.1" });
    assert.equal(clientAddress(both), "198.51.100.4");
  });

  it("ignores an empty x-forwarded-for instead of bucketing everyone on it", () => {
    assert.equal(clientAddress(headers({ "x-forwarded-for": "  ", "x-real-ip": "198.51.100.4" })), "198.51.100.4");
  });
});

describe("the book", () => {
  it("does not grow without end when addresses are invented", () => {
    // Well past the cap: if the map were unbounded this would be the memory leak, and the eviction
    // would never be exercised.
    for (let i = 0; i < 20_000; i += 1) admitVerifyRequest({ address: `203.0.113.${i}`, now: T0 });
    // The freshest address still counts, so eviction removed the oldest windows rather than resetting.
    for (let i = 0; i < max; i += 1) admitVerifyRequest({ address: "203.0.113.19999", now: T0 });
    assert.equal(admitVerifyRequest({ address: "203.0.113.19999", now: T0 }).allowed, false);
  });

  it("is emptied by the reset", () => {
    for (let i = 0; i <= max; i += 1) admitVerifyRequest({ address: "198.51.100.4", now: T0 });
    resetVerifyWindows();
    assert.equal(admitVerifyRequest({ address: "198.51.100.4", now: T0 }).allowed, true);
  });
});

describe("the refusal page", () => {
  it("is a page a stranded reader can act on, not a status in a tab", () => {
    const html = refusalPage(30);
    assert.match(html, /<h1>Too many certificate checks<\/h1>/);
    assert.match(html, /Try again in 30 seconds/);
    assert.match(html, /<a href="\/">/);
    assert.match(html, /name="robots" content="noindex"/);
    assert.match(html, /<html lang="en">/);
  });

  it("never tells a reader to wait a plural one", () => {
    assert.match(refusalPage(1), /Try again in a second\./);
  });
});

describe("proxy wiring", () => {
  const code = readFileSync(join(ROOT, "proxy.js"), "utf8");

  it("imports the guard from the module rather than reimplementing a counter", () => {
    assert.match(code, /import \{ admitVerifyRequest, clientAddress, refusalPage \} from "\.\/lib\/verify\/limit\.js"/);
  });

  it("matches the public record's URL and nothing wider", () => {
    assert.match(code, /const VERIFY = \/\^\\\/verify\\\/\[\^\/\]\+\\\/\?\$\//);
    assert.doesNotMatch(code, /VERIFY\.test\([^)]*searchParams/);
  });

  it("answers before the session work, so a deployment without accounts still has the limit", () => {
    const guard = code.indexOf("admitVerifyRequest({");
    const early = code.indexOf("if (!config.enabled) return NextResponse.next()");
    assert.ok(guard > -1, "the guard is not called");
    assert.ok(early > guard, "the guard must run before the unconfigured-accounts early return");
  });

  it("refuses with a no-store 429 that names the wait", () => {
    assert.match(code, /status: 429/);
    assert.match(code, /"retry-after": String\(verdict\.retryAfter\)/);
    assert.match(code, /"cache-control": "no-store"/);
    assert.match(code, /"content-type": "text\/html; charset=utf-8"/);
  });
});
