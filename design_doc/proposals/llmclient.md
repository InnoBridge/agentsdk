## LLMClient

This document reflects the current runtime implementation found in `agentsdk/src/client/llmclient.ts`.

Current source summary

- `LLMClient`
	- Currently declared as an empty TypeScript interface in the source file. It is exported as a symbol but not yet specified with concrete methods.

- `OllamaClient`
	- A class decorated with `@Singleton` (from `@innobridge/memoizedsingleton`) and exported from the module.
	- Internally it instantiates the official OpenAI SDK client (imported from `openai`) in its constructor:
		- `this.client = new OpenAI({ apiKey: 'OLLAMA', baseURL: baseUrl })`
	- The constructor accepts a `baseUrl` string and passes it into the OpenAI client's `baseURL` option. This allows the OpenAI SDK to be used against Ollama-like servers by changing the base URL and using a placeholder API key string `OLLAMA`.
	- The current implementation does not expose `call`, `stream`, or other higher-level methods — it acts as a thin wrapper/holder for the SDK client and is intended to be registered in the application context as a singleton instance.

Exports

- The module exports two symbols:
	- `LLMClient` (placeholder interface)
	- `OllamaClient` (singleton wrapper class)

Developer guidance

- The current runtime shape is intentionally minimal. If we want a stable, documented `LLMClient` contract (call/stream/getModelInfo/close), we should:
	1. Define the `LLMClient` interface in the source file with the chosen methods and types.
	2. Implement the methods on `OllamaClient` (or create a separate adapter) to satisfy the interface.
	3. Add unit tests and update design docs to reflect the concrete contract.

- Alternatively, if we prefer to support multiple providers (OpenAI, Anthropic, local runtimes), implement per-provider adapters that conform to the `LLMClient` interface and register a provider selector in the application context.

Next steps (recommended)

- Add a small `LLMClient` interface with `call(prompt, opts)`, `stream?(...)`, `getModelInfo?()` and `close?()` and implement them on `OllamaClient` (or add adapter wrappers).
- Add a `stubLLMClient` for unit tests to avoid external network dependencies.
- Update integration tests to prefer skipping when environment variables or local runtimes are missing.
