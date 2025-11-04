import { Singleton, SingletonComponent } from "@innobridge/memoizedsingleton";
import { Ollama, ShowResponse, ChatRequest, ChatResponse, Tool } from "ollama";
import { StructuredOutputValidationError, type LLMClient } from '@/client/llmclient';
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
            if (name) {
                toolNameToolComponentMap.set(name, tool);
            }
        });
        const toolParams = tools
            .map(tool => {
                const schema = tool.getToolSchema?.();
                if (schema) {
                    return {
                        type: (schema as { toolType?: string }).toolType ?? 'function',
                        function: schema
                    }
                }
                return undefined;
            })
            .filter((def): def is Tool => def !== undefined);
    
        input.tools = toolParams;
        const result = await this.chat({ ...input, stream: false });

        const toolCalls: ToolComponent[] = result.message.tool_calls
            ? result.message.tool_calls.map(toolCall => {
                const toolComponent = toolNameToolComponentMap.get(toolCall.function.name);
                if (toolComponent) {
                    const validationResult = toolComponent.validate?.(toolCall.function.arguments);
                    if (validationResult && validationResult.valid) {
                        return toolComponent?.hydrate?.(toolCall);
                    } else {
                        console.error(`Tool call validation failed for: ${toolCall.function.name}`);
                    }
                } else {
                    console.error(`No tool component found for tool call: ${toolCall.function.name}`);
                }
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

        let request: ChatRequest = {
            ...input,
            format: schema,
            stream: false,
        };
        let response = await this.chat(request);
        let hydrationRecipe = response.message?.content;

        let validationResult = dto.validate?.(hydrationRecipe);

        if (validationResult?.valid) {
            return dto.hydrate?.(hydrationRecipe) as InstanceType<T>;
        }

        for (let attempt = 0; attempt < retries; attempt++) {
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

export {
    OllamaClient
};
