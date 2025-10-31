# Changelog

| index | date | designdoc | arch doc | pr | package vers. |
| -----:| ---- | --------- | -------- | -- | ------------- |
| [1](#1---llm-client) | 2025-10-17 | [LLMClient](./llmclient.md) | | [Implement LLMClient](https://github.com/InnoBridge/agentsdk/pull/1) |  |
| | 2025-10-18 | [LLMClient](./llmclient.md) | | [Change to OllamaSDK](https://github.com/InnoBridge/agentsdk/pull/2)|  |
| [2](#2---tools) | 2025-10-21 | [Tools](../proposals/tools.md) | | [Implement Tools](https://github.com/InnoBridge/agentsdk/pull/3) |  |
| [3](#3---structured-outputs) | 2025-10-31 | [Structured Output](./structured_output.md) | | [Implement Structured Output](https://github.com/InnoBridge/agentsdk/pull/4) |  |

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


### Change: Ollama SDK (2025-10-18)

- The `OllamaClient` adapter was migrated from using the OpenAI SDK to the native Ollama SDK to correctly support local Ollama server API shapes and streaming overloads.
- Provider status & recommendations:
	- Implemented: OllamaClient.
	- Recommended next adapters: OpenAI, Azure OpenAI, Anthropic, Cohere; implement OpenAI adapter first if you primarily target OpenAI.
	- Add a `stubLLMClient` for tests and a provider selector (env-based) to register the chosen adapter.


<a id="2---tools"></a>

## 2. Tools

Summary of recent changes to the Tools proposal and implementation:

- Purpose: Document the runtime decorator-based tool system (`@Tool`) and the `ToolComponent` contract that lets provider adapters map model `tool_call`s to instantiated tool objects.
- Deferral rationale: Schema/validation work is intentionally deferred because provider `tool_call` outputs are frequently inconsistent. Implementing a strict parse→validate→instantiate pipeline now would cause noisy operational failures. The decision, rationale, and outstanding policy items are recorded in the proposal.
- Ollama integration: `OllamaClient.toolCall` now wires authoritative tool definitions into the chat request and hydrates provider `tool_call` payloads via each tool class's `static hydration` helper. There is no shared parsing/validation layer yet — tools must defensively validate/repair inputs during `hydration` or reject the call.
- Example added: documentation includes a concrete usage snippet showing how to call `llmclient.toolCall(input, [ToolClasses...])`, receive `ToolComponent[]`, and invoke `.run()` on each instance. See [tools.md](../proposals/tools.md) for the snippet.
- Gaps/Outstanding work: constructor contract alignment (favor object-based constructors), shared parse/validate pipeline, better observability for hydration errors, and unit tests around the hydration path.

Affected files and refs:

- [`tools.md`](../proposals/tools.md) — proposal and examples (this change)
- [`ollama_client.ts`](../../src/client/ollama_client.ts) — `toolCall` translation/dispatch/hydration
- [`tool.ts`](../../src/tools/tool.ts) — decorator and `ToolComponent` runtime contract

Notes: This changelog entry captures documentation and light implementation changes (no breaking API changes). Follow ups include adding a tolerant parse/validation stage in the client library and improving test coverage for hydrators.


<a id="3---structured-outputs"></a>

## 3. Structured Outputs

Highlights from [structured_output.md](./structured_output.md):

- Captures the runtime architecture built around the `StructuredOutput` base class, `@DTO` decorator, schema cache, Ajv-backed validator, and recursive hydrator.
- Documents how `getSchema()` derives nested schemas and how `hydrate()` re-instantiates nested DTO graphs from model responses.
- LLM integration: [`OllamaClient.toStructuredOutput`](../../src/client/ollama_client.ts) shows how schema generation, validation, and hydration plug into provider calls end-to-end.
- Records best practices and follow-up work (enum support, potential `anyOf` handling) alongside type-coercion behavior.

Related implementation work: [Implement Structured Output](https://github.com/InnoBridge/agentsdk/pull/4).


