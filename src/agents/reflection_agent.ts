import { Agent } from '@/agents/agent';
import { Insert } from '@innobridge/memoizedsingleton';
import { OllamaClient } from '@/client/ollama_client';
import { ChatRequest } from 'ollama';
import { LLMClient } from '@/client/llmclient';
import { Workflow } from '@/workflow/workflow';

class ReflectionAgent implements Agent {
    @Insert(OllamaClient)
    private llmClient!: LLMClient;

    async chat(input: ChatRequest): Promise<any> {
        return this.llmClient.chat(input);
    }

    getId() {
        return { name: this.constructor.name };
    }

    async run<T = unknown>(workflow: Workflow): Promise<T> {
        let currentState: any = workflow.getHead();

        while (!workflow.isTerminal(currentState)) {
            await currentState.run({ 
                chatFunction: this.llmClient.chat.bind(this.llmClient),
                structuredOutputFunction: this.llmClient.toStructuredOutput?.bind(this.llmClient)
            });
            const nextState = await workflow.transition(currentState);
            currentState = nextState!;
        }
        // Run the terminal state once to capture its final result
        return (await currentState.run({})) as T;
    }

}

export { ReflectionAgent };
