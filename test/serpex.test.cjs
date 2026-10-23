// Offline tests — no network, no API key. Runs against the built dist/.
// test/fixtures holds sanitized responses captured from api.serpex.dev on
// 2026-10-23 (statuses that cannot be triggered safely use the exact body from
// the backend code); manifest.json has each status and headers. fetch is
// stubbed, so the real SDK request/response path runs end to end.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { Serpex, VERSION, describeSerpexError, formatSerpexResults } = require("../dist/index.js");

const FIXTURES = path.join(__dirname, "fixtures");
const manifest = JSON.parse(fs.readFileSync(path.join(FIXTURES, "manifest.json"), "utf8"));
const fixture = (name) => JSON.parse(fs.readFileSync(path.join(FIXTURES, `${name}.json`), "utf8"));

const IGNORED_PARAMS = ["engine", "engines", "category", "time_range", "num", "num_results"];

/** Stub fetch with one fixture (real status, headers, body); returns the sent requests. */
function serve(name) {
  const sent = [];
  const { status, headers } = manifest[name];
  globalThis.fetch = async (url, init) => {
    sent.push({ url: new URL(url), init });
    return {
      ok: status >= 200 && status < 300,
      status,
      statusText: "",
      headers: { get: (k) => headers[k.toLowerCase()] ?? null },
      json: async () => fixture(name),
    };
  };
  return sent;
}

test("tool name and exports are unchanged", () => {
  const tool = new Serpex("test-key");
  assert.strictEqual(tool.name, "serpex_search");
  assert.strictEqual(Serpex.lc_name(), "Serpex");
  assert.strictEqual(VERSION, "0.2.1");
});

test("deprecated options are accepted, warned once, and not sent", async () => {
  const warnings = [];
  const original = console.warn;
  console.warn = (msg) => warnings.push(msg);
  let sent;
  try {
    const tool = new Serpex("test-key", { engine: "legacy-value", category: "web", time_range: "day" }, "https://example.invalid");
    new Serpex("test-key", { time_range: "week" });
    sent = serve("search_repeat_deprecated_engine");
    await tool._call("python asyncio tutorial");
  } finally {
    console.warn = original;
  }
  assert.strictEqual(warnings.filter((w) => /deprecated/.test(w)).length, 1);
  const q = sent[0].url.searchParams;
  assert.deepStrictEqual([...q.keys()], ["q"]);
  for (const name of IGNORED_PARAMS) assert.strictEqual(q.has(name), false, `${name} must not be sent`);
});

test("plain search: only q, GET /api/search, Bearer key, User-Agent from the SDK", async () => {
  const sent = serve("search_plain");
  const out = await new Serpex("test-key", {}, "https://example.invalid")._call("python asyncio tutorial");
  const { url, init } = sent[0];
  assert.strictEqual(url.pathname, "/api/search");
  assert.deepStrictEqual([...url.searchParams.keys()], ["q"]);
  assert.strictEqual(init.headers.Authorization, "Bearer test-key");
  // serpex >= 2.11.1 appends this package's token; 2.11.0 sends its own only.
  assert.match(init.headers["User-Agent"], /^serpex-js\/2\.11\.0$|^serpex-js\/\d+\.\d+\.\d+ langchain-serpex-js\/0\.2\.1$/);
  assert.match(out, /^Found 10 results:\n\n\[1\] /);
  assert.doesNotMatch(out, /Content/);
});

test("include_content: content on the first 5, sent with content_results", async () => {
  const sent = serve("search_content");
  const tool = new Serpex("test-key", { include_content: true, content_results: 5 }, "https://example.invalid");
  const out = await tool._call("what is retrieval augmented generation");
  const q = sent[0].url.searchParams;
  assert.strictEqual(q.get("include_content"), "true");
  assert.strictEqual(q.get("content_results"), "5");
  assert.strictEqual((out.match(/\nContent:\n/g) || []).length, 5);
});

test("include_content: failed pages show content_error", async () => {
  serve("search_content_errors");
  const out = await new Serpex("test-key", { include_content: true }, "https://example.invalid")._call("x");
  assert.strictEqual((out.match(/Content unavailable: robots_disallowed/g) || []).length, 5);
  assert.doesNotMatch(out, /\nContent:\n/);
});

test("no results shows the API message", async () => {
  serve("search_no_results");
  const out = await new Serpex("test-key", {}, "https://example.invalid")._call("x");
  assert.strictEqual(out, fixture("search_no_results").message);
});

test("errors become one actionable sentence per status", async () => {
  const cases = [
    ["error_401_bad_key", /API key rejected \(HTTP 401\): Invalid or inactive API key\. Check SERPEX_API_KEY\./],
    ["error_402_search", /Out of Serpex credits \(HTTP 402\)\. Balance: 0 credits\./],
    ["error_429", /Rate limit exceeded \(limit: 5 requests per second\)\. Retry in 292 ms\./],
    ["error_400_content_results", /Request rejected \(HTTP 400\): content_results must be 5 or 10\./],
    ["error_503_search", /temporarily unavailable \(HTTP 503\): Search temporarily unavailable, please retry\. Not charged\.$/],
    ["error_500_search", /HTTP 500\): Internal server error\. Not charged\. Retry shortly\./],
    ["error_500_malformed_json", /Unexpected end of JSON input/],
  ];
  for (const [name, pattern] of cases) {
    serve(name);
    const out = await new Serpex("test-key", {}, "https://example.invalid")._call("x");
    assert.match(out, /^Error searching with Serpex: /, name);
    assert.match(out, pattern, `${name}: ${out}`);
    assert.doesNotMatch(out, /\[object Object\]/, name);
  }
});

test("network failure is reported, not thrown", async () => {
  globalThis.fetch = async () => {
    throw new TypeError("fetch failed");
  };
  const out = await new Serpex("test-key", {}, "https://example.invalid")._call("x");
  assert.match(out, /^Error searching with Serpex: .*fetch failed/);
});

test("validation: content_results and timeout", () => {
  assert.throws(() => new Serpex("test-key", { content_results: 7 }), /content_results must be 5 or 10/);
  assert.throws(() => new Serpex("test-key", { timeout: 0 }), /timeout/);
  assert.throws(() => new Serpex(""), /API key is required/);
});

test("helpers are exported for reuse", () => {
  assert.strictEqual(typeof describeSerpexError, "function");
  assert.strictEqual(formatSerpexResults({ results: [], message: "none", metadata: {} }), "none");
});
