## Tools

Tools give the agent a deterministic runtime mechanism to execute code at its disposal. This note captures what currently exists in the repository and what still needs to be built before tool calling is fully functional.

### Building blocks in the codebase

- **[`@Tool`](../../src/tools/tool.ts) decorator**
  - Returns a runtime subclass of `ToolComponent`. Authors do **not** need to extend `ToolComponent` themselves; the decorator synthesizes a class that `extends ToolComponent`, invokes the original constructor, copies prototype methods, and preserves static members so decorated classes keep their behavior plus the runtime hooks.
  - Attaches the authoritative definition to the decorated class using a symbol-backed metadata slot (`toolMetadata`). If `Reflect.defineMetadata` is available it is used, otherwise the symbol path is taken so consumers do not need `reflect-metadata`.
  - Exposes a static `getDefinition()` helper on the decorated class so registries and clients can read the stored definition without reaching into internals.

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
  - `ToolComponent.getDefinition()` is available on any decorated class and returns the stored `ToolDefinition`.

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

### Authoritative schema and validation policy

1. **Parse → validate → instantiate** is the required sequence. Provider payloads must be parsed (handling stringified JSON), validated against the authoritative schema, and only then used to construct the tool instance.
2. Validators are intentionally pluggable. The repository includes an example helper (`src/tools/tool_decorator_example.md`) illustrating how to compile and attach a validator, but the production code does not force a particular library.
3. Validation failures should produce structured errors (and optionally a single repair attempt) before rejecting the tool call. Executing a tool with unvalidated arguments is considered unsafe.
4. Provider translations must operate on copies; the authoritative schema stored on the class remains untouched for auditing and future validations.

### Provider integration status

- **[`Ollama`](../../src/client/ollama_client.ts)**
  - Translation: implemented. `mapToolDefinitionToTool` reshapes the authoritative definition into Ollama’s nested `{ type: 'function', function: { … } }` payload so it can be passed directly into the SDK request.
  - Dispatch: implemented. `toolCall` attaches the mapped tools to the chat request and sends it through the SDK (logging both the request and response for now).
  - Hydration: **pending**. `toolCall` currently returns an empty array; parse/validate/instantiate still needs to be wired in so callers receive hydrated `ToolComponent` instances.

- **OpenAI / Anthropic**
  - Translation: trivial (flat `{ name, description, parameters, strict }`) but no client exists yet. Future adapters will be responsible for translating definitions and invoking their respective SDKs in the same way Ollama does.

### Expected tool-calling flow

1. **Catalog & registration** – Tool classes are defined with `@Tool({ … })` and imported so the decorator can attach metadata.
2. **Selection (optional)** – Large catalogs can be filtered with the `pickTools` proposal (`design_doc/proposals/picktools.md`) before sending definitions to the model.
3. **Translate** – Provider clients reshape the authoritative definitions into the provider-specific format (already implemented for Ollama).
4. **Dispatch** – The client includes the translated definitions in the chat request and calls the provider SDK.
5. **Hydrate** – For each `tool_call` in the response, parse the arguments, validate them against the authoritative schema, and instantiate the corresponding `ToolComponent`. This step is the next major piece of work.
6. **Execute** – The orchestrator decides when to invoke `tool.run()` on hydrated instances so that approval workflows or safety policies can intervene before side effects occur.

### Safety, provenance, and policy hooks

- Authoritative schemas live on the class for auditing. Registrations should fail-closed when a schema is missing unless `allowNoSchema` is explicitly enabled with a constrained `noSchemaMode`.
- Hydration must capture provenance: original arguments, validation results, repairs, and the mapping between provider tool IDs and tool classes. This data powers debugging, UI traces, and compliance reviews.
- Decorator metadata is extensible; additional safety or capability annotations can be added without changing the runtime contract, enabling policy-driven selection and execution filters.

### Outstanding work

1. Implement hydration inside `OllamaClient.toolCall` so it returns hydrated `ToolComponent[]` (parse, validate, instantiate).
2. Decide on the validator integration strategy (eager compile during decoration vs. lazy compile at hydration) and apply it consistently.
3. Add OpenAI/Anthropic client adapters that reuse the authoritative metadata and hydration pipeline.
4. Provide unit tests for parse/validate/instantiate (success and failure paths) and integration coverage once hydration lands.
5. Implement the default keyword scorer in `src/tools/pickTools.ts` so request-time filtering can rely on concrete code instead of the design doc.

### Related references

- [`src/tools/tool.ts`](../../src/tools/tool.ts) – decorator, `ToolComponent`, and authoritative definition implementation
- [`src/client/ollama_client.ts`](../../src/client/ollama_client.ts) – provider adapter that already maps authoritative definitions to Ollama
- [`design_doc/proposals/picktools.md`](../../design_doc/proposals/picktools.md) – tool selection and scoring proposal that feeds the tool-calling flow
