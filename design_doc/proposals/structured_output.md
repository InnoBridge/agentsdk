## Structured Output

### Overview
Structured responses let us move beyond free-form text by validating the model’s reply against a schema. Instead of forcing each caller to wire format instructions manually, we expose an optional `toStructuredOutput` helper on `LLMClient`. When a provider supports schemas (e.g. Ollama JSON mode), the helper:

- accepts the standard chat request plus a parser/schema,
- injects provider-specific hints (like `format`),
- parses and validates the reply before returning it as typed data.

### Interface: `LLMClient`

```ts
import { ToolComponent } from '@/tools/tool';
import { ZodType, ZodTypeDef } from 'zod';

interface LLMClient {
  chat(input: any): Promise<any>;
  toolCall?(input: any, tools: Array<typeof ToolComponent>): Promise<ToolComponent[]>;
  toStructuredOutput?<TParsed>(
    input: any,
    schema: ZodType<TParsed, ZodTypeDef, any>,
  ): Promise<TParsed>;
  // stream?(...): Promise<void>;
  getModelInfo?(modelId: string): Promise<any>;
  getModels?(): Promise<string[]>;
  stop?(): Promise<void>;
}
```

- `TParsed` is inferred from the supplied schema (e.g. a Zod object). We specialize the signature around `ZodType` because it is the canonical validator in the SDK today.
- Providers that do not support structured replies simply omit the optional method.

### Implementation: `OllamaClient`

```ts
import { zodToJsonSchema } from 'zod-to-json-schema';

class OllamaClient extends SingletonComponent implements LLMClient {
  private client: Ollama;

  async toStructuredOutput<TParsed>(
    input: ChatRequest,
    schema: ZodType<TParsed, ZodTypeDef, any>,
  ): Promise<TParsed> {
    const request: ChatRequest = {
      ...input,
      format: zodToJsonSchema(schema),
      stream: false,
    };

    const response = await this.chat(request);
    const raw = response.message?.content;

    if (raw === undefined || raw === null) {
      throw new Error('Structured output response was empty.');
    }

    let candidate: unknown = raw;

    if (typeof raw === 'string') {
      try {
        candidate = JSON.parse(raw);
      } catch {
        throw new Error(
          'Failed to parse structured output as JSON. Ensure the model returns valid JSON matching the schema.',
        );
      }
    }

    return schema.parse(candidate);
  }
}
```

export interface ResponseFormatTextJSONSchemaConfig {
  /**
   * The name of the response format. Must be a-z, A-Z, 0-9, or contain underscores
   * and dashes, with a maximum length of 64.
   */
  name: string;

  /**
   * The schema for the response format, described as a JSON Schema object. Learn how
   * to build JSON schemas [here](https://json-schema.org/).
   */
  schema: { [key: string]: unknown };

  /**
   * The type of response format being defined. Always `json_schema`.
   */
  type: 'json_schema';

  /**
   * A description of what the response format is for, used by the model to determine
   * how to respond in the format.
   */
  description?: string;

  /**
   * Whether to enable strict schema adherence when generating the output. If set to
   * true, the model will always follow the exact schema defined in the `schema`
   * field. Only a subset of JSON Schema is supported when `strict` is `true`. To
   * learn more, read the
   * [Structured Outputs guide](https://platform.openai.com/docs/guides/structured-outputs).
   */
  strict?: boolean | null;
}

### Usage

@Data({
    name: string,
    description: string
})
class MeetingSchema {
    private topic: string;
    private attendees: string[];
    actionItems: ActionItem[];

    constructor(topic: string, attendees: string[], actionItems: ActionItem[]) 
}

-> MeetingSchema extends StructuredOutput

class StructuredOutput {
    getSchema();
    hydrate()
}

```ts
import { z } from 'zod';
import { OllamaClient } from '@/client/ollama_client';

const MeetingSchema = z.object({
  topic: z.string(),
  attendees: z.array(z.string()),
  action_items: z.array(
    z.object({
      owner: z.string(),
      description: z.string(),
      due: z.string().optional(),
    }),
  ),
});

const client = OllamaClient.getInstance('http://localhost:11434');

const summary = await client.toStructuredOutput(
  {
    model: 'qwen3-coder:30b',
    messages: [
      { role: 'system', content: 'Reply with JSON containing topic, attendees, action_items.' },
      { role: 'user', content: 'Summarize the kickoff call with Sam and Priya.' },
    ],
  },
  MeetingSchema,
);

console.log(summary.topic);
```

### Notes
- Ollama exposes a `format` option for JSON Schema; `toStructuredOutput` converts the Zod schema to that representation.
- Returning `TParsed` keeps the API consistent with other helpers: callers get typed data directly and can always fall back to `chat` if they need raw responses.
- If future providers demand a different parser interface, we can generalize the signature or introduce adapters without changing existing call sites.
