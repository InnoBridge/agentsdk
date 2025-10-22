## Tools

Tools give the agent a deterministic runtime mechanism to execute code at its disposal.

### Building blocks in the codebase

- **[`@Tool`](../../src/tools/tool.ts) decorator**
  - Returns a runtime subclass of `ToolComponent`. The `@Tool` decorator synthesizes a runtime subclass that extends `ToolComponent`, so authors don't need to explicitly extend `ToolComponent` themselves. It invokes the original constructor, copies prototype methods, and preserves static members so decorated classes keep their behavior plus the runtime hooks.
  - Concrete runtime hooks provided (what "runtime hooks" means in practice):
    1. Static metadata accessor: `static getDefinition()` and the internal `toolMetadata` symbol slot — used for provider translation, auditing, and registries.
    2. Constructor/instantiation contract: decorator-synthesized subclass accepts the validated argument object as the instance input (used during hydrate → instantiate).
    3. Standard entrypoint: `async run(params?: unknown): Promise<unknown>` — the agreed execution method orchestrators call on hydrated instances.
    4. Validator attachment point (pluggable): a compiled validator can be attached at decoration or hydration time and invoked during parse→validate→instantiate.
    5. Policy & provenance hooks: stored definition and optional annotations (e.g., `allowNoSchema`, capability tags) are readable at runtime for safety checks, logging, and UI traces.
    6. Provider mapping link: provider clients map definitions to provider tool IDs; that mapping is captured at runtime to correlate provider `tool_call`s back to the class during hydration.
  - Attaches the authoritative definition to the decorated class using a symbol-backed metadata slot (`toolMetadata`). The implementation prefers `Reflect.defineMetadata` / `Reflect.getMetadata` when available (for environments that include the `reflect-metadata` polyfill), but falls back to writing the definition to a well-known Symbol property on the class when `Reflect` metadata isn't present. This avoids forcing a `reflect-metadata` dependency while still supporting environments that use it.

  Why this design:
  - Symbols are non-enumerable and won't collide with user-defined properties on the class or instance. Storing the definition on a Symbol keeps the runtime slot private and resilient to accidental overwrites.

    Reading the definition (recommended):
    - The decorator exposes a stable accessor `static getDefinition()` on the decorated class. Consumers should call that method to retrieve the authoritative `ToolDefinition` rather than reading private fields directly. Example:

      ```ts
      const def = MyTool.getDefinition?.();
      if (def) {
        // use def for translation/validation/audit
      }
      ```

    Implementation notes and best-practices:
    - The codebase creates a unique symbol (e.g. `const toolMetadata = Symbol('tool:definition')`) and uses it as the fallback storage key: `(Decorated as any)[toolMetadata] = toolDefinition`.
    - When `Reflect.defineMetadata` exists the decorator will call it as `Reflect.defineMetadata('tool:definition', toolDefinition, Decorated)` so other metadata-aware libraries can see it.
    - The decorator should freeze the stored definition (e.g., `Object.freeze(toolDefinition)`) to prevent accidental runtime mutation. Registries that need to annotate or cache derived data should keep separate maps instead of mutating the definition.
    - Avoid serializing class-level metadata into JSON. If you need to persist metadata, read it via `getDefinition()` and serialize the returned object explicitly; do not attempt to serialize the class itself.
    - If you attach additional runtime artifacts (compiled validators, precomputed scorers), prefer attaching them to the same symbol slot as separate properties (for example `{ definition, validator }`) or store them in an external WeakMap keyed by the class to avoid accidental exposure or serialization.

  Security and bundling implications:
  - Tree-shaking (brief): modern bundlers (webpack, rollup, esbuild) remove unused exports and modules from the final bundle to reduce size. Because symbol-backed metadata is attached at runtime to the class object, if a tool class is completely unused and eliminated by the bundler, its metadata won't be present in the bundle either.
  - Practical note: if your application imports modules solely to register tools (for example, a central registry imports `./tools/*` to build a catalog), the bundler will keep those modules and their metadata because they're referenced. In short: unused classes are removed; explicitly imported/registered classes remain and so does their metadata.
    - The Reflect fallback requires the `reflect-metadata` polyfill in environments that don't provide `Reflect.getMetadata`/`defineMetadata`. The decorator's fallback means tests and simple builds don't need the polyfill, but production builds that rely on other metadata consumers may still include it.
  - Registries and clients should read the stored definition via the decorator's documented accessor (see the `@Tool` section above) rather than reaching into internals.

  ```ts
  @Tool({
    type: "function",
    name: "get_current_weather",
    description: "Get the current weather for a given location",
    parameters: {
        location: {
            type: "string",
            description: "The name of the city e.g. San Francisco, CA"
        },
        format: {
            type: "string",
            enum: ["celsius", "fahrenheit"],
            description: "The format to return the weather in"
        },
        required: ["location", "format"]
    }
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

  The authoritative `ToolComponent` implementation lives in `src/tools/tool.ts`; for reference the exported type and basic runtime look like:

  ```ts
  // from src/tools/tool.ts
  type JsonSchema = Record<string, unknown>;

  interface ToolDefinition {
    type: "function";
    name: string;
    description?: string;
    parameters?: JsonSchema;
    allowNoSchema?: boolean;
    strict?: boolean;
  }

  class ToolComponent {
    constructor(..._args: any[]) {}

    static getDefinition?: () => ToolDefinition | undefined;

    async run(params?: unknown): Promise<unknown> {
      return undefined;
    }
  }
  ```

 - **Authoritative definition ([`ToolDefinition`](../../src/tools/tool.ts))**
  - "Authoritative" here means the single source-of-truth for a tool's metadata and parameter schema: it is stored verbatim on the decorated class and is used for validation, provider translations, and auditing.
  - The definition includes `type: "function"`, `name`, optional `description`, optional `parameters` JSON Schema, `strict` (for providers that support it), and `allowNoSchema` + `noSchemaMode` flags for the explicit escape hatch.
  - `parameters` is treated as required for production tools. If authors opt into `allowNoSchema`, the runtime expects downstream systems to mark the tool as unvalidated and enforce additional guardrails.

### Authoritative schema and validation policy (deferred)

> The authoritative schema and validation guidance has been intentionally deferred for now because current LLM/provider outputs are frequently inconsistent and do not reliably produce well-formed `tool_call` arguments. Implementing a strict, repo-level parse → validate → instantiate pipeline before provider behavior stabilizes would cause frequent operational failures and noisy errors. The full policy is recorded under "Outstanding work" as a deferred task; see that section for the exact policy points and next steps.

### Provider integration status

- **[`Ollama`](../../src/client/ollama_client.ts)**
  - Translation: implemented. `mapToolDefinitionToTool` reshapes the authoritative definition into Ollama’s nested `{ type: 'function', function: { … } }` payload so it can be passed directly into the SDK request.
  - Dispatch: implemented. `toolCall` attaches the mapped tools to the chat request and sends it through the SDK (logging both the request and response for now).
  - Hydration: implemented, but minimal. `toolCall` wires raw provider payloads into each tool class via `static hydration`. There is no shared parsing/validation yet, so tools must handle malformed arguments defensively.

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
    const def = toolClass.getDefinition?.();
    if (def?.name) registry.set(def.name, toolClass);
  });

  // 2) Translate authoritative definitions into the provider shape
  input.tools = tools
    .map((toolClass) => toolClass.getDefinition?.())
    .filter((def): def is ToolDefinition => !!def)
    .map(mapToolDefinitionToTool);

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
