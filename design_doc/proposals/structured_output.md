# Structured Output

## Overview
Structured output is how we turn natural-language completions into typed DTOs that behave like any other domain object.  
We declare the target class once, the decorator derives a JSON Schema from it, and we supply that schema alongside the prompt so the model returns JSON that already matches the class shape.  
Because `agentsdk` derives the schema directly from the class, the prompt contract, runtime types, and hydrated instances stay aligned without manual synchronization.

The runtime takes care of the heavy lifting:

- `getSchema()` emits the cached JSON Schema representation for the DTO.
- `validate()` checks a model response against that schema and reports repair attempts or Ajv errors.
- `hydrate()` turns the validated payload back into a real instance, traversing arrays and nested DTOs recursively.

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

- **DTO decorator (`src/tools/structured_output.ts`)** captures constructor metadata and the declared schema fragment, then registers the class by constructor and logical name.
- **Schema cache and registry** map DTO names to their schema definitions and constructors so `getSchema()` stays fast and nested references resolve during hydration.
- **StructuredOutput base** exposes the public API (`getSchema()`, `validate()`, `hydrate()`) and orchestrates validation plus hydration.
- **Validator** wraps Ajv with lazy compilation, optional JSON parsing, and a consistent `{ valid, payload, errors }` response shape.
- **Hydrator** prepares constructor arguments property-by-property, handling arrays, nested DTOs, and primitive coercion before invoking the original constructor with `Reflect.construct`.

External layers—such as `OllamaClient.toStructuredOutput`—consume this API by retrieving the schema, submitting it to the provider, and passing the raw response back through `validate()` and `hydrate()`.

## How it works
1. **Runtime schema generation**  
   Decorated classes expose `StructuredOutput.getSchema()`. The schema is built once when the decorator runs by walking the class metadata supplied to `@DTO`.

2. **Validation**  
   `StructuredOutput.validate()` compiles the schema with Ajv. You can pass either a JSON string or a pre-parsed object; the helper returns whether the payload is valid plus any repair attempts and Ajv errors.

3. **Hydration**  
   `StructuredOutput.hydrate()` converts the (validated) payload into a class instance. Nested DTOs and arrays are hydrated recursively so consumers receive fully typed objects.

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
        operand1: "number",
        operand2: "number",
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
- Primitive literals: `"string"`, `"number"`, `"boolean"`.
- DTO classes that extend `StructuredOutput` (nested objects).
- Arrays of primitives or DTOs via the `array()` helper.
- Raw JSON schema fragments for advanced scenarios.

### Defining arrays
Use the helper exported from `src/models/structured_output.ts`:

```ts
import { array } from "@/models/structured_output";

@DTO({
    ...,
    properties: {
        tags: array("string"),
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
- **Enum support**: OpenAI’s structured output API accepts enumerations. We can extend `SchemaValue` and the schema builder to accept enum literals (e.g. `enum: ['add', 'subtract']`) and surface them through the decorator.
- **`anyOf`**: Still unsupported; handling discriminated unions would require broader changes to hydration and constructor mapping. Keeping this out of scope for now avoids ambiguous runtime shapes.
