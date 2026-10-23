# Changelog

## 0.2.1 — 2026-10-23

- Calls the API through the official `serpex` SDK (`^2.11.0`) instead of its own `fetch` code, so parameters, timeouts and error parsing cannot drift from the API. The response is typed (`SearchResponse`) instead of `any`.
- Errors: one actionable sentence per HTTP status (400, 401 check `SERPEX_API_KEY`, 402 out of credits with the balance, 429 retry after N ms with the plan limit, 5xx temporary and not charged) instead of the raw response body. An object-shaped error body no longer shows as `[object Object]`.
- `timeout` must be a positive number of milliseconds.
- The protected `buildUrl()` is replaced by `buildSearchParams()` (the SDK builds the URL).
- New exported helpers `describeSerpexError()` and `formatSerpexResults()`.
- `User-Agent: serpex-js/<sdk> langchain-serpex-js/0.2.1` with serpex >= 2.11.1.
- Published files limited to `dist/`, README and CHANGELOG.
- Offline tests against recorded API responses (`test/fixtures/`).

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
