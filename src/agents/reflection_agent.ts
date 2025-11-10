import { Agent } from '@/agents/agent';
import { Insert } from '@innobridge/memoizedsingleton';
import { OllamaClient } from '@/client/ollama_client';
import { ChatRequest } from 'ollama';
import { LLMClient } from '@/client/llmclient';

class ReflectionAgent implements Agent {
    @Insert(OllamaClient)
    private llmClient!: LLMClient;

    async chat(input: ChatRequest): Promise<any> {
        return await this.llmClient.chat(input);
    };

}

export { ReflectionAgent };