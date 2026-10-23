import { getEnvironmentVariable } from "@langchain/core/utils/env";
import { Tool } from "@langchain/core/tools";
// The official SDK owns the HTTP contract (params, timeouts, error parsing), so
// this tool cannot drift from the API on its own.
import { SerpexClient, SerpApiException } from "serpex";
import type { SearchParams, SearchResponse, SerpexClientOptions } from "serpex";

/** Package version, sent in the User-Agent (serpex-js/<sdk> langchain-serpex-js/<version>). */
export const VERSION = "0.3.0";

// Accepted for backward compatibility, ignored by the Serpex API, never sent.
const DEPRECATED_PARAMS = ["engine", "engines", "category", "time_range"] as const;

const BILLING_URL = "https://app.serpex.dev/dashboard/billing";

let deprecationWarned = false;

/**
 * Serpex options.
 *
 * Serpex is the web search API and extract API for AI agents.
 *
 * For detailed documentation, visit: https://serpex.dev/docs
 */
export interface SerpexParameters {
  /**
   * Search query string. The tool's input is used as the query; this field is
   * kept for backward compatibility.
   */
  q: string;

  /**
   * Also fetch page content (markdown) for the top results. Best-effort: a
   * page that cannot be extracted carries `content_error` instead.
   * Costs 3 credits (5 pages) or 6 (10 pages) instead of 1. Default: false.
   */
  include_content?: boolean;

  /**
   * How many top results get content when `include_content` is true: 5 or 10.
   * Default: 5.
   */
  content_results?: 5 | 10;

  /**
   * Request timeout in milliseconds. Default: 60000, or 100000 with
   * `include_content`.
   */
  timeout?: number;

  /**
   * @deprecated Ignored by the Serpex API and not sent. Removed in 0.4.0.
   */
  engine?: string;

  /**
   * @deprecated Ignored by the Serpex API and not sent. Removed in 0.4.0.
   */
  engines?: string | string[];

  /**
   * @deprecated Ignored by the Serpex API and not sent. Removed in 0.4.0.
   */
  category?: string;

  /**
   * @deprecated Ignored by the Serpex API and not sent (date filters go in the
   * query as `after:YYYY-MM-DD` / `before:YYYY-MM-DD`). Removed in 0.4.0.
   */
  time_range?: string;
}

/** The API's own error text from an error body (string, `{ message }` or framework `message`). */
function apiMessage(err: SerpApiException): string {
  const d = (err.details ?? {}) as Record<string, unknown>;
  if (typeof d.error === "string" && d.error) {
    if (err.statusCode === 404 && typeof d.message === "string" && d.message) return d.message;
    return d.error;
  }
  const nested = d.error as { message?: unknown } | undefined;
  if (nested && typeof nested.message === "string" && nested.message) return nested.message;
  if (typeof d.message === "string" && d.message) return d.message;
  return err.message && err.message !== "[object Object]" ? err.message : "API request failed";
}

function sentence(text: string): string {
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

/** One actionable sentence per failure: what happened, whether it was charged, whether to retry. */
export function describeSerpexError(err: unknown): string {
  if (!(err instanceof SerpApiException)) {
    return sentence(err instanceof Error ? err.message : String(err));
  }
  const status = err.statusCode;
  const d = (err.details ?? {}) as Record<string, unknown>;
  const msg = apiMessage(err);
  if (status === undefined) return `${sentence(err.message)} Safe to retry.`;
  switch (status) {
    case 400:
      return `Request rejected (HTTP 400): ${sentence(msg)}`;
    case 401:
      return `API key rejected (HTTP 401): ${sentence(msg)} Check SERPEX_API_KEY.`;
    case 402: {
      const balance = typeof d.remainingCredits === "number" ? ` Balance: ${d.remainingCredits} credits.` : "";
      return `Out of Serpex credits (HTTP 402).${balance} Top up at ${BILLING_URL}.`;
    }
    case 429: {
      const limit = typeof d.limit === "number" ? ` (limit: ${d.limit} requests per second)` : "";
      const wait = typeof d.retryAfterMs === "number" ? d.retryAfterMs : 1000;
      return `Rate limit exceeded${limit}. Retry in ${wait} ms.`;
    }
    default:
      if (status >= 500) {
        const charged = /charged/i.test(msg) ? "" : " Not charged.";
        const retry = /retry/i.test(msg) ? "" : " Retry shortly.";
        return `Serpex is temporarily unavailable (HTTP ${status}): ${sentence(msg)}${charged}${retry}`;
      }
      return `HTTP ${status}: ${sentence(msg)}`;
  }
}

/**
 * Render a search response for the model: numbered results with URL and
 * snippet, then the page content (or why it is missing) when requested.
 */
export function formatSerpexResults(json: SearchResponse): string {
  const results = (json.results ?? []).filter((r) => r.snippet || r.title).slice(0, 10);
  if (results.length === 0) {
    return json.message || json.metadata?.message || "No search results found.";
  }
  const lines = results.map((result, index) => {
    let text = `[${index + 1}] ${result.title || ""}\nURL: ${result.url || ""}\n${result.snippet || ""}`;
    if (result.content !== undefined) {
      text += `\nContent:\n${result.content}`;
    } else if (result.content_error !== undefined) {
      text += `\nContent unavailable: ${result.content_error}`;
    }
    return text;
  });
  const total = json.metadata?.number_of_results || results.length;
  return `Found ${total} results:\n\n${lines.join("\n\n")}`;
}

/**
 * Serpex Class
 *
 * A LangChain tool for web search with Serpex.
 *
 * Requires SERPEX_API_KEY environment variable or passed as parameter.
 * Get your API key at: https://serpex.dev
 *
 * @example
 * ```typescript
 * const serpex = new Serpex("your-api-key", {
 *   include_content: true, // page content (markdown) for the top results
 *   content_results: 5,
 * });
 *
 * const text = await serpex.invoke("latest AI developments");
 * ```
 */
export class Serpex extends Tool {
  static lc_name() {
    return "Serpex";
  }

  name = "serpex_search";

  description =
    "A web search tool. Useful for answering questions about current events and finding information from the web. Input should be a search query string.";

  protected apiKey: string;

  protected params: Partial<SerpexParameters>;

  protected baseURL: string;

  protected client: SerpexClient;

  /**
   * @param apiKey - SERPEX API key (optional if SERPEX_API_KEY env var is set)
   * @param params - Default parameters for all searches
   * @param baseURL - Base URL for Serpex API (defaults to production API)
   */
  constructor(
    apiKey: string | undefined = getEnvironmentVariable("SERPEX_API_KEY"),
    params: Partial<SerpexParameters> = {},
    baseURL: string = getEnvironmentVariable("SERPEX_BASE_URL") || "https://api.serpex.dev"
  ) {
    super();

    if (!apiKey) {
      throw new Error(
        "SERPEX API key is required. Set it as SERPEX_API_KEY in your environment variables, or pass it to the Serpex constructor."
      );
    }

    if (
      params.content_results !== undefined &&
      params.content_results !== 5 &&
      params.content_results !== 10
    ) {
      throw new Error("content_results must be 5 or 10");
    }

    if (params.timeout !== undefined && !(typeof params.timeout === "number" && params.timeout > 0)) {
      throw new Error("timeout must be a positive number of milliseconds");
    }

    const passed = DEPRECATED_PARAMS.filter(
      (key) => params[key] !== undefined && params[key] !== null
    );
    if (passed.length > 0 && !deprecationWarned) {
      deprecationWarned = true;
      console.warn(
        `[langchain-serpex-js] ${passed.join(", ")} ${passed.length === 1 ? "is" : "are"} deprecated and ignored by the Serpex API; the value is not sent. It will be removed in 0.4.0.`
      );
    }

    this.apiKey = apiKey;
    this.params = params;
    this.baseURL = baseURL;

    // Adds this package to the SDK's User-Agent:
    // "serpex-js/<sdk> langchain-serpex-js/<version>".
    const options: SerpexClientOptions = {
      userAgent: `langchain-serpex-js/${VERSION}`,
      ...(params.timeout !== undefined ? { timeoutMs: params.timeout } : {}),
    };
    this.client = new SerpexClient(apiKey, baseURL, options);
  }

  /**
   * Converts the Serpex instance to JSON
   * @returns Serialized representation
   */
  toJSON(): any {
    return {
      lc: 1,
      type: "not_implemented",
      id: ["langchain-serpex-js", "Serpex"],
      kwargs: {
        name: this.name,
        description: this.description,
        apiKey: "[REDACTED]",
        params: this.params,
        baseURL: this.baseURL,
      },
    };
  }

  /**
   * The search request: only q, plus include_content / content_results when
   * page content is on. Nothing else exists on the API.
   */
  protected buildSearchParams(searchQuery: string): SearchParams {
    const params: SearchParams = { q: searchQuery };
    if (this.params.include_content) {
      params.include_content = true;
      params.content_results = this.params.content_results ?? 5;
    }
    return params;
  }

  /**
   * Executes the search and processes results
   * @param input - Search query string
   * @returns Formatted search results, or an error sentence for the agent
   */
  async _call(input: string): Promise<string> {
    try {
      const json = await this.client.search(this.buildSearchParams(input));
      return formatSerpexResults(json);
    } catch (error) {
      return `Error searching with Serpex: ${describeSerpexError(error)}`;
    }
  }
}
