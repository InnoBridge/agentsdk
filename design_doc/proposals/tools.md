

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
	// The canonical JSON Schema for the tool's arguments. This field is required
	// and is the authoritative contract used for provider translation and
	// server-side validation of LLM `tool_call` payloads.
	parameters: JsonSchema; // full JSON schema, including required/properties/items/etc.

	// Optional runtime flags. Default runtime behavior is fail-closed when
	// `parameters` is absent; authors must explicitly opt-in to permissive modes.
	allowNoSchema?: boolean;
	noSchemaMode?: 'read-only' | 'human-approval' | 'full';
	strict?: boolean; // defaults to provider baseline
}
```

Key points:

- **Schema fidelity**: whatever `parameters` object the author supplies is stored verbatim. This means nested `$defs`, `required`, `enum`, array schemas, and other JSON Schema constructs survive the translation step without loss.
- **Decorator storage**: the decorator attaches the canonical definition to the class (e.g. `ToolClass.definition`) so `toolCall` can read it without relying on experimental decorator metadata emitters.
- **Optional fields**: `strict` maps directly to OpenAI’s strict mode toggle. Providers that do not understand this field simply ignore it.
- **Execution hook**: the runtime will expect each decorated class to implement `run(): Promise<ToolResult>`; any additional helpers (e.g. `static schema()`) are optional sugar for authors.

- **Schema required**: `parameters` is required on every public tool definition. The runtime treats missing schemas as a safety violation and will fail-closed unless the author explicitly sets `allowNoSchema` with a controlled `noSchemaMode`.

**Schema fidelity — best practices (purpose & minimal flow):**

The canonical `parameters` JSON Schema attached to each `@Tool` is primarily used to validate the provider-returned `tool_call` object from the LLM before we instantiate or execute a tool. In short: the schema is the authoritative contract for the model's tool arguments — not just documentation.

Minimal operational flow (parse → validate → instantiate):

1. parse: safely parse the provider's `tool_call.arguments` (may be a JSON string). If parsing fails, record a parse error and treat the tool call as invalid (optional: attempt a single repair).
2. validate: run the pre-compiled validator attached to the tool class (e.g. `ToolClass.validator`). If validation fails, do not instantiate; record the validation errors.
3. instantiate: if validation passes, construct `new ToolClass(validatedArgs)` and return the instance to the executor. Never execute a tool with unvalidated arguments.

Failure handling (concise):
- Parse error: mark invalid, optionally attempt LLM-assisted repair once.
- Validation error: attempt one LLM-assisted repair + re-validate; if still invalid, exclude and surface errors to the planner/executor for auditing/escalation.

Operational notes:
- Keep the canonical schema verbatim on the class for validation and auditing.
- Pre-compile validators at startup (pluggable implementation) and attach them to the class for fast runtime checks.
- Resolve external `$ref` at build time; disallow remote `$ref` resolution at runtime.
- Translate to compact provider-facing schema when sending to the model, but always validate against the canonical server-side schema.

This is the exact purpose of the schema fidelity requirement: validate the LLM's `tool_call` payloads before instantiation or execution. Keep validators pluggable and the flow strict and auditable.

### Schema requirement — do not omit

To avoid ambiguity: the canonical `parameters` JSON Schema is required for any tool intended to be callable by the LLM. The text below only describes the exceptional, opt‑in escape hatch — it does not change the default requirement.

- Registration-time enforcement: when a tool is registered (decorator application / startup), the runtime will validate that `parameters` is present. If `parameters` is missing and `allowNoSchema !== true`, registration will fail with a clear error asking the author to provide a schema.

- Default (recommended — fail-closed): at runtime, if a provider returns a `tool_call` for a tool that has no canonical schema (because the author explicitly opted out), treat the call as disallowed unless the tool was registered with the opt-in flags described below.

- Explicit opt-in only: authors who deliberately want to allow no-schema tools must set `allowNoSchema: true` on the decorator at registration time. That opt-in must be deliberate and accompanied by a `noSchemaMode` that constrains execution. Recommended `noSchemaMode` values:
  - `read-only` — permit instantiation for tools that perform only read-only operations; side effects prohibited unless explicitly approved.
  - `human-approval` — queue the tool for human approval before execution.
  - `full` — allow execution without schema (not recommended without additional guardrails and approvals).

- Provenance & auditing: any instantiation that used `allowNoSchema` must be flagged `validated: false` and include the `noSchemaMode` in audit logs and UI traces.

Authors should prefer providing a schema. The opt-in path is only for rare, low-risk cases and must be explicit at registration time.

#### Implementation checklist (authors & implementers)

- Store the canonical schema verbatim on the class (e.g. `ToolClass.definition.parameters`) so it can be used for validation, docs and translation.
- Pre-compile a JSON Schema validator for each tool at startup (AJV recommended) and attach it to the class (e.g. `ToolClass.validator`) to keep runtime validation fast.
- Disallow remote `$ref` resolution at runtime. Resolve external refs at build time or require local `$defs` only.
- When translating to provider formats, produce a provider-compatible view but never mutate the canonical schema.
- Always re-validate provider-returned arguments against the canonical schema before instantiation; reject and surface clear validation errors to the agent loop.
- Keep schemas reasonably small; if a schema is large, consider a compact `providerSchema` to send to the model while retaining the canonical copy server-side.
- Attach optional `safety` and `capabilities` metadata in the decorator so `pickTools` and the executor can make policy decisions without parsing the full schema.


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

---

## Tool Selection: `pickTools`

### Motivation

When an agent maintains a large catalog of tools (50+), sending all tool definitions to the LLM on every request creates several problems:

1. **Token cost explosion**: Each tool definition consumes tokens (name, description, JSON schema). A 100-tool catalog can add 5-10K tokens per request.
2. **Degraded LLM accuracy**: Research shows function-calling accuracy drops significantly when models must choose from 30+ functions. Attention dilution makes the model more likely to hallucinate or pick suboptimal tools.
3. **No safety gates**: Without pre-filtering, unsafe or expensive tools are always visible to the LLM, even when context or permissions should exclude them.
4. **Missing provenance**: When the LLM selects tools directly, we lose visibility into *why* those tools were candidates and what alternatives were considered.

`pickTools` addresses these issues by introducing an optional **pre-filtering and ranking step** that runs before `toolCall`. It scores and ranks tools based on relevance, safety, and compatibility, then passes only the top candidates to the LLM.

### When to Use `pickTools`

**Use `pickTools` when:**
- Tool catalog is large (>20 tools)
- You need safety/permission filtering before LLM sees tools
- You want cost control (limit token usage per request)
- You need audit trails (scores, reasons, provenance)
- LLM accuracy is degrading due to catalog size

**Skip `pickTools` when:**
- Catalog is small (<10 tools)
- All tools are safe and low-cost
- You want maximum LLM flexibility (let model see everything)

### Interface

`pickTools` is a pure, selection-only function that scores and ranks candidate tools without executing them:

```ts
pickTools(input: any, tools: ToolClass[], opts?: PickOptions): Promise<PickResult[]>
```

**Types:**

```ts
interface PickOptions {
  maxCandidates?: number;     // default 3; how many to return
  minScore?: number;          // default 0.05; threshold for inclusion
  allowUnsafe?: boolean;      // default false; whether to include tools marked unsafe
  scorer?: ScorerFn;          // custom scoring function (overrides default)
  timeoutMs?: number;         // optional overall timeout for scoring
  debug?: boolean;            // include extra provenance in results
}

interface PickResult {
  tool: ToolClass;            // the tool class (not instance)
  score: number;              // normalized 0..1
  reason?: string;            // human-readable explanation
  provenance?: {              // optional audit metadata
    scorer?: string;
    details?: any;
  };
}

type ScorerFn = (input: any, tool: ToolClass) => Promise<{
  score: number;
  reason?: string;
  details?: any;
}>;
```

### Behavior

1. **Normalize input**: convert `input` to a searchable string (stringify if object).
2. **Score each tool**:
   - If `opts.scorer` provided, use it to score each tool.
   - Otherwise, use default keyword-based scorer (token overlap between input and tool name/description/tags).
   - If tool has `safe: false` and `allowUnsafe: false`, skip it entirely.
3. **Filter and rank**: keep tools with `score >= minScore`, sort descending by score, take top `maxCandidates`.
4. **Return results**: array of `PickResult` objects with tool class, score, and reason.

`pickTools` is **pure**: it never calls `tool.run()` or causes side effects. It only ranks and returns metadata.

### Default Scorer (Keyword-Based)

The default scorer uses simple token overlap:

```ts
function defaultScorer(input: any, tool: ToolClass): { score: number; reason?: string } {
  const inputText = typeof input === 'string' ? input : JSON.stringify(input);
  const toolText = [tool.definition.name, tool.definition.description, ...(tool.definition.tags || [])]
    .filter(Boolean)
    .join(' ');

  const score = keywordOverlap(inputText, toolText); // 0..1
  const reason = score > 0 ? `matched keywords in ${tool.definition.name}` : undefined;

  return { score, reason };
}
```

This is fast and deterministic, but limited to surface-level matching. For better results, use a semantic scorer.

### Custom Scorers

`pickTools` accepts a `scorer` function to replace the default heuristic. Common patterns:

**1. Embedding-based scorer (semantic similarity)**

```ts
const embeddingScorer: ScorerFn = async (input, tool) => {
  const inputEmbed = await embedText(input);
  const toolEmbed = await embedText(tool.definition.description);
  const score = cosineSimilarity(inputEmbed, toolEmbed);
  return { score, reason: 'semantic similarity' };
};

const picks = await pickTools(userQuery, allTools, { scorer: embeddingScorer, maxCandidates: 3 });
```

**2. LLM-based scorer (classify relevance)**

```ts
const llmScorer: ScorerFn = async (input, tool) => {
  const prompt = `Given input: "${input}"\nTool: ${tool.definition.name} - ${tool.definition.description}\nRelevance (0-1):`;
  const response = await llm.chat({ messages: [{ role: 'user', content: prompt }] });
  const score = parseFloat(response.text);
  return { score, reason: 'LLM classifier', details: { prompt, model: 'gpt-4' } };
};
```

**3. Hybrid scorer (keyword + embeddings)**

```ts
const hybridScorer: ScorerFn = async (input, tool) => {
  const keywordScore = defaultScorer(input, tool).score;
  const semanticScore = (await embeddingScorer(input, tool)).score;
  const score = 0.4 * keywordScore + 0.6 * semanticScore;
  return { score, reason: 'hybrid (keyword + semantic)' };
};
```

### Integration with `toolCall`

`pickTools` sits **before** `toolCall` in the agent loop:

```ts
// Without pickTools (send all tools to LLM)
const toolInstances = await llmClient.toolCall(input, allTools);

// With pickTools (pre-filter to top 3 relevant tools)
const candidates = await pickTools(input, allTools, { maxCandidates: 3 });
const selectedTools = candidates.map(c => c.tool);
const toolInstances = await llmClient.toolCall(input, selectedTools);
```

This reduces token cost (3 tool definitions instead of 100) and improves LLM accuracy.

### Safety and Permissions

`pickTools` can enforce safety policies before tools reach the LLM:

```ts
@Tool({ name: 'delete_database', safe: false })
class DeleteDatabaseTool { /* ... */ }

// By default, unsafe tools are excluded
const picks = await pickTools(input, allTools); // DeleteDatabaseTool not included

// Explicit opt-in required for unsafe tools
const picksWithUnsafe = await pickTools(input, allTools, { allowUnsafe: true });
```

Future enhancements:
- User/role-based permissions (filter by `allowedRoles` metadata)
- Context-based filtering (only show tools compatible with current execution mode)
- Cost/quota checks (exclude tools that would exceed budget)

### Provenance and Debugging

`PickResult` includes `reason` and optional `provenance` for audit trails:

```ts
const picks = await pickTools(input, tools, { debug: true });

picks.forEach(p => {
  console.log(`${p.tool.definition.name}: ${p.score.toFixed(2)} - ${p.reason}`);
  if (p.provenance) console.log('  Provenance:', p.provenance);
});

// Output:
// get_weather: 0.87 - matched keywords in get_weather
// get_temperature: 0.45 - matched keywords in get_temperature
```

This is critical for:
- Debugging why certain tools were/weren't selected
- Explaining agent decisions to users
- Auditing compliance (which tools were visible, which were excluded)

### Edge Cases

- **Streaming tools**: `pickTools` can check `tool.definition.capabilities.streaming` and filter based on request type.
- **Expensive scorers**: Set `timeoutMs` to bound total scoring time. If scoring times out, fall back to top-K by registration order.
- **Empty results**: If no tools score above `minScore`, return empty array. Caller should handle gracefully (e.g., ask LLM to rephrase or use fallback tools).
- **Determinism**: Default scorer is deterministic. LLM/embedding scorers may vary; cache scores when possible.

### Performance Considerations

- **Default scorer**: O(tools) keyword comparisons, ~0.1ms per tool. Scales to 1000+ tools.
- **Embedding scorer**: O(tools) embedding lookups + cosine similarity. Pre-compute and cache tool embeddings; ~5-10ms per tool with cached embeddings.
- **LLM scorer**: O(tools) LLM calls. Expensive and slow; use only for critical decisions or batch score in parallel.

For large catalogs (100+ tools), prefer:
1. Default scorer for first pass (fast, eliminates 90% of irrelevant tools)
2. Semantic scorer for re-ranking top 10 candidates
3. LLM scorer only if needed for tie-breaking or compliance

### Implementation Status

- **Current**: Interface and types defined; awaiting implementation.
- **Next**: Implement default keyword scorer and `pickTools` function in `src/tools/pickTools.ts`.
- **Future**: Add embedding scorer integration, tool registry discovery, and permission-based filtering.

### Example: Complete Flow

```ts
// 1. Start with large catalog
const allTools = [WeatherTool, CalcTool, SearchTool, /* ...97 more */ ];

// 2. Pre-filter to top 3 relevant tools
const candidates = await pickTools(userInput, allTools, {
  maxCandidates: 3,
  minScore: 0.1,
  allowUnsafe: false,
  debug: true,
});

console.log('Selected tools:', candidates.map(c => `${c.tool.definition.name} (${c.score})`));

// 3. Send only top 3 to LLM
const selectedToolClasses = candidates.map(c => c.tool);
const toolInstances = await llmClient.toolCall(
  { model: 'gpt-4', messages: [{ role: 'user', content: userInput }] },
  selectedToolClasses
);

// 4. Execute chosen tools
for (const tool of toolInstances) {
  const result = await tool.run();
  console.log(result);
}
```

This approach keeps token costs low, LLM accuracy high, and provides full audit trails for tool selection and execution.
