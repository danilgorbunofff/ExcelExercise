/**
 * The error record, and the wire that can carry it.
 *
 * The claim this file pins is narrow and worth stating: when something breaks, a record exists that a
 * person can act on — the route, the message, the digest — and it says nothing about whoever was
 * reading the page. The second claim is that the wire cannot hurt the site: unset is silent, a failing
 * sink is swallowed, and the burst guard stops a render loop from becoming a denial of service on
 * whoever receives the reports.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { POST, RATE, resetRate } from "../app/api/report-error/route.js";
import { onRequestError } from "../instrumentation.js";
import { BURST, errorRecord, reportError, resetBurst, sinkUrl } from "../lib/report-error.js";

function capture() {
  const lines = [];
  return { lines, sink: { info: (line) => lines.push(line) }, last: () => JSON.parse(lines.at(-1)) };
}

describe("an error, as a record", () => {
  it("keeps the route, the message and the digest a log can be searched by", () => {
    const error = Object.assign(new Error("cannot read properties of undefined"), { digest: "a1b2c3" });
    const record = errorRecord(error, {
      request: { method: "GET", path: "/learn/excel/vlookup?q=secret#top" },
      context: { routePath: "/learn/excel/[lesson]", routeType: "render", renderSource: "server-rendering" },
    });

    assert.equal(record.message, "cannot read properties of undefined");
    assert.equal(record.digest, "a1b2c3");
    assert.equal(record.route, "/learn/excel/[lesson]");
    assert.equal(record.routeType, "render");
    assert.equal(record.method, "GET");
  });

  it("drops the query string, because that is the part with somebody's typing in it", () => {
    const record = errorRecord(new Error("x"), { request: { path: "/pricing?email=a@b.example" } });
    assert.equal(record.path, "/pricing");
  });

  it("records a throw that was not an Error at all", () => {
    assert.equal(errorRecord("plain string").message, "plain string");
    assert.equal(errorRecord(undefined).name, "Error");
  });

  it("keeps the top of the stack and no more", () => {
    const error = new Error("boom");
    error.stack = ["Error: boom", "    at one (a.js:1:1)", "    at two (b.js:2:2)", "    at three (c.js:3:3)", "    at four (d.js:4:4)"].join("\n");
    assert.deepEqual(errorRecord(error).frames, ["at one (a.js:1:1)", "at two (b.js:2:2)", "at three (c.js:3:3)"]);
  });

  it("never carries a person: an address in the message is dropped, not truncated", async () => {
    const sink = capture();
    await reportError(new Error("delivery failed for a@b.example"), {}, { sink: sink.sink, env: {} });
    const line = sink.last();
    assert.equal(line.event, "error");
    assert.equal(line.message, undefined, "an address reached the log");
    assert.equal(JSON.stringify(line).includes("a@b.example"), false);
  });
});

describe("the wire out", () => {
  it("is off when no sink is configured, and the record is still written", async () => {
    resetBurst();
    const sink = capture();
    let called = 0;
    const result = await reportError(new Error("x"), {}, { sink: sink.sink, env: {}, fetchImpl: () => { called += 1; } });
    assert.equal(sink.lines.length, 1);
    assert.equal(called, 0);
    assert.equal(result.forwarded, false);
  });

  it("accepts an http url and refuses anything that is not one", () => {
    assert.equal(sinkUrl({ ERROR_SINK_URL: "https://sink.example/hook" }), "https://sink.example/hook");
    assert.equal(sinkUrl({ ERROR_SINK_URL: "http://127.0.0.1:9999/hook" }), "http://127.0.0.1:9999/hook");
    assert.equal(sinkUrl({ ERROR_SINK_URL: "javascript:alert(1)" }), null);
    assert.equal(sinkUrl({ ERROR_SINK_URL: "file:///etc/passwd" }), null);
    assert.equal(sinkUrl({ ERROR_SINK_URL: "not a url" }), null);
    assert.equal(sinkUrl({}), null);
  });

  it("posts one sanitized record when a sink is configured", async () => {
    resetBurst();
    const sink = capture();
    const sent = [];
    await reportError(
      Object.assign(new Error("boom"), { digest: "d1" }),
      { request: { method: "GET", path: "/daily?x=1" }, context: { routePath: "/daily", routeType: "render" } },
      {
        sink: sink.sink,
        env: { ERROR_SINK_URL: "https://sink.example/hook" },
        fetchImpl: async (url, init) => {
          sent.push({ url, init, body: JSON.parse(init.body) });
          return new Response(null, { status: 200 });
        },
      },
    );

    assert.equal(sent.length, 1, "the record did not travel");
    assert.equal(sent[0].url, "https://sink.example/hook");
    assert.equal(sent[0].init.method, "POST");
    assert.equal(sent[0].body.event, "error");
    assert.equal(sent[0].body.digest, "d1");
    assert.equal(sent[0].body.path, "/daily");
    assert.ok(sent[0].init.signal, "no timeout: a hung sink would hang the report");
  });

  it("swallows a sink that fails, because the caller is already handling a failure", async () => {
    resetBurst();
    const sink = capture();
    const result = await reportError(new Error("x"), {}, {
      sink: sink.sink,
      env: { ERROR_SINK_URL: "https://sink.example/hook" },
      fetchImpl: async () => {
        throw new Error("ECONNREFUSED");
      },
    });
    assert.equal(result, null);
    assert.equal(sink.lines.length, 1, "the record must be written before the wire is tried");
  });

  it("stops forwarding past the burst limit, and keeps logging", async () => {
    resetBurst();
    const sink = capture();
    let posts = 0;
    const options = {
      sink: sink.sink,
      env: { ERROR_SINK_URL: "https://sink.example/hook" },
      fetchImpl: async () => {
        posts += 1;
        return new Response(null, { status: 200 });
      },
    };
    for (let i = 0; i < BURST.limit + 5; i += 1) await reportError(new Error("loop"), {}, options);
    assert.equal(posts, BURST.limit, "the sink was flooded");
    assert.equal(sink.lines.length, BURST.limit + 5, "a suppressed report must still be logged");
  });
});

describe("the browser's report", () => {
  const post = (body, headers = {}) =>
    POST(
      new Request("http://127.0.0.1:4174/api/report-error", {
        method: "POST",
        body: typeof body === "string" ? body : JSON.stringify(body),
        headers: { "content-type": "application/json", ...headers },
      }),
    );

  it("answers 204 for a report from an error boundary", async () => {
    resetRate();
    const response = await post({ message: "boom", digest: "d1", path: "/learn" });
    assert.equal(response.status, 204);
    assert.equal(response.headers.get("cache-control"), "no-store");
  });

  it("refuses a body that is too large, before reading it", async () => {
    const response = await post({ message: "x" }, { "content-length": "999999" });
    assert.equal(response.status, 413);
  });

  it("refuses a body that is not a JSON object", async () => {
    assert.equal((await post("not json")).status, 400);
    assert.equal((await post("[1,2,3]")).status, 400);
    assert.equal((await post("null")).status, 400);
  });

  it("keeps answering 204 once the address is over its limit", async () => {
    resetRate();
    for (let i = 0; i < RATE.limit; i += 1) await post({ message: "loop" });
    const response = await post({ message: "loop again" });
    assert.equal(response.status, 204, "a boundary must never see a failure from its own reporter");
  });
});

describe("the server hook", () => {
  it("is wired to Next, and resolves rather than throwing into the request", async () => {
    await onRequestError(new Error("render failed"), { method: "GET", path: "/" }, { routeType: "render" });
  });
});
