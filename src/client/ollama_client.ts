import { Singleton, SingletonComponent } from "@innobridge/memoizedsingleton";
import { Ollama, ShowResponse, ChatRequest, ChatResponse, Tool } from "ollama";
import type { LLMClient } from '@/client/llmclient';
import { ToolComponent, ToolDefinition, JsonSchema } from "@/tools/tool";
import { T } from "vitest/dist/chunks/reporters.d.C-cu31ET.js";


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

    async toolCall(input: any, tools: Array<typeof ToolComponent>): Promise<ToolComponent[]> {
        // Implement tool calling logic here
        console.log("Tools: ", tools);
        tools[0].getDefinition?.();
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
        console.log("input with tools: ", JSON.stringify(input, null, 2));
        const result = await this.client.chat({ ...input, stream: false });
        console.log("Ollama tool call result: ", JSON.stringify(result, null, 2));
        return [];
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
