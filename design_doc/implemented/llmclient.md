# LLMClient

This document explains what the `LLMClient` is for: a lightweight, provider-agnostic abstraction that centralizes calls to language model providers (local runtimes and hosted APIs). It defines the minimal contract the application uses to perform chat/generation requests, list and inspect available models, and manage provider lifecycle (startup/shutdown). Implementations (provider adapters) translate this contract to provider-specific SDK calls and normalize responses so the rest of the application can remain provider-independent.

Source locations

- `agentsdk/src/client/llmclient.ts` — exports the `LLMClient` TypeScript interface.
- `agentsdk/src/client/ollama_client.ts` — contains the `OllamaClient` class which implements `LLMClient`.

Providers

- ✅ OllamaClient (`agentsdk/src/client/ollama_client.ts`) — implemented (uses OpenAI SDK under the hood).
- OpenAI (`openai`) — not implemented in this repo; an `OpenAIClient` adapter is recommended.
- Azure OpenAI (`@azure/ai-openai`) — not implemented.
- Anthropic (`@anthropic-ai/sdk`) — not implemented.
- LangChain (`langchain`) — not implemented.

LLMClient (interface)

Key members (as currently declared):

- `chat(input: any): Promise<any>` — primary chat method; Ollama implementation uses the OpenAI SDK chat completions create endpoint.
- `getModelInfo?(modelId: string): Promise<any>` — optional; wrapper around provider `models.retrieve`.
- `getModels?(): Promise<string[]>` — optional; returns an array of model id strings.
- `stop?(): Promise<void>` — optional lifecycle hook; used to clean up resources.

## OllamaClient (implementation) ✅

Constructor

- `constructor(baseUrl: string)` — normalizes `baseUrl` and instantiates the OpenAI SDK client:
  - strips a trailing slash if present
  - ensures the URL ends with `/v1` (appends `/v1` if missing)
  - creates `new OpenAI({ apiKey: 'OLLAMA', baseURL: normalized })`
  
  Note: `OllamaClient` uses the official OpenAI SDK (imported from the `openai` package) under the hood to communicate with the runtime.

Methods

- `async getModels(): Promise<string[]>` — calls `this.client.models.list()` and returns `res.data.map(m => m.id)` (array of model ids).

- `async getModelInfo(modelId: string): Promise<Model>` — calls `this.client.models.retrieve(modelId)` and returns the result.

- `async chat(input: ChatCompletionCreateParamsNonStreaming): Promise<ChatCompletion>` — forwards to `this.client.chat.completions.create(input)` and returns the response.

- `async stop(): Promise<void>` — calls `super.stop()` to run the `SingletonComponent` cleanup logic (avoids recursion).

Exports

- The module exports `LLMClient` from `agentsdk/src/client/llmclient.ts` and `OllamaClient` from `agentsdk/src/client/ollama_client.ts`.

Notes & guidance

- `getModels` returns `string[]` of model ids; if you add providers, ensure adapters normalize to this shape.
- `baseUrl` normalization allows callers to pass either `http://host:port` or `http://host:port/v1`.
- `stop()` uses `super.stop()` to ensure component cleanup runs and to avoid unintended recursion.

If you want, I can add a small example snippet showing how to instantiate `OllamaClient` and call `chat`/`getModels`, or create a `client/index.ts` barrel to preserve older import paths.



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
interface LLMClient {
  chat(input: any): Promise<any>;
  // stream?(input: string | Message[], handler?: { onToken?: (tok: string) => void; onError?: (err: any) => void; onClose?: () => void }, opts?: CallOptions): Promise<void>;
  getModelInfo?(modelId: string): Promise<any>;
  getModels?(): Promise<string[]>;
  stop?(): Promise<void>;
};

export {
  LLMClient
};
```
