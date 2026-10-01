# Changelog

## 0.2.0 — 2026-10-01

- New `include_content` / `content_results` (5 or 10): page content (markdown) for the top results, rendered under each result; failed pages show their `content_error`.
- Only `q` (plus the content options) is sent. The tool no longer injects `engine: "auto"` / `category: "web"`, and `engine`, `engines`, `category`, `time_range` passed by callers are not sent (the API ignores them); they are still accepted, marked `@deprecated`, with a one-time `console.warn`. Removed in 0.3.0.
- Removed the dead handling of `answers`, `infoboxes`, `suggestions`, `corrections` and `published_date` (the API never returns them). A no-results response shows the API's `message`.
- Timeouts: 60 s, or 100 s with `include_content`; new `timeout` option.
- Every request sends `User-Agent: langchain-serpex-js/<version>`; `VERSION` exported.

## 0.1.5 — 2026-09-22

- docs: positioning — Serpex is a real-time web search API; README, JSDoc and the tool description updated.
- `engine` deprecated (ignored by the API since 2026-06). The `engine` option is still accepted; request behaviour is unchanged. Class, tool name and exports unchanged.
- `npm test` now runs offline unit tests (`test/`), no API key needed.
- package description and keywords updated.
