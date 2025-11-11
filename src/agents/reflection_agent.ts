import { Agent } from '@/agents/agent';
import { Insert } from '@innobridge/memoizedsingleton';
import { OllamaClient } from '@/client/ollama_client';
import { ChatRequest } from 'ollama';
import { LLMClient, StructuredOutputValidationError } from '@/client/llmclient';
import { StructuredOutput, ToolComponent } from '@/models/structured_output';
import { ReflectWorkflow } from '@/workflow/workflows/reflect_workflow';

class ReflectionAgent implements Agent {
    @Insert(OllamaClient)
    private llmClient!: LLMClient;

    async chat(input: ChatRequest): Promise<any> {
        return this.llmClient.chat(input);
    }

    async toolCall(input: ChatRequest, tools: Array<typeof ToolComponent>): Promise<ToolComponent[]> {
        if (!this.llmClient.toolCall) {
            throw new Error('LLM client does not support toolCall');
        }
        return this.llmClient.toolCall(input, tools);
    }

    async toStructuredOutput<T extends typeof StructuredOutput>(
        input: ChatRequest,
        dto: T,
        retries?: number,
    ): Promise<InstanceType<T>> {
        if (!this.llmClient.toStructuredOutput) {
            throw new Error('LLM client does not support structured output');
        }
        const result = await this.llmClient.toStructuredOutput(input, dto, retries);
        if (result instanceof StructuredOutputValidationError) {
            throw result;
        }
        return result;
    }

    async run<T = unknown>(input: ChatRequest): Promise<T> {
        const workflow = new ReflectWorkflow(input, this.llmClient.chat.bind(this.llmClient));
        let hasMore = true;
        let result: unknown = null;

        while (hasMore) {
            const currentState = workflow.getHead();
            result = await currentState.run({});
            hasMore = await workflow.transition();
        }

        return result as T;
    }

}

export { ReflectionAgent };
