# Changelog

| index | date | designdoc | arch doc | pr | package vers. |
| -----:| ---- | --------- | -------- | -- | ------------- |
| [1](#1---llm-client) | 2025-10-17 | [LLMClient](./llmclient.md) | | [Implement LLMClient](https://github.com/InnoBridge/agentsdk/pull/1) |  |

<a id="1---llm-client"></a>

## 1. LLM Client

Main points from LLMClient.md:

- Purpose: Provide a lightweight, provider-agnostic contract that centralizes chat/generation requests, model listing/inspection, and provider lifecycle (startup/shutdown). Adapters translate this contract to provider SDKs and normalize responses.
- Source locations: [interface](../../src/client/llmclient.ts) and [Ollama client](../../src/client/ollama_client.ts).
- Public API surface (suggested):
	- `chat(input, opts?) => Promise<LLMResponse>` — primary sync request method.
	- `stream?(input, handler, opts?) => Promise<void>` — optional streaming hook.
	- `getModels?() => Promise<string[]>` — returns model id strings (normalization requirement).
	- `getModelInfo?(modelId) => Promise<any>` — optional model inspection.
	- `close?/stop?() => Promise<void>` — lifecycle cleanup.
- Adapter requirements and guidance:
	- Normalize model lists to `string[]` of ids and responses to a small `LLMResponse` shape (`text`, `messages`, `usage`, `raw`).
	- Expose a `raw` or passthrough option for provider-specific features.
	- Implement streaming bridges when SDKs support streaming; otherwise emit final text.
	- Keep adapter surfaces minimal to avoid leaking provider-specific types.
- Ollama specifics (implemented):
	- Uses the official `openai` SDK under the hood (`new OpenAI({ apiKey: 'OLLAMA', baseURL })`).
	- Normalizes `baseURL` (strip trailing slash, ensure `/v1`).
	- `getModels()` maps `client.models.list()` to `res.data.map(m => m.id)`.
	- `chat()` forwards to `client.chat.completions.create(...)`.
	- `stop()` calls `super.stop()` to run `SingletonComponent` cleanup logic.
- Provider status & recommendations:
	- Implemented: OllamaClient.
	- Recommended next adapters: OpenAI, Azure OpenAI, Anthropic, Cohere; implement OpenAI adapter first if you primarily target OpenAI.
	- Add a `stubLLMClient` for tests and a provider selector (env-based) to register the chosen adapter.


