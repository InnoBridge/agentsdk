import { Singleton, SingletonComponent } from "@innobridge/memoizedsingleton";
import OpenAI from "openai";
import { Model } from "openai/resources/models";
import { ChatCompletionCreateParamsNonStreaming, ChatCompletion } from "openai/resources/chat/completions";
import type { LLMClient } from '@/client/llmclient';


@Singleton
class OllamaClient extends SingletonComponent implements LLMClient {
    private client: OpenAI;

    constructor(baseUrl: string) {
        super();
        // Normalize baseUrl: accept either 'http://host:port' or 'http://host:port/v1'
        let normalized = baseUrl || '';
        // remove trailing slash if present
        if (normalized.endsWith('/')) normalized = normalized.slice(0, -1);
        // append /v1 if not already present
        if (!normalized.endsWith('/v1')) normalized = normalized + '/v1';

        this.client = new OpenAI({
            apiKey: 'OLLAMA',
            baseURL: normalized,
        });
    }

    async getModels(): Promise<string[]> {
        const res = await this.client.models.list();
        const data = res.data || [];
        return data.map(model => model.id);
    }

    async getModelInfo(modelId: string): Promise<Model> {
        const res = await this.client.models.retrieve(modelId);
        return res;
    }

    async chat(input: ChatCompletionCreateParamsNonStreaming): Promise<ChatCompletion> {
        const response = await this.client.chat.completions.create(input);
        return response;
    };

    async stop(): Promise<void> {
        // Call the Component stop implementation on the superclass to avoid recursion
        super.stop();
    }
    
};

export {
    OllamaClient
};
