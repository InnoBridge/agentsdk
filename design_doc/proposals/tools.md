## Tools

### Motivation

Tooling gives the agent runtime a deterministic way to perform side effects (HTTP calls, DB lookups, workflow mutations) in response to model output. Rather than letting models invent arbitrary JSON payloads, we register a curated catalog of safe tools and let the planner request them. `LLMClient.toolCall` (currently commented out on the interface) will bridge our native tool registry with provider “function calling” APIs.

### Definition Model

We plan to represent each tool as a class annotated with a `@Tool` decorator:

```ts
@Tool({
	type: "function",
	name: "get_weather",
	description: "Fetch current weather for the given location.",
	parameters: {/* JSON schema supplied by the author */},
})
class GetWeatherTool {
	constructor(private readonly args: { location: string; unit?: "celsius" | "fahrenheit" }) {
		// Validate inputs up front; throw descriptive errors if the model emitted malformed arguments.
	}

	async run(): Promise<ToolResult> {
		// Execute side effects using this.args.
	}
}
```

- The decorator captures metadata (type, name, description, schema, safety flags, etc.) and stores it on the class (e.g. static `definition`). We avoid runtime TypeScript reflection; authors provide schema and defaults directly in the decorator options or via static helpers consumed by the decorator.
- Constructors accept the provider payload (typically decoded JSON). Prefer a single object argument to avoid positional mistakes and make validation easier.
- Tool classes expose a single execution entry point—`run()` in the sketch—returning a structured `ToolResult` (shape TBD).

### `@Tool` Contract

The decorator returns a canonical tool definition that all providers consume:

```ts
type JsonSchema = Record<string, unknown>;

interface CanonicalToolDefinition {
	type: "function";
	name: string;
	description?: string;
	parameters: JsonSchema; // full JSON schema, including required/properties/items/etc.
	strict?: boolean; // defaults to provider baseline
	safety?: Record<string, unknown>; // optional metadata (audit level, categories, etc.)
}
```

Key points:

- **Schema fidelity**: whatever `parameters` object the author supplies is stored verbatim. This means nested `$defs`, `required`, `enum`, array schemas, and other JSON Schema constructs survive the translation step without loss.
- **Decorator storage**: the decorator attaches the canonical definition to the class (e.g. `ToolClass.definition`) so `toolCall` can read it without relying on experimental decorator metadata emitters.
- **Optional fields**: `strict` maps directly to OpenAI’s strict mode toggle, while `safety` lets us carry extra policy data through the pipeline. Providers that do not understand these fields simply ignore them.
- **Execution hook**: the runtime will expect each decorated class to implement `run(): Promise<ToolResult>`; any additional helpers (e.g. `static schema()`) are optional sugar for authors.

### Provider Schema Mapping

During the translate step, the canonical definition is reshaped per provider:

- **OpenAI / Anthropic**: pass the canonical properties through unchanged under the `tools` array. Example mapping:

	```ts
	{
		type: def.type, // "function"
		name: def.name,
		description: def.description,
		parameters: def.parameters,
		strict: def.strict,
	}
	```

- **Ollama** (and other providers that wrap the definition):

	```ts
	{
		type: def.type,
		function: {
			name: def.name,
			description: def.description,
			parameters: def.parameters,
			type: def.parameters?.type, // optional for compatibility
		},
	}
	```

Because the decorator retains the full JSON schema, complex examples such as:

```ts
@Tool({
	type: "function",
	name: "get_temperature",
	description: "Get the current temperature for a city",
	parameters: {
		type: "object",
		required: ["city"],
		properties: {
			city: { type: "string", description: "The name of the city" },
		},
	},
})
class GetTemperatureTool { /* ... */ }
```

translate cleanly into the structures expected by OpenAI, Anthropic, Ollama, or any future provider we support.

### Planning Flow

`toolCall(input, tools)` will operate in three steps once implemented:

1. **Translate**: walk each decorated tool class, extract stored metadata, and adapt it to the provider’s schema (OpenAI/Anthropic JSON schema, Ollama tooling descriptors, etc.).
2. **Dispatch**: append those provider definitions onto the chat request (`input`) and call the underlying SDK.
3. **Hydrate**: for every `tool_call` in the chat response, locate the matching class, parse the arguments, instantiate a fresh tool (`new GetWeatherTool(parsedArgs)`), and return the array of hydrated instances to the runtime.

An Ollama-flavoured implementation might look like:

```ts
async toolCall(input: ChatRequest, tools: ToolClass[]): Promise<ToolInstance[]> {
	const toolDefs = tools.map((toolClass) => toOllamaDefinition(toolClass));

	const response = await this.chat({
		...input,
		tools: toolDefs,
	});

	return (response.tool_calls ?? []).map((call) => {
		const Tool = resolveToolClass(call.name, tools);
		const args = parseToolArguments(call.arguments);
		return new Tool(args);
	});
}
```

Planning stops here. The executor—orchestrator—decides whether/when to call `tool.run()` so planning and action remain decoupled.

In code, this path will sit behind the optional `toolCall` method defined (and currently commented out) on the `LLMClient` interface in `src/client/llmclient.ts`. Each concrete client (Ollama, OpenAI, Anthropic) will implement `toolCall` by reading the decorator metadata, adapting it to the provider’s schema, dispatching the chat request, and then instantiating the tool classes with the response payload before returning them to the agent runtime.

### Validation & Safety

- Constructors are the front line for argument validation. They should reject malformed payloads and surface actionable errors to the agent loop.
- Provider quirks (stringified JSON args, strict mode, missing schemas) are normalized inside each `LLMClient` implementation via helpers like `convertToDefinition` and `parseToolArguments`.
- Decorator metadata can include optional safety annotations (e.g. threat level, required approvals) that the runtime can inspect before executing a tool.

### Status & Next Steps

- `LLMClient.toolCall` remains commented out until we finalize the shared `Tool`/`ToolResult` contracts and decorator helper.
- Implementation work will include providing the `@Tool` utility, wiring translations inside each provider client (Ollama, OpenAI, Anthropic), and extending the executor to run hydrated tool instances.
- Testing will focus on cross-provider argument parsing, validation paths, and enforcing host-level safety policies before execution.
