import { ReflectWorkflow } from "@/workflow/workflows/reflect_workflow";
import { Config, getApplicationContext, getConfig, Insert } from "@innobridge/memoizedsingleton";
import { OllamaClient } from "@/client/ollama_client";
import { LLMClient } from "@/client/llmclient";
import { strict as assert } from 'node:assert';
import { Workflow } from "@/workflow/workflow";
import { ReflectionAgent } from "@/agents/reflection_agent";
import { Agent } from "@/agents/agent";

class TestLLMClients {
    @Insert(OllamaClient)
    ollamaClient!: OllamaClient;

    getOllamaClient(): OllamaClient {
        return this.ollamaClient;
    }
}

const initializeOllama = () => {
 console.log('Initializing OllamaClient with base URL from config...');

    new Config([
        'OLLAMA_BASE_URL'
    ]);
    const OLLAMA_BASE_URL = getConfig('OLLAMA_BASE_URL');

    new OllamaClient(OLLAMA_BASE_URL!);

    console.log('OllamaClient initialized.');

    return new TestLLMClients();
};

const initializeReflectionAgent = (): ReflectionAgent => {
    console.log("Initializing ReflectionAgent...");

    return new ReflectionAgent();

    console.log("ReflectionAgent initialized.");
};


const shutdownOllama = async (ollamaClient: LLMClient) => {
    console.log('Shutting down OllamaClient...');

    const ollamaClientBeforeShutdown = getApplicationContext(OllamaClient);
    assert.equal(
        ollamaClientBeforeShutdown,
        ollamaClient,
        'OllamaClient instance should exist before shutdown',
    );

    ollamaClient.stop!();

    const ollamaClientAfterShutdown = getApplicationContext(OllamaClient);
    assert.equal(
        ollamaClientAfterShutdown,
        undefined,
        'OllamaClient instance should be removed after shutdown',
    );

    const config = getApplicationContext(Config);
    config?.stop!();

    console.log('✅ OllamaClient shut down.');
};

const reflectionWorkflowGetSchemaTest = () => {
    console.log('Starting ReflectWorkflow getSchema test...');
    const schema = ReflectWorkflow.getSchema?.();
    console.log('ReflectWorkflow schema: ', JSON.stringify(schema, null, 2));
    console.log('✅ ReflectWorkflow getSchema test completed.');
};

const getReflectionWorkflowRawOutputTest = async (ollamaClient: LLMClient): Promise<string> => {
    console.log('Starting ReflectWorkflow raw output test...');

    const input = {
        model: 'qwen3-coder:30b',
        messages: [
            {
                role: 'system',
                content:
                    'You are a senior reviewer helping the reflection workflow summarize engineering changes. Keep answers concise but specific.',
            },
            {
                role: 'user',
                content:
                    'We just refactored the workflow runtime to capture annotations per state and added AgentId DTOs. Draft a reflection on what improved and what needs follow-up.',
            },
        ]
    };
    const rawOutput = await ollamaClient.toStructuredOutputRaw!(input, ReflectWorkflow);

    console.log('ReflectWorkflow raw output: ', rawOutput);
    console.log('✅ ReflectWorkflow raw output test completed.');
    return rawOutput!;
};

const hydrateReflectionWorkflowTest = async (ollamaClient: LLMClient): Promise<Workflow> => {
    console.log('Starting ReflectWorkflow hydration test...');
    const hydrationRecipe = '{"input": {"model": "qwen3-coder:30b", "messages": [{"role": "user", "content": "We just refactored the workflow runtime to capture annotations per state and added AgentId DTOs. Draft a reflection on what improved and what needs follow-up."}]}, "agentId": {"name": "workflow-refactor-reflection-agent", "id": "workflow-refactor-reflection-1234567890"}}';
    const hydrated = (ReflectWorkflow as typeof Workflow).hydrate?.(hydrationRecipe);
    console.log('ReflectWorkflow hydrated instance: ', hydrated);
    console.log('✅ ReflectWorkflow hydration test completed.');
    return hydrated as Workflow;
};

const getReflectWorkflowTest = async (ollamaClient: LLMClient): Promise<Workflow> => {
    console.log('Starting ReflectWorkflow get test...');
    
    const input = {
        model: 'qwen3-coder:30b',
        messages: [
            {
                role: 'system',
                content:
                    'Act as a brand strategist reviewing a loyalty program workflow. Evaluate storytelling strengths and identify gaps succinctly. Use qwen3-coder:30b for the model.',
            },
            {
                role: 'user',
                content:
                    'We revamped our customer outreach: each touchpoint now logs sentiment annotations and every ambassador has a verified AgentId profile. Reflect on how this boosts personalization and what risks or follow-ups we should track next quarter.',
            },
        ]
    };
    const workflow = await ollamaClient.toStructuredOutput!(input, ReflectWorkflow) as Workflow;
    console.log('ReflectWorkflow instance from get: ', workflow);
    console.log('✅ ReflectWorkflow get test completed.');
    return workflow;
};

const runWorkflow = async (agent: Agent, workflow: Workflow) => {
    console.log('Starting runningWorkflow...');

    const result = await agent.run(workflow);
    console.log('Workflow run result: ', result);

    console.log('✅ Workflow run completed.');
}

const runHydratedWorkflowTest =

(async function main() {
    try {
        const testLLMClients = initializeOllama();
        const reflectionAgent = initializeReflectionAgent();

        // sync test
        // reflectionWorkflowGetSchemaTest();

        // promise tests in order
        const rawOutput = await getReflectionWorkflowRawOutputTest(testLLMClients.getOllamaClient());
        // const hydrated = await hydrateReflectionWorkflowTest(testLLMClients.getOllamaClient());
        
        // console.log("Running hydrated reflection workflow test...");
        // await runWorkflow(reflectionAgent, hydrated);
        // console.log("Hydrated reflection workflow test completed.");

        const reflectWorkflow = await getReflectWorkflowTest(testLLMClients.getOllamaClient());
        console.log("Running reflection workflow test...");
        await runWorkflow(reflectionAgent, reflectWorkflow);
        console.log("Reflection workflow test completed.");
        
        await shutdownOllama(testLLMClients.getOllamaClient());
        console.log("🎉 All integration tests passed");
    } catch (err) {
        console.error("❌ Integration tests failed:", err);
        process.exit(1);
    }
})();
