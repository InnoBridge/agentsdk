import { Singleton, SingletonComponent } from "@innobridge/memoizedsingleton";
import { Ollama, ShowResponse, ChatRequest, ChatResponse, Tool } from "ollama";
import { StructuredOutputValidationError, type LLMClient } from '@/client/llmclient';
import { ToolComponent, ToolDefinition, JsonSchema } from "@/tools/tool";
import { StructuredOutput } from "@/tools/structured_output";

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
                return toolComponent?.hydrate?.(toolCall);
            }).filter((tc): tc is ToolComponent => tc !== undefined)
            : [];
        return toolCalls;
    };

    async toStructuredOutput<T extends typeof StructuredOutput>(
        input: ChatRequest,
        dto: T,
        retries: number = 0
    ): Promise<InstanceType<T> | StructuredOutputValidationError> {
        const schema = dto.getSchema?.();
        if (!schema) {
            throw new Error('DTO class does not have a schema defined.');
        }

        console.log("schema:", schema);

        let request: ChatRequest = {
            ...input,
            format: schema,
            stream: false,
        };
        console.log("request:", request);
        let response = await this.chat(request);
        let hydrationRecipe = response.message?.content;

        let validationResult = dto.validate?.(hydrationRecipe);

        if (validationResult?.valid) {
            console.log("valid");
            return dto.hydrate?.(hydrationRecipe) as InstanceType<T>;
        }

        for (let attempt = 0; attempt < retries; attempt++) {
            console.log(`Validation failed. Attempting to repair structured output (Attempt ${attempt + 1}/${retries})...`);
            const messages = request.messages || [];
            messages.push({
                role: 'system',
                content: `Structured output validation failed. on <json>${hydrationRecipe}</json>. Errors: ${JSON.stringify(validationResult?.errors)}. Please correct the output to conform to the specified schema: ${JSON.stringify(schema)}.`,
            });

            response = await this.chat({...request, messages, stream: false });
            hydrationRecipe = response.message?.content;
            validationResult = dto.validate?.(hydrationRecipe);

            if (validationResult?.valid) {
                return dto.hydrate?.(hydrationRecipe) as InstanceType<T>;
            }
        };

        throw new StructuredOutputValidationError('Structured output validation failed with error ' + JSON.stringify(validationResult?.errors), validationResult);
    }

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
