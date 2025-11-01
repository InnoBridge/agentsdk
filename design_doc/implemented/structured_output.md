# Structured Output

## Overview
Structured output is how we turn natural-language completions into typed DTOs that behave like any other domain object.  
We declare the target class once, the decorator derives a JSON Schema from it, and we supply that schema alongside the prompt so the model returns JSON that already matches the class shape.  
Because `agentsdk` derives the schema directly from the class, the prompt contract, runtime types, and hydrated instances stay aligned without manual synchronization.

The runtime takes care of the heavy lifting:

- [`getSchema()`](../../src/tools/structured_output.ts) — emits the cached JSON Schema representation for the DTO. The `DTO` decorator attaches the canonical schema to the decorated class; schema assembly is performed by [`buildJSONFromSchema`](../../src/utils/structured_output_helper.ts).
- [`validate()`](../../src/tools/structured_output.ts) — checks a model response against that schema and reports repair attempts or Ajv errors. See [`validate()`](../../src/tools/structured_output.ts) for the implementation (it uses Ajv and returns a `ValidatedResult`).
- [`hydrate()`](../../src/tools/structured_output.ts) — turns the validated payload back into a real instance, traversing arrays and nested DTOs recursively. The runtime entry [`hydrate()`](../../src/tools/structured_output.ts) delegates to [`hydrateWithConstructor`](../../src/utils/structured_output_helper.ts) and the property helpers (`buildPropertyArgument`) to construct instances.

The result: callers consume DTO instances, not brittle strings or ad-hoc parsers.

## Architecture
Structured output spans a slim runtime plus supporting helpers. The diagram below highlights the main pieces and their responsibilities.

```
┌────────────────────┐       ┌──────────────────────────┐       ┌────────────────────┐
│ DTO Decorator (@DTO)│──────▶│ Schema Cache & Registry │◀──────│ Nested DTO Classes │
└──────────┬─────────┘       └──────────┬───────────────┘       └──────────┬─────────┘
           │                               ▲                                 │
           ▼                               │                                 ▼
┌────────────────────┐       ┌──────────────────────────┐       ┌────────────────────┐
│ StructuredOutput    │──────▶│ Validator (Ajv wrapper) │──────▶│ Hydrator           │
│ base class          │       └──────────────────────────┘       │ (constructor args) │
└────────────────────┘                                           └────────────────────┘
```

- **[`DTO` decorator](../../src/tools/structured_output.ts)** captures constructor metadata and the declared schema fragment, then registers the class by constructor and logical name.
- **Schema cache and registry** map DTO names to their schema definitions and constructors. [`getSchema()`](../../src/tools/structured_output.ts) recursively walks nested `StructuredOutput` classes to inline their schemas so downstream providers receive a complete document in one call.
- **StructuredOutput base** exposes the public API (`getSchema()`, `validate()`, `hydrate()`) and orchestrates validation plus hydration.
- **Validator** wraps Ajv with lazy compilation, optional JSON parsing, and a consistent `{ valid, payload, errors }` response shape.
- **Hydrator** prepares constructor arguments property-by-property, handling arrays, nested DTOs, and primitive coercion before invoking the original constructor with `Reflect.construct`. [`hydrate()`](../../src/tools/structured_output.ts) recursively instantiates nested `StructuredOutput` objects straight from the LLM response so complex graphs materialize automatically.

External layers—such as [`OllamaClient.toStructuredOutput`](../../src/client/ollama_client.ts)—consume this API by retrieving the schema, submitting it to the provider, and passing the raw response back through `validate()` and `hydrate()`.

## How it works
1. **Runtime schema generation**  
    Decorated classes expose [`StructuredOutput.getSchema()`](../../src/tools/structured_output.ts). The schema is built once when the decorator runs by walking the class metadata supplied to [`@DTO`](../../src/tools/structured_output.ts); schema assembly is implemented in [`buildJSONFromSchema`](../../src/utils/structured_output_helper.ts).

2. **Validation**  
    [`StructuredOutput.validate()`](../../src/tools/structured_output.ts) compiles the schema with Ajv. You can pass either a JSON string or a pre-parsed object; see the implementation in `../../src/tools/structured_output.ts` which returns a `ValidatedResult` and records any repair attempts.

3. **Hydration**  
    [`StructuredOutput.hydrate()`](../../src/tools/structured_output.ts) converts the (validated) payload into a class instance. The runtime `hydrate()` delegates to [`hydrateWithConstructor`](../../src/utils/structured_output_helper.ts) and helpers such as [`buildPropertyArgument`](../../src/utils/structured_output_helper.ts) to recursively hydrate nested DTOs and arrays.

## Declaring a DTO
Use the `@DTO` annotation and extend `StructuredOutput`.  
The decorator stores schema metadata and registers the class so nested references can be resolved later.

```ts
import { DTO, StructuredOutput } from "@/tools/structured_output";
import { array } from "@/models/structured_output";

@DTO({
    type: "object",
    name: "AdditionOperation",
    description: "Represents an addition operation.",
    properties: {
        operand1: { type: "number", description: "First operand." },
        operand2: { type: "number", description: "Second operand." },
    },
    required: ["operand1", "operand2"],
})
class AdditionOperation extends StructuredOutput {
    constructor(readonly operand1: number, readonly operand2: number) {
        super();
    }
}

@DTO({
    type: "object",
    name: "ArithmeticOperations",
    description: "A bundle of operations and a semantic summary.",
    properties: {
        arithmeticOperations: array(AdditionOperation), // array helper
        semanticOperation: AdditionOperation,           // nested DTO
    },
    required: ["semanticOperation"],
})
class ArithmeticOperations extends StructuredOutput {
    constructor(
        readonly arithmeticOperations: AdditionOperation[],
        readonly semanticOperation?: AdditionOperation,
    ) {
        super();
    }
}
```

### Supported property types
- Primitive schemas use an object with `type` (e.g. `"string"`, `"number"`, `"boolean"`) plus optional metadata like `description` or `enum`.
- DTO classes that extend `StructuredOutput` (nested objects).
- Arrays of primitives or DTOs via the `array()` helper.
- Raw JSON schema fragments for advanced scenarios.

### Defining enums
Use the `enum()` helper exported from `src/models/structured_output.ts`. Provide a non-empty array of allowed values along with the primitive `type` and any descriptive metadata.

```ts
import { enum as enumSchema } from "@/models/structured_output";

enum TemperatureUnit {
    Celsius = "celsius",
    Fahrenheit = "fahrenheit",
}

@DTO({
    type: "object",
    name: "TemperatureReading",
    description: "DTO representing a temperature measurement with an explicit unit.",
    properties: {
        temperature: { type: "number", description: "Numeric temperature reading." },
        temperatureUnit: enumSchema({
            type: "string",
            description: "Unit associated with the reading.",
            enum: Object.values(TemperatureUnit),
        }),
    },
    required: ["temperature", "temperatureUnit"],
})
class TemperatureReading {
    temperature: number;
    temperatureUnit: string;

    constructor(
        temperature: number,
        temperatureUnit: string,
    ) {
        this.temperature = temperature;
        this.temperatureUnit = temperatureUnit;
    }
}
```

### Defining arrays
Use the helper exported from `src/models/structured_output.ts`:

```ts
import { array } from "@/models/structured_output";

@DTO({
    ...,
    properties: {
        tags: array({ type: "string" }),
        steps: array(Step),    // Step must also be a StructuredOutput subclass
    },
})
```

### Defining nested types
Reference another decorated class directly in `properties`.  
The decorator registers every DTO by both its class name and schema `name`, so hydration can resolve nested objects:

```ts
@DTO({ ..., properties: { semanticOperation: AdditionOperation } })
class ArithmeticOperations extends StructuredOutput { ... }
```

Make sure the nested class is imported somewhere in the module graph so its decorator runs before hydration.

### Hydrating the response
```ts
const recipe = await llmResponse();          // JSON or string from provider
const hydrated = ArithmeticOperations.hydrate(recipe);

if (hydrated) {
    hydrated.arithmeticOperations[0].operand1; // fully typed
}
```

Validation can run beforehand:
```ts
const result = ArithmeticOperations.validate(recipe);
if (!result.valid) {
    console.error(result.errors);
}
```

### Using the LLM client helpers
Before an LLM call can round-trip into a DTO, the target class must be decorated with [`@DTO`](../../src/tools/structured_output.ts) so the runtime has a schema to send to the provider. Once the decorator runs, pass the class to [`OllamaClient.toStructuredOutput`](../../src/client/ollama_client.ts) to receive a hydrated instance, or to [`OllamaClient.toStructuredOutputRaw`](../../src/client/ollama_client.ts) when you want the raw JSON string.

```ts
const ollamaClient = /* create or retrieve your OllamaClient */;

const arithmetic = await ollamaClient.toStructuredOutput(
    {
        model: "llama3",
        messages: [
            { role: "system", content: "Answer in JSON" },
            { role: "user", content: "Add 2 and 2, then summarize it" },
        ],
    },
    ArithmeticOperations,
);

// arithmetic is an instance of ArithmeticOperations when validation succeeds.

const rawJson = await ollamaClient.toStructuredOutputRaw(
    {
        model: "llama3",
        messages: [
            { role: "user", content: "Add 5 and 7" },
        ],
    },
    ArithmeticOperations,
);
// rawJson is the model's JSON string response; hydrate later if needed.
```

## End-to-end flow with an LLM
1. Request the schema: `const schema = ArithmeticOperations.getSchema()`.
2. Provide the schema to the model (e.g. `OllamaClient.toStructuredOutput` sets `request.format = schema`).
3. Validate the response.
4. Hydrate into DTOs for downstream logic.

## Runtime internals
- **Decorator**: `@DTO` captures the constructor signature plus the provided schema fragment. The decorator registers the class by constructor and schema `name`, so recursive hydration can find the right type even when the response nests DTOs several levels deep.
- **Schema cache**: Schemas are generated once, stored on the decorated constructor, and reused for every call site. This keeps `getSchema()` fast and guarantees that validation and hydration share the same shape.
- **Validator**: `StructuredOutput.validate()` lazily creates an Ajv instance per class. The helper accepts strings or objects, parses when needed, and centralizes Ajv error reporting so callers receive a concise `{ valid, errors }` result.
- **Hydrator**: `StructuredOutput.hydrate()` funnels each property through `buildPropertyArgument()`. Primitives are returned as-is, DTO references recurse into `hydrate()`, and arrays map over each element.
- **Constructor dispatch**: Once every argument is prepared, `hydrateWithConstructor()` invokes the original class constructor using `Reflect.construct`, which preserves prototypes and methods.

## Type coercion details
LLM responses frequently serialize every value as a string. The hydrator compensates for this so constructors receive the expected types:

- Numeric strings (e.g. `"4"`, `"3.14"`) are coerced to numbers when the schema declares `"number"`.
- Boolean strings (`"true"`, `"false"`, case insensitive) become booleans for `"boolean"` properties.
- Invalid literals are surfaced as hydration errors. We intentionally do not coerce other primitives to avoid hiding unexpected shapes.

```ts
// Given schema property type "number"
const payload = { operand1: "2", operand2: "40" };
const result = AdditionOperation.hydrate(payload);
// result?.operand1 === 2, operand2 === 40 (numbers)
```

## Error handling & diagnostics
- Validation failures include the raw Ajv errors for debugging, but runtime no longer prints console logs. Call sites decide how to surface issues.
- Hydration errors throw with the DTO class name to reduce guesswork when multiple schemas participate in a single response.
- When parsing a string payload fails, `validate()` and `hydrate()` both bubble a descriptive error so upstream can fall back to plain text handling.

## Best practices
- **Always validate before hydrating.** `validate()` explains what the model returned, while `hydrate()` assumes the payload conforms to the schema.
- **Import every DTO.** Tree-shaking can elide unused classes; ensure nested DTOs are referenced so their decorators execute before hydration.
- **Annotate optional fields.** Keep `required` arrays and constructor signatures aligned so the DTO mirrors runtime expectations.
- **Guide the model.** Combine the schema with concise, imperative instructions to improve adherence and reduce repair work.

## Future work
- **`anyOf`**: Still unsupported; handling discriminated unions would require broader changes to hydration and constructor mapping. Keeping this out of scope for now avoids ambiguous runtime shapes.
