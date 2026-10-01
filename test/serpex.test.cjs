// Offline tests — no network, no API key. Runs against the built dist/.
const test = require("node:test");
const assert = require("node:assert");
const { Serpex, VERSION } = require("../dist/index.js");

const IGNORED_PARAMS = ["engine", "engines", "category", "time_range", "num"];

test("tool name and exports are unchanged", () => {
  const tool = new Serpex("test-key");
  assert.strictEqual(tool.name, "serpex_search");
  assert.strictEqual(Serpex.lc_name(), "Serpex");
  assert.strictEqual(VERSION, "0.2.0");
});

test("deprecated options are accepted, warned once, and not sent", () => {
  const warnings = [];
  const original = console.warn;
  console.warn = (msg) => warnings.push(msg);
  try {
    const tool = new Serpex("test-key", {
      engine: "legacy-value",
      category: "web",
      time_range: "day",
    });
    new Serpex("test-key", { time_range: "week" });
    const url = new URL(tool.buildUrl("hello"));
    assert.strictEqual(url.searchParams.get("q"), "hello");
    for (const name of IGNORED_PARAMS) {
      assert.strictEqual(url.searchParams.has(name), false, `${name} must not be sent`);
    }
  } finally {
    console.warn = original;
  }
  assert.strictEqual(warnings.length, 1);
  assert.match(warnings[0], /deprecated/);
});

test("sends only q by default", () => {
  const url = new URL(new Serpex("test-key").buildUrl("hello"));
  assert.deepStrictEqual([...url.searchParams.keys()], ["q"]);
});

test("include_content sends include_content and content_results", () => {
  const tool = new Serpex("test-key", { include_content: true, content_results: 10 });
  const url = new URL(tool.buildUrl("hello"));
  assert.strictEqual(url.searchParams.get("include_content"), "true");
  assert.strictEqual(url.searchParams.get("content_results"), "10");
});

test("content_results must be 5 or 10", () => {
  assert.throws(() => new Serpex("test-key", { content_results: 7 }));
});

test("formats results, content and the User-Agent from a stubbed response", async () => {
  let sentHeaders;
  globalThis.fetch = async (_url, init) => {
    sentHeaders = init.headers;
    return {
      ok: true,
      json: async () => ({
        metadata: { number_of_results: 2 },
        results: [
          { title: "T", url: "https://example.com", snippet: "S", content: "# Page" },
          { title: "U", url: "https://example.org", snippet: "S2", content_error: "timeout" },
        ],
      }),
    };
  };
  const out = await new Serpex("test-key", {}, "https://example.invalid")._call("hello");
  assert.match(out, /\[1\] T\nURL: https:\/\/example.com\nS/);
  assert.match(out, /# Page/);
  assert.match(out, /Content unavailable: timeout/);
  assert.strictEqual(sentHeaders["User-Agent"], "langchain-serpex-js/0.2.0");
});

test("no-results response shows the API message", async () => {
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ results: [], message: "No results found for this query" }),
  });
  const out = await new Serpex("test-key", {}, "https://example.invalid")._call("hello");
  assert.strictEqual(out, "No results found for this query");
});
