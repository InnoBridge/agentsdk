## Tools

Tools give the agent a deterministic runtime mechanism to execute code at its disposal. The implementation intentionally piggybacks on the structured-output runtime: `ToolComponent` inherits `StructuredOutput`, so every tool automatically exposes the same `getSchema()`, `validate()`, and `hydrate()` helpers that DTOs use. On top of that shared base we layer the tool-specific `run()` execution hook.

### Architecture

```
┌──────────────────────┐        ┌────────────────────────┐
│  @Tool Decorator     │ ─────▶ │  ToolComponent (SO)    │
│  (wrap class)        │        │  inherits StructuredOutput
└─────────┬────────────┘        └─────────┬──────────────┘
          │                                │
          ▼                                ▼
┌──────────────────────┐        ┌────────────────────────┐
│  Schema Metadata     │ ◀────┐ │  Runtime Hooks         │
│  (reuse getSchema)   │      │ │  validate / hydrate    │
└─────────┬────────────┘      │ └─────────┬──────────────┘
          │                   │           │
          ▼                   │           ▼
┌──────────────────────┐      │  ┌──────────────────────┐
│  Provider Adapters   │──────┘  │  async run()         │
│  (Ollama, etc.)      │         │  tool logic          │
└──────────────────────┘         └──────────────────────┘
```

- **@Tool decorator** clones the user class, wraps it with `ToolComponent`, and preserves methods/static members so execution logic stays untouched.
- **ToolComponent** is `StructuredOutput` plus the `run()` contract, so tools reuse the DTO pipeline for schema caching, validation, and hydration.
- **Schema metadata** lives on the decorated class (same symbol slot as structured output); provider adapters call `getSchema()` / `validate()` / `hydrate()` exactly the same way they do for DTOs.
- **Provider adapters** translate the authoritative `ToolDefinition` into provider-specific payloads and drive the lifecycle: translate → call model → hydrate → `run()`.

### Building blocks in the codebase

- **[`@Tool`](../../src/tools/tool.ts) decorator**
  - Returns a runtime subclass of `ToolComponent`. The decorator reuses the structured-output machinery in [`BaseStructuredOutput`](../../src/tools/structured_output.ts) to wrap the user-supplied class, so the decorated class inherits `getSchema()`, `validate()`, and `hydrate()` from `StructuredOutput` in addition to the tool-specific `run()` method.
  - Concrete runtime hooks provided:
    1. Static metadata accessor: `static getToolSchema()` backed by the same `schemaMetadata` symbol used for DTOs — the single source of truth consumed by provider adapters, registries, and audits.
    2. Constructor contract: decorator-synthesised subclass accepts a validated argument object that matches the JSON Schema returned by `getSchema()`.
    3. Execution entrypoint: `async run(params?: unknown): Promise<unknown>` — orchestrators invoke this after hydration.
    4. Validation surface: tools inherit `validate()` from `StructuredOutput`, so providers can call `toolClass.validate(arguments)` before instantiation.
    5. Hydration surface: tools inherit `hydrate()` which delegates to the shared constructor hydrator (handling nested DTOs, arrays, etc.).
    6. Policy/provenance hooks: the stored metadata (including optional flags such as `strict`) is available for auditing and safety checks.
  - Metadata storage uses a dedicated symbol on the constructor (and `Reflect.defineMetadata` when available) so definitions remain non-enumerable and resistant to accidental overwrite.

  Why this design:
  - Symbols are non-enumerable and won't collide with user-defined properties on the class or instance. Storing the definition on a Symbol keeps the runtime slot private and resilient to accidental overwrites.

    Reading the definition (recommended):
    - The decorator exposes a stable accessor `static getToolSchema()` on the decorated class. Consumers should call that method to retrieve the authoritative `ToolDefinition` rather than reading private fields directly. Example:

      ```ts
      const def = MyTool.getToolSchema?.();
      if (def) {
        // use def for translation/validation/audit
      }
      ```

    Implementation notes and best-practices:
    - The codebase creates a unique symbol (e.g. `const toolMetadata = Symbol('tool:definition')`) and uses it as the fallback storage key: `(Decorated as any)[toolMetadata] = toolDefinition`.
    - When `Reflect.defineMetadata` exists the decorator will call it as `Reflect.defineMetadata('tool:definition', toolDefinition, Decorated)` so other metadata-aware libraries can see it.
    - The decorator should freeze the stored definition (e.g., `Object.freeze(toolDefinition)`) to prevent accidental runtime mutation. Registries that need to annotate or cache derived data should keep separate maps instead of mutating the definition.
    - Avoid serializing class-level metadata into JSON. If you need to persist metadata, read it via `getToolSchema()` and serialize the returned object explicitly; do not attempt to serialize the class itself.
    - If you attach additional runtime artifacts (compiled validators, precomputed scorers), prefer attaching them to the same symbol slot as separate properties (for example `{ definition, validator }`) or store them in an external WeakMap keyed by the class to avoid accidental exposure or serialization.

  Security and bundling implications:
  - Tree-shaking (brief): modern bundlers (webpack, rollup, esbuild) remove unused exports and modules from the final bundle to reduce size. Because symbol-backed metadata is attached at runtime to the class object, if a tool class is completely unused and eliminated by the bundler, its metadata won't be present in the bundle either.
  - Practical note: if your application imports modules solely to register tools (for example, a central registry imports `./tools/*` to build a catalog), the bundler will keep those modules and their metadata because they're referenced. In short: unused classes are removed; explicitly imported/registered classes remain and so does their metadata.
    - The Reflect fallback requires the `reflect-metadata` polyfill in environments that don't provide `Reflect.getMetadata`/`defineMetadata`. The decorator's fallback means tests and simple builds don't need the polyfill, but production builds that rely on other metadata consumers may still include it.
  - Registries and clients should read the stored definition via the decorator's documented accessor (see the `@Tool` section above) rather than reaching into internals.

  ```ts
  import { enumToSchema } from "@/models/structured_output";

  enum TemperatureUnit {
    CELSIUS = "C",
    FAHRENHEIT = "F",
  }

  @Tool({
    type: "function",
    name: "get_current_weather",
    description: "Get the current weather for a given location",
    parameters: {
      location: {
        type: "string",
        description: "The name of the city e.g. San Francisco, CA",
      },
      unit: enumToSchema({
        type: "string",
        enum: TemperatureUnit,
        description: "The temperature unit to return the weather in (C or F)",
      }),
    },
    required: ["location", "unit"],
  })
  class WeatherTool {
    // Implement the tool's functionality here

    async run(): Promise<string> {
        // Placeholder implementation
        return `The current weather in.`;
    }
  };
  ```

 - **[`ToolComponent`](../../src/tools/tool.ts) contract**
  - Every decorated class becomes a `ToolComponent` subclass at runtime. Constructors receive the validated argument object (the authoritative payload); runtime helpers never rely on positional arguments.
  - Implementations must override `async run(params?: unknown): Promise<unknown>`; the base implementation is a no-op that returns `undefined`. Using `unknown` encourages each tool to validate or narrow the payload before use.
  - See the `@Tool` decorator section above for details on retrieving the stored `ToolDefinition`.

  The authoritative `ToolComponent` implementation lives in `src/models/structured_output.ts`; for reference the exported type and basic runtime look like:

  ```ts
  // from src/models/structured_output.ts
  type JsonSchema = Record<string, unknown>;

  interface ToolDefinition {
    name?: string;
    description?: string;
    type?: string;
    parameters?: {
      type?: string;
      items?: unknown;
      properties?: JsonSchema;
      required?: string[];
      additionalProperties?: boolean;
    };
    strict?: boolean;
  }

  class ToolComponent extends StructuredOutput {
    static getToolSchema?: () => ToolDefinition | undefined;

    async run(params?: unknown): Promise<unknown> {
      return undefined;
    }
  }
  ```

 - **Authoritative definition ([`ToolDefinition`](../../src/models/structured_output.ts))**
  - "Authoritative" here means the single source-of-truth for a tool's metadata and parameter schema: it is stored verbatim on the decorated class and is used for validation, provider translations, and auditing.
  - The definition captures the tool's `name`, optional `description`, the original provider `type`, and (when supplied) a JSON Schema for parameters, including nested property definitions and `required` fields. All members are optional to support escape hatches, but production tools should populate the full structure.
  - `parameters` is treated as required for production tools. If authors deliberately omit them (e.g., by setting `allowNoSchema` in the original `SchemaDefinition`), downstream systems should treat the tool as unvalidated and enforce additional guardrails.

### Authoritative schema and validation policy (deferred)

> The authoritative schema and validation guidance has been intentionally deferred for now because current LLM/provider outputs are frequently inconsistent and do not reliably produce well-formed `tool_call` arguments. Implementing a strict, repo-level parse → validate → instantiate pipeline before provider behavior stabilizes would cause frequent operational failures and noisy errors. The full policy is recorded under "Outstanding work" as a deferred task; see that section for the exact policy points and next steps.

### Provider integration status

- **[`Ollama`](../../src/client/ollama_client.ts)**
  - Translation: implemented. `mapToolSchemaToTool` reshapes each `getToolSchema()` result into the `{ type: 'function', function: { … } }` payload that Ollama expects (and `mapSchemaToToolParameters` flattens the nested JSON Schema into `parameters`).
  - Dispatch: implemented. `toolCall` attaches the mapped tools to the chat request and sends it through the SDK (logging both the request and response for now).
  - Hydration & execution: implemented but minimal. After receiving `tool_calls`, the client looks up the matching class by schema name, calls `validate(toolCall.function.arguments)` (inherited from `StructuredOutput`) and, if valid, invokes `hydrate(toolCall)` to produce a tool instance before finally calling `run()`. Because validation still depends on provider output quality, individual tools should defensively handle malformed payloads.

- **OpenAI / Anthropic**
  - Translation: trivial (flat `{ name, description, parameters, strict }`) but no client exists yet. Future adapters will be responsible for translating definitions and invoking their respective SDKs in the same way Ollama does.

### Expected tool-calling flow

1. **Catalog & registration** – Tool classes are defined with `@Tool({ … })` and imported so the decorator can attach metadata.
2. **Selection (optional)** – Large catalogs can be filtered with the `pickTools` proposal (`design_doc/proposals/picktools.md`) before sending definitions to the model.
3. **Translate** – Provider clients reshape the authoritative definitions into the provider-specific format (already implemented for Ollama).
4. **Dispatch** – The client includes the translated definitions in the chat request and calls the provider SDK.
5. **Hydrate** – For each `tool_call` in the response, we currently hand the raw provider payload to the tool’s static `hydration` helper (if one is defined) and let the tool decide how to interpret it. There is no framework-level parsing or schema validation yet.
6. **Execute** – The orchestrator decides when to invoke `tool.run()` on hydrated instances so that approval workflows or safety policies can intervene before side effects occur. Because we do not enforce validation today, individual tools should defensively check their inputs before performing side effects.

Example (`OllamaClient.toolCall`):

```ts
async toolCall(input: ChatRequest, tools: Array<typeof ToolComponent>): Promise<ToolComponent[]> {
  // 1) Build a lookup from tool name -> class so we can hydrate later
  const registry = new Map<string, typeof ToolComponent>();
  tools.forEach((toolClass) => {
    const def = toolClass.getToolSchema?.();
    if (def?.name) registry.set(def.name, toolClass);
  });

  // 2) Translate authoritative definitions into the provider shape
  input.tools = tools
    .map((toolClass) => toolClass.getToolSchema?.())
    .filter((def): def is ToolDefinition => !!def)
    .map(mapToolSchemaToTool);

  // 3) Dispatch the request
  const response = await this.chat({ ...input, stream: false });

  // 4) Hydrate each tool_call into a ToolComponent instance (no shared parsing yet)
  return (response.message.tool_calls ?? [])
    .map((toolCall) => registry.get(toolCall.function.name)?.hydration?.(toolCall))
    .filter((instance): instance is ToolComponent => instance !== undefined);
}
```

Future iterations will insert parse/validate steps between stages (2) and (4) once provider outputs stabilize.

Usage example (calling the client and executing the hydrated tools):

```ts
import { ChatRequest } from 'ollama';
import { OllamaClient } from '@/client/ollama_client';
import { WeatherTool } from '@/examples/tools/weather';
import { BraveSearchTool } from '@/examples/tools/brave_search';

const client = new OllamaClient('http://127.0.0.1:11434');

const input: ChatRequest = {
  model: 'qwen3-coder:30b',
  messages: [
    { role: 'user', content: 'Is AWS still down, and what is the weather in NYC?' },
  ],
};

const hydratedTools = await client.toolCall(input, [WeatherTool, BraveSearchTool]);

for (const toolInstance of hydratedTools) {
  const result = await toolInstance.run();
  console.log('tool result:', result);
}
```

If the provider returns malformed arguments, a tool’s `hydration` helper should either repair the payload before instantiation or throw so the orchestrator can decide whether to retry or skip execution.

### Hydration status (current vs. planned)

**Current behavior**
- Provider clients (for example `OllamaClient.toolCall`) collect the raw `tool_call` payloads and hand them to each tool’s `static hydration` method when present.
- Tool-specific hydrators are responsible for reading `toolCall.function.arguments` and constructing an instance. There is no shared parsing, JSON conversion, or schema validation step.
- If a tool does not implement `static hydration`, the client skips instantiation for that call.

**Planned improvements**
- Introduce a shared parse → validate → instantiate pipeline so tools receive typed, validated argument objects.
- Add provenance capture (original payload, parse/validation outcomes) so orchestrators can reason about failures and apply policy.
- Fail closed when no schema is provided unless a tool explicitly opts into `allowNoSchema`.

### Safety, provenance, and policy hooks

- Authoritative schemas live on the class for auditing. Registrations should fail-closed when a schema is missing unless `allowNoSchema` is explicitly enabled with a constrained `noSchemaMode`.
- Hydration must capture provenance: original arguments, validation results, repairs, and the mapping between provider tool IDs and tool classes. This data powers debugging, UI traces, and compliance reviews.
- Decorator metadata is extensible; additional safety or capability annotations can be added without changing the runtime contract, enabling policy-driven selection and execution filters.

### Current gaps and risks

- **Constructor contract drift** – The design expects constructors to accept a validated argument object, but many examples still use positional parameters. Until we align on an object-based convention (or add translation helpers), hydration logic must adapt per tool class.
- **No shared parse/validation** – Provider payloads are forwarded straight into each tool’s `hydration` method. Without at least a tolerant JSON parse, malformed arguments surface as runtime errors deep inside tools.
- **Sparse observability** – We currently drop hydration failures on the floor (returning `undefined`). Recording structured errors will make it easier to debug mis-specified tools or provider regressions.

### Outstanding work

1. Upgrade `OllamaClient.toolCall` (and future clients) with the shared parse → validate → instantiate pipeline described above.
2. Decide on the validator integration strategy (eager compile during decoration vs. lazy compile at hydration) and apply it consistently once model output stabilizes.
3. Add OpenAI/Anthropic client adapters that reuse the authoritative metadata and future hydration pipeline.
4. Provide unit tests that cover tool-specific hydrators today and the shared pipeline once it exists.
5. Implement the default keyword scorer in `src/tools/pickTools.ts` so request-time filtering can rely on concrete code instead of the design doc.
6. Deferred: authoritative schema & validation policy

  The authoritative schema and validation policy is deferred until provider behavior is more stable. When implemented, it should include:

  1. Parse → validate → instantiate is the required sequence. Provider payloads must be parsed (handling stringified JSON), validated against the authoritative schema, and only then used to construct the tool instance.
  2. Validators are intentionally pluggable. The repository includes an example helper (`src/tools/tool_decorator_example.md`) illustrating how to compile and attach a validator, but the production code does not force a particular library.
  3. Validation failures should produce structured errors (and optionally a single repair attempt) before rejecting the tool call. Executing a tool with unvalidated arguments is considered unsafe.
  4. Provider translations must operate on copies; the authoritative schema stored on the class remains untouched for auditing and future validations.

### Related references

- [`src/tools/tool.ts`](../../src/tools/tool.ts) – decorator, `ToolComponent`, and authoritative definition implementation
- [`src/client/ollama_client.ts`](../../src/client/ollama_client.ts) – provider adapter that already maps authoritative definitions to Ollama
- [`design_doc/proposals/picktools.md`](../../design_doc/proposals/picktools.md) – tool selection and scoring proposal that feeds the tool-calling flow
