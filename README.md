# langchain-serpex-js

[![npm version](https://img.shields.io/npm/v/langchain-serpex-js)](https://www.npmjs.com/package/langchain-serpex-js)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

LangChain integration for Serpex (JavaScript/TypeScript).

## Installation

```bash
npm install langchain-serpex-js
```

## What is Serpex?

Serpex is the web search API and extract API for AI agents. Search returns
ranked web results (title, URL, snippet), optionally with page content as
markdown; Extract turns known URLs into clean markdown. It's built for AI
agents, LLM tools and RAG pipelines.

## Features

- **Web search**: ranked results for any query, optionally with page content as markdown
- **One search engine**: nothing to configure — no engine to pick
- **LangChain-native**: drop-in `Tool` for agents and chains
- **Easy integration**: API key via constructor or `SERPEX_API_KEY`

## Quick Start

### Get Your API Key

Sign up at [SERPEX](https://serpex.dev) to get your API key.

### Basic Usage

```typescript
import { Serpex } from 'langchain-serpex-js';

// Initialize the tool
const tool = new Serpex('your-serpex-api-key');

// Perform a search
const results = await tool.invoke('latest AI developments');
console.log(results);
```

### With LangChain Agent

```typescript
import { Serpex } from 'langchain-serpex-js';
import { ChatOpenAI } from '@langchain/openai';
import { AgentExecutor, createOpenAIFunctionsAgent } from 'langchain/agents';
import { ChatPromptTemplate } from '@langchain/core/prompts';

// Initialize the search tool
const searchTool = new Serpex('your-serpex-api-key');

// Initialize the LLM
const llm = new ChatOpenAI({ model: 'gpt-4', temperature: 0 });

// Create an agent with the search tool
const prompt = ChatPromptTemplate.fromMessages([
  ['system', 'You are a helpful assistant.'],
  ['human', '{input}'],
  ['human', '{agent_scratchpad}']
]);

const agent = await createOpenAIFunctionsAgent({
  llm,
  tools: [searchTool],
  prompt
});

const executor = new AgentExecutor({
  agent,
  tools: [searchTool]
});

// Run the agent
const result = await executor.invoke({
  input: 'What are the latest developments in quantum computing?'
});
console.log(result);
```

## Configuration

### Environment Variables

You can set your SERPEX API key as an environment variable:

```bash
export SERPEX_API_KEY="your-serpex-api-key"
```

Then use the tool without passing the API key:

```typescript
import { Serpex } from 'langchain-serpex-js';

const tool = new Serpex();  // Will use SERPEX_API_KEY from environment
```

### Parameters

- `apiKey` (string): Your SERPEX API key (required)
- `include_content` (boolean): Also fetch page content (markdown) for the top results (default: `false`). Best-effort: a page that can't be extracted shows its `content_error` instead.
- `content_results` (`5 | 10`): How many top results get content (default: `5`)
- `timeout` (number): Request timeout in ms (default: 60000, or 100000 with `include_content`)
- `engine`, `category`, `time_range`: **Deprecated** — ignored by the Serpex API and not sent (a one-time `console.warn` is printed); removed in 0.3.0

## Documentation

For more detailed documentation, visit:
- [LangChain Documentation](https://js.langchain.com)
- [Serpex API Documentation](https://serpex.dev/docs)

## Support

For issues and questions:
- GitHub Issues: [langchain-serpex-js issues](https://github.com/divyeshradadiya/langchain-serpex-js/issues)
- Serpex Support: [support@serpex.dev](mailto:support@serpex.dev)

## License

This package is licensed under the MIT License.

## CI / Publishing

A GitHub Actions workflow is provided to publish the package to npm when a tag like `v*` is pushed or when a release is published.

Required repository secret:
- `NPM_TOKEN` — an npm automation token with permission to publish the package. Set this in the repository's Settings → Secrets → Actions.

To publish a new release, create a tag `vMAJOR.MINOR.PATCH` and push it or create a release in GitHub; the workflow will build the package and upload it to npm.