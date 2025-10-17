import { Singleton, SingletonComponent } from "@innobridge/memoizedsingleton";
import OpenAI from "openai";
import { Model } from "openai/resources/models";
import { ChatCompletionCreateParamsNonStreaming, ChatCompletion } from "openai/resources/chat/completions";

interface LLMClient {
    chat(input: any): Promise<any>;
    // stream?(input: string | Message[], handler?: { onToken?: (tok: string) => void; onError?: (err: any) => void; onClose?: () => void }, opts?: CallOptions): Promise<void>;
    getModelInfo?(modelId: string): Promise<any>;
    getModels?(): Promise<string[]>;
    stop?(): Promise<void>;
};

@Singleton
class OllamaClient extends SingletonComponent implements LLMClient {
    private client: OpenAI;

    constructor(baseUrl: string) {
        super();
        this.client = new OpenAI({ 
            apiKey: 'OLLAMA',
            baseURL: baseUrl + '/v1'
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
    LLMClient,
    OllamaClient
};