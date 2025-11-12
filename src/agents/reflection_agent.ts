import { Agent } from '@/agents/agent';
import { Insert } from '@innobridge/memoizedsingleton';
import { OllamaClient } from '@/client/ollama_client';
import { ChatRequest } from 'ollama';
import { LLMClient } from '@/client/llmclient';
import { ReflectWorkflow } from '@/workflow/workflows/reflect_workflow';

class ReflectionAgent implements Agent {
    @Insert(OllamaClient)
    private llmClient!: LLMClient;

    async chat(input: ChatRequest): Promise<any> {
        return this.llmClient.chat(input);
    }

    async run<T = unknown>(input: ChatRequest): Promise<T> {
        const workflow = new ReflectWorkflow(input, this.llmClient);
        let currentState: any = workflow.getHead();

        while (!workflow.isTerminal(currentState)) {
            await currentState.run({ chatFunc: this.llmClient.chat.bind(this.llmClient) });
            const nextState = await workflow.transition(currentState);
            currentState = nextState!;
        }

        // Run the terminal state once to capture its final result
        return (await currentState.run({})) as T;
    }

}

export { ReflectionAgent };
