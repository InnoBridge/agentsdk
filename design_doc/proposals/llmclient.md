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


## OpenAI (`openai`)

Primary TypeScript surface (official SDK)

- constructor: `new OpenAI({ apiKey?, baseURL?, fetch?, maxRetries?, ...opts })`
- Responses API: `client.responses.create({ model, input, ... })`
- Chat completions: `client.chat.completions.create({ model, messages, ... })`
- Embeddings: `client.embeddings.create({ model, input })`
- Models: `client.models.list()` / `client.models.retrieve(id)`

Notes

- Well-typed and actively maintained. Supports streaming via appropriate endpoints or SDK helpers. Use Responses API for a standardized output shape when available; fallback to chat completions otherwise.

Usage tips for adapter

- Implement `call()` by preferring `responses.create` and extracting a plain-text fallback from `res.output` or `res.choices`.
- Implement streaming if the SDK provides a streaming iterator or event hooks; otherwise fallback to emitting the final text once.

## Azure OpenAI (`@azure/ai-openai` / Azure SDK)

Primary TypeScript surface

- constructor: `new AzureOpenAI(clientOptions)` or Azure-specific credential wiring
- chat/completions: client offers chat/completions endpoints similar to OpenAI but with Azure auth/endpoint patterns

Notes

- Use when your organization runs models via Azure OpenAI Service. Authentication and endpoint configuration differ (resource/region/credential-based); adaptors should accept Azure credentials and endpoints.

Usage tips for adapter

- Wrap Azure client calls in the same `call()` shape as OpenAI; map Azure responses to the unified `LLMResponse`.

## Anthropic (`@anthropic-ai/sdk`)

Primary TypeScript surface

- top-level client with `client.completions.create()` or `client.chat.create()` depending on SDK
- supports Claude-style request/response shapes and usually includes streaming support via SSE or streaming endpoints

Notes

- Anthropic's model semantics (e.g., Claude) differ slightly from OpenAI; pay attention to token limits and message formatting.

Usage tips for adapter

- Implement `call()` to map prompts/messages into Anthropic's expected input and extract the assistant text. Provide a streaming bridge if supported by their SDK.

## Cohere (`cohere-ai`)

Primary TypeScript surface

- `new Cohere({ apiKey })`
- `client.generate({ model, prompt, max_tokens, temperature })`
- Embeddings: `client.embed({ model, input })`

Notes

- Cohere offers text generation and embeddings; API shapes are different but straightforward to map.

Usage tips for adapter

- Map `call()` to `client.generate()` and extract the generated text. Use `raw` passthrough for provider-specific options.

## LangChain JS (`langchain`)

Primary TypeScript surface

- `import { OpenAI } from 'langchain/llms/openai'` (and many provider connectors)
- High-level tools: Chains, Agents, Memory primitives, and connectors for many providers

Notes

- LangChain is not just an SDK — it's an orchestration library. Use it when you want higher-level agent primitives and provider interchangeability.

Usage tips for adapter

- You can wrap LangChain LLM instances to implement `LLMClient`, or use LangChain for orchestration and call into its LLMs from your agent plumbing. Keep the adapter surface minimal to avoid pulling LangChain-specific types into the rest of the codebase.

## Hosted/cloud and local runtimes (brief)

- Hugging Face Inference (`@huggingface/inference`): inference API client, supports text/audio/image models.
- Replicate (`replicate`): RPC-like hosted inference.
- Local runtimes: `llama-cpp-node`, `gpt4all`, Ollama (HTTP) — usually require special handling for binary models or local endpoints.

Quick recommendation

- If you primarily target OpenAI: implement an `OpenAIClient` adapter first.
- If you need provider flexibility: implement small per-provider adapters and add a simple selector (env-based) that registers the selected adapter in the application context.

Notes

- Keep `CallOptions.raw` or similar passthrough fields for provider-specific options.
- Add `stubLLMClient` for tests and make integration tests skip if credentials/local runtimes are missing.

---

## Concrete unified interface + example adapters

Below is a suggested unified TypeScript contract (copy‑paste into `src/client/llmclient.ts`) and two minimal adapter examples: `OpenAIClient` and `OllamaClient`. These examples are intentionally small and focus on `call()` (sync request) and a minimal `stream()` fallback.

Unified TypeScript contract

```ts
// ...existing code...
type Message = { role: 'system' | 'user' | 'assistant'; content: string };
type CallOptions = { model?: string; temperature?: number; maxTokens?: number; raw?: Record<string, any> };
type LLMResponse = { text?: string; messages?: Message[]; usage?: any; raw?: any };

interface LLMClient {
	call(input: string | Message[], opts?: CallOptions): Promise<LLMResponse>;
	stream?(input: string | Message[], handler?: { onToken?: (tok: string) => void; onError?: (err: any) => void; onClose?: () => void }, opts?: CallOptions): Promise<void>;
	getModelInfo?(model?: string): Promise<any>;
	close?(): Promise<void>;
}
```

OpenAIClient (example)

```ts
class OpenAIClient implements LLMClient {
	private client: any;
	constructor(apiKey?: string, baseURL?: string) {
		// lazy require to avoid hard dependency in docs
		// const { OpenAI } = require('openai');
		// this.client = new OpenAI({ apiKey, baseURL });
	}

	async call(input, opts) {
		const messages = typeof input === 'string' ? [{ role: 'user', content: input }] : input;
		// prefer Responses API
		const res = await this.client.responses.create({ model: opts?.model, input: messages, ...opts?.raw });
		const text = extractTextFromResponses(res);
		return { text, messages: [{ role: 'assistant', content: text }], raw: res, usage: res?.usage };
	}

	async stream(input, handler, opts) {
		// try SDK streaming; fallback to call
		const res = await this.call(input, opts);
		if (res.text) handler?.onToken?.(res.text);
		handler?.onClose?.();
	}
}
```

OllamaClient (example)

```ts
class OllamaClient implements LLMClient {
	constructor(baseUrl: string) { this.baseUrl = baseUrl.replace(/\/$/, ''); }

	async call(input, opts) {
		const prompt = typeof input === 'string' ? input : input.map(m => m.content).join('\n');
		const res = await fetch(`${this.baseUrl}/api/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt, model: opts?.model, ...opts?.raw }) });
		const json = await res.json();
		const text = json?.results?.[0]?.content ?? json?.content ?? JSON.stringify(json);
		return { text, raw: json };
	}
}
```

Provider mapping snippets (how to extract text)

- OpenAI Responses: join `res.output` content pieces (walk `res.output[*].content[*].text`).
- OpenAI Chat: `res.choices[0].message.content` or `res.choices[0].text`.
- Anthropic: `res.completion` or `res.completion?.content`.
- Cohere: `res.generations?.[0]?.text`.
- Ollama: `json.results?.[0]?.content` or `json.content`.

Testing helpers

- `stubLLMClient`: return `{ text: 'stub' }` for deterministic unit tests.
- Integration tests: if `OPENAI_API_KEY` or `OLLAMA_BASE_URL` missing, skip tests.
