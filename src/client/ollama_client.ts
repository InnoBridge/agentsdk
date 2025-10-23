import { Singleton, SingletonComponent } from "@innobridge/memoizedsingleton";
import { Ollama, ShowResponse, ChatRequest, ChatResponse, Tool } from "ollama";
import type { LLMClient } from '@/client/llmclient';
import { ToolComponent, ToolDefinition, JsonSchema } from "@/tools/tool";
import { zodToJsonSchema } from 'zod-to-json-schema';
import { ZodType, ZodTypeDef } from "zod";

@Singleton
class OllamaClient extends SingletonComponent implements LLMClient {
    private client: Ollama;

    constructor(baseUrl: string) {
        super();
        this.client = new Ollama({
            host: baseUrl,
        });
    }

    async getModels(): Promise<string[]> {
        const res = await this.client.list();
        const data = res.models || [];
        return data.map((model: any) => model.name || model.id || String(model));
    }

    async getModelInfo(modelId: string): Promise<ShowResponse> {
        const res = await this.client.show({ model: modelId });
        return res;
    }
    
    async chat(input: ChatRequest): Promise<ChatResponse> {
        return await this.client.chat({ ...input, stream: false });
    };

    async toolCall(input: ChatRequest, tools: Array<typeof ToolComponent>): Promise<ToolComponent[]> {
        const toolNameToolComponentMap = new Map<string, typeof ToolComponent>();
        tools.forEach(tool => {
            const name = tool.getDefinition?.()?.name;
            if (name) {
                toolNameToolComponentMap.set(name, tool);
            }
        });
        const toolParams = tools
            .map(tool => {
                const def = tool.getDefinition?.();
                if (def) {
                    return mapToolDefinitionToTool(def);
                }
                return undefined;
            })
            .filter((def): def is Tool => def !== undefined);

        input.tools = toolParams;
        const result = await this.chat({ ...input, stream: false });
        const toolCalls: ToolComponent[] = result.message.tool_calls
            ? result.message.tool_calls.map(toolCall => {
                const toolComponent = toolNameToolComponentMap.get(toolCall.function.name);
                return toolComponent?.hydration?.(toolCall);
            }).filter((tc): tc is ToolComponent => tc !== undefined)
            : [];
        return toolCalls;
    };

    async toStructuredOutput<TParsed>(
        input: ChatRequest,
        schema: ZodType<TParsed, ZodTypeDef, any>,
    ): Promise<TParsed> {
        console.log('OllamaClient.toStructuredOutput called with schema:', JSON.stringify(
            zodToJsonSchema(schema), null, 2
        ));
        const request: ChatRequest = {
            ...input,
            format: zodToJsonSchema(schema),
            stream: false,
        };

        const response = await this.chat(request);
        const content = response.message?.content;

        if (content === undefined || content === null) {
            throw new Error('Structured output response was empty.');
        }

        let candidate: unknown = content;

        if (typeof content === 'string') {
            try {
                candidate = JSON.parse(content);
            } catch {
                throw new Error(
                    'Failed to parse structured output as JSON. Ensure the model returns valid JSON matching the schema.',
                );
            }
        }

        return schema.parse(candidate);
    };

    async stop(): Promise<void> {
        // Call the Component stop implementation on the superclass to avoid recursion
        super.stop();
    };
    
};

interface OllamaToolParameters {
    type?: string;
    $defs?: any;
    items?: any;
    required?: string[];
    properties?: {
        [key: string]: {
            type?: string | string[];
            items?: any;
            description?: string;
            enum?: any[];
        };
    };
}

const mapParameterJsonSchemaToOllamaToolParameter = (schema?: JsonSchema): OllamaToolParameters | undefined => {
    if (!schema) return undefined;
    // Ollama's Tool.parameters expects a JSON Schema-like object. We keep a
    // shallow mapping here to preserve the canonical schema shape while
    // allowing future provider-specific transformations.
    return schema as unknown as OllamaToolParameters;
};

const mapToolDefinitionToTool = (def: ToolDefinition): Tool => {
    return {
        type: def.type,
        function: {
            name: def.name,
            description: def.description,
            parameters: mapParameterJsonSchemaToOllamaToolParameter(def.parameters),
        }
    } as unknown as Tool;
};

export {
    OllamaClient
};
