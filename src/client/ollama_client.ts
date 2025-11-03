import { Singleton, SingletonComponent } from "@innobridge/memoizedsingleton";
import { Ollama, ShowResponse, ChatRequest, ChatResponse, Tool } from "ollama";
import { StructuredOutputValidationError, type LLMClient } from '@/client/llmclient';
import { JsonSchema } from "@/tools/tool";
import { StructuredOutput, ToolComponent } from "@/models/structured_output";

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
            const schema = tool.getSchema?.();
            const name = (schema as { name?: string } | undefined)?.name;
        //     if (name) {
        //         toolNameToolComponentMap.set(name, tool);
        //     }
        });
        const toolParams = tools
            .map(tool => {
                const schema = tool.getToolSchema?.();
                if (schema) {
                    return {
                        type: (schema as { type?: string }).type ?? 'function',
                        function: schema
                    }
                }
                return undefined;
            })
            .filter((def): def is Tool => def !== undefined);
        
        console.log('Tool parameters: ', JSON.stringify(toolParams, null, 2));

        input.tools = toolParams;
        const result = await this.chat({ ...input, stream: false });

        console.log("Tool call response: ", JSON.stringify(result, null, 2));

        // const toolCalls: ToolComponent[] = result.message.tool_calls
        //     ? result.message.tool_calls.map(toolCall => {
        //         const toolComponent = toolNameToolComponentMap.get(toolCall.function.name);
        //         return toolComponent?.hydrate?.(toolCall);
        //     }).filter((tc): tc is ToolComponent => tc !== undefined)
        //     : [];
        // return toolCalls;
        return [];
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

        let request: ChatRequest = {
            ...input,
            format: schema,
            stream: false,
        };
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

    async toStructuredOutputRaw<T extends typeof StructuredOutput>(
        input: ChatRequest,
        dto: T,
    ): Promise<string | undefined> {
        const schema = dto.getSchema?.();
        if (!schema) {
            throw new Error('DTO class does not have a schema defined.');
        }

        const request: ChatRequest = {
            ...input,
            format: schema,
            stream: false,
        };
        const response = await this.chat(request);
        return response.message?.content;
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
    properties?: Record<string, JsonSchema>;
    additionalProperties?: boolean;
    strict?: boolean;
    allowNoSchema?: boolean;
}

const mapSchemaToToolParameters = (schema: JsonSchema): OllamaToolParameters | undefined => {
    if (typeof schema !== 'object' || !schema) return undefined;

    const properties = (schema as { properties?: Record<string, JsonSchema> }).properties;
    const directProperties =
        properties ?? (Object.keys(schema).length > 0 ? (schema as Record<string, JsonSchema>) : undefined);

    if (!directProperties || Object.keys(directProperties).length === 0) {
        return undefined;
    }

    const parameters: OllamaToolParameters = {
        type: 'object',
        properties: directProperties,
    };

    const required = (schema as { required?: string[] }).required;
    if (Array.isArray(required) && required.length > 0) {
        parameters.required = required;
    }

    const additionalProperties = (schema as { additionalProperties?: boolean }).additionalProperties;
    if (additionalProperties !== undefined) {
        parameters.additionalProperties = additionalProperties;
    }

    const strict = (schema as { strict?: boolean }).strict;
    if (strict !== undefined) {
        parameters.strict = strict;
    }

    const allowNoSchema = (schema as { allowNoSchema?: boolean }).allowNoSchema;
    if (allowNoSchema !== undefined) {
        parameters.allowNoSchema = allowNoSchema;
    }

    return parameters;
};

const mapToolSchemaToTool = (schema: JsonSchema): Tool | undefined => {
    if (typeof schema !== 'object' || !schema) return undefined;

    const toolType = (schema as { type?: string }).type ?? 'function';
    const name = (schema as { name?: string }).name;
    if (!name) return undefined;

    const description = (schema as { description?: string }).description;
    const parametersSchema = (schema as { parameters?: JsonSchema }).parameters;
    const parameters = parametersSchema ? mapSchemaToToolParameters(parametersSchema) : undefined;

    return {
        type: toolType,
        function: {
            name,
            ...(description ? { description } : {}),
            ...(parameters ? { parameters } : {}),
        },
    } as unknown as Tool;
};

export {
    OllamaClient
};
