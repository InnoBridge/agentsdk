import { Agent } from '@/agents/agent';
import { Insert } from '@innobridge/memoizedsingleton';
import { OllamaClient } from '@/client/ollama_client';
import { ChatRequest } from 'ollama';
import { LLMClient } from '@/client/llmclient';
import { ReflectWorkflow } from '@/workflow/workflows/reflect_workflow';
import { Chat } from 'openai/resources.js';

class ReflectionAgent implements Agent {
    @Insert(OllamaClient)
    private llmClient!: LLMClient;

    async chat(input: ChatRequest): Promise<any> {
        return await this.llmClient.chat(input);
    };

    async reflect(input: ChatRequest): Promise<any> {
        const reflect = new ReflectWorkflow(input, this.llmClient.chat.bind(this.llmClient));
        let hasMore = true;
        let result: ChatRequest | unknown | null = null;
        while (hasMore) {
            const currentState = reflect.getHead();
            result = await currentState.run({});
            hasMore = await reflect.transition();
        }
        return result;
    }

}

export { ReflectionAgent };
