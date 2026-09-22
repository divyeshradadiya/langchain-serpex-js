// Offline tests — no network, no API key. Runs against the built dist/.
const test = require("node:test");
const assert = require("node:assert");
const { Serpex } = require("../dist/index.js");

test("tool name and exports are unchanged", () => {
  const tool = new Serpex("test-key");
  assert.strictEqual(tool.name, "serpex_search");
  assert.strictEqual(Serpex.lc_name(), "Serpex");
});

test("deprecated engine option is still accepted", () => {
  const tool = new Serpex("test-key", { engine: "legacy-value", time_range: "day" });
  const url = new URL(tool.buildUrl("hello"));
  assert.strictEqual(url.searchParams.get("q"), "hello");
  assert.strictEqual(url.searchParams.get("time_range"), "day");
});

test("formats results from a stubbed response", async () => {
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      metadata: { number_of_results: 1 },
      results: [{ title: "T", url: "https://example.com", snippet: "S" }],
    }),
  });
  const out = await new Serpex("test-key", {}, "https://example.invalid")._call("hello");
  assert.match(out, /\[1\] T\nURL: https:\/\/example.com\nS/);
});
