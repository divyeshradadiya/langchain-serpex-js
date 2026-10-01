import { getEnvironmentVariable } from "@langchain/core/utils/env";
import { Tool } from "@langchain/core/tools";

/** Package version, sent as the User-Agent (langchain-serpex-js/<version>). */
export const VERSION = "0.2.0";

// Client timeouts above the server's own budget for each call (search 30 s
// upstream, 45 s with include_content), so the tool never gives up on a
// request the server still finishes and bills.
const SEARCH_TIMEOUT_MS = 60_000;
const SEARCH_CONTENT_TIMEOUT_MS = 100_000;

// Accepted for backward compatibility, ignored by the Serpex API, never sent.
const DEPRECATED_PARAMS = ["engine", "engines", "category", "time_range"] as const;

let deprecationWarned = false;

/**
 * SERPEX API Parameters
 *
 * Serpex is the web search API and extract API for AI agents.
 *
 * For detailed documentation, visit: https://serpex.dev/docs
 */
export interface SerpexParameters {
  /**
   * Search query string (required)
   */
  q: string;

  /**
   * Also fetch page content (markdown) for the top results. Best-effort: a
   * page that cannot be extracted carries `content_error` instead.
   * Default: false.
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
   * @deprecated Ignored by the Serpex API and not sent. Removed in 0.3.0.
   */
  engine?: string;

  /**
   * @deprecated Ignored by the Serpex API and not sent. Removed in 0.3.0.
   */
  engines?: string | string[];

  /**
   * @deprecated Ignored by the Serpex API and not sent. Removed in 0.3.0.
   */
  category?: string;

  /**
   * @deprecated Ignored by the Serpex API and not sent. Removed in 0.3.0.
   */
  time_range?: string;
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
 * const agent = RunnableSequence.from([
 *   ChatPromptTemplate.fromMessages([
 *     ["ai", "Answer the following questions using concise bullet points."],
 *     ["human", "{input}"],
 *   ]),
 *   new ChatOpenAI({ model: "gpt-4", temperature: 0 }),
 *   (input: BaseMessageChunk) => ({
 *     log: "Processed search results",
 *     returnValues: {
 *       output: input,
 *     },
 *   }),
 * ]);
 *
 * const executor = AgentExecutor.fromAgentAndTools({
 *   agent,
 *   tools: [serpex],
 * });
 *
 * const result = await executor.invoke({
 *   input: "What are the latest AI developments?"
 * });
 * console.log(result);
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

    const passed = DEPRECATED_PARAMS.filter(
      (key) => params[key] !== undefined && params[key] !== null
    );
    if (passed.length > 0 && !deprecationWarned) {
      deprecationWarned = true;
      console.warn(
        `[langchain-serpex-js] ${passed.join(", ")} ${passed.length === 1 ? "is" : "are"} deprecated and ignored by the Serpex API; the value is not sent. It will be removed in 0.3.0.`
      );
    }

    this.apiKey = apiKey;
    this.params = params;
    this.baseURL = baseURL;
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
   * Builds the API request URL with query parameters
   * @param searchQuery - The search query string
   * @returns Complete API URL with parameters
   */
  protected buildUrl(searchQuery: string): string {
    // Only q, include_content and content_results reach the API.
    const searchParams = new URLSearchParams({ q: searchQuery });
    if (this.params.include_content) {
      searchParams.set("include_content", "true");
      searchParams.set("content_results", String(this.params.content_results ?? 5));
    }
    return `${this.baseURL}/api/search?${searchParams}`;
  }

  /**
   * Executes the search and processes results
   * @param input - Search query string
   * @returns Formatted search results
   */
  async _call(input: string): Promise<string> {
    try {
      const url = this.buildUrl(input);

      const timeout =
        this.params.timeout ??
        (this.params.include_content ? SEARCH_CONTENT_TIMEOUT_MS : SEARCH_TIMEOUT_MS);
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          "User-Agent": `langchain-serpex-js/${VERSION}`,
        },
        signal: AbortSignal.timeout(timeout),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `SERPEX API request failed with status ${response.status}: ${errorText}`
        );
      }

      const json = await response.json() as any;

      if (json.error) {
        throw new Error(
          `SERPEX API returned an error: ${json.error}`
        );
      }

      // Response: { id, query, results[], metadata, message? }. `engines` and
      // results[].engine are deprecated (always "auto") and not read here.
      if (json.results && Array.isArray(json.results) && json.results.length > 0) {
        const snippets = json.results
          .filter((result: any) => result.snippet || result.title)
          .slice(0, 10) // Limit to top 10 results
          .map((result: any, index: number) => {
            const title = result.title || "";
            const snippet = result.snippet || "";
            const url = result.url || "";
            let text = `[${index + 1}] ${title}\nURL: ${url}\n${snippet}`;
            if (result.content) {
              text += `\nContent:\n${result.content}`;
            } else if (result.content_error) {
              text += `\nContent unavailable: ${result.content_error}`;
            }
            return text;
          });

        if (snippets.length > 0) {
          const header = `Found ${json.metadata?.number_of_results || json.results.length} results:\n\n`;
          return header + snippets.join("\n\n");
        }
      }

      return json.message || "No search results found.";
    } catch (error) {
      if (error instanceof Error) {
        return `Error searching with SERPEX: ${error.message}`;
      }
      return `Unknown error occurred while searching with SERPEX`;
    }
  }
}