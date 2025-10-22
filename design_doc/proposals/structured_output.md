## Structured Output

### Overview
Several providers now support structured responses when the caller supplies a schema. Rather than duplicating schema wiring at each call site, we extend `LLMClient` with an optional `toStructuredOutput` helper that:

- accepts a prompt or message array plus a schema descriptor
- adapts the provider request (e.g. attaches a JSON schema for Ollama)
- returns the validated payload so downstream code can work with typed data immediately

Providers that do not support structured replies simply omit the helper.

### Interface: `LLMClient`

```ts
interface StructuredOutputParser<TParsed> {
  parse(input: unknown): TParsed;
}

interface LLMClient {
  chat(input: any): Promise<any>;
  toolCall?(input: any, tools: Array<typeof ToolComponent>): Promise<ToolComponent[]>;
  toStructuredOutput?<TParsed>(input: any, parser: StructuredOutputParser<TParsed>): Promise<TParsed>;
  getModelInfo?(modelId: string): Promise<any>;
  getModels?(): Promise<string[]>;
  stop?(): Promise<void>;
}
```

### Implementation: `OllamaClient`

```ts
import { zodToJsonSchema } from 'zod-to-json-schema';

class OllamaClient extends SingletonComponent implements LLMClient {
  private client: Ollama;

  async toStructuredOutput<TParsed>(
    input: ChatRequest,
    schema: ZodType<TParsed, ZodTypeDef, any>,
  ): Promise<TParsed> {
    const request = { ...input, format: zodToJsonSchema(schema), stream: false };
    const response = await this.chat(request);
    const raw = response.message?.content;
    const candidate = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return schema.parse(candidate);
  }
}
```

### Usage

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
- Ollama supports a `format` field on the `ChatRequest`. Passing a JSON Schema instructs the model to emit a response matching the schema.
- The helper accepts any parser with a `parse` method. We use Zod schemas today and convert them to JSON Schema via `zod-to-json-schema` for Ollama.
- The helper returns the parsed payload. Callers that need provider metadata can still fall back to `chat` for raw responses.
