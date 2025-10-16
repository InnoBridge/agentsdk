import { Singleton } from "@innobridge/memoizedsingleton";
import OpenAI from "openai";

interface LLMClient {

};

@Singleton
class OllamaClient implements LLMClient {
    private client: OpenAI;

    constructor(baseUrl: string) {
        this.client = new OpenAI({ 
            apiKey: 'OLLAMA',
            baseURL: baseUrl 
        });
    }
    
};

export {
    LLMClient,
    OllamaClient
};