import { ReflectionAgent } from "@/agents/reflection_agent";
import { OllamaClient } from "@/client/ollama_client";
import { Input, ReflectWorkflow } from "@/workflow/workflows/reflect_workflow";
import { Config, getConfig } from "@innobridge/memoizedsingleton";

const initializeReflectionAgent = (): ReflectionAgent => {
    console.log("Initializing ReflectionAgent...");

    new Config([
        "OLLAMA_BASE_URL"
    ]);

    const OLLAMA_BASE_URL = getConfig("OLLAMA_BASE_URL");

    new OllamaClient(OLLAMA_BASE_URL!);

    return new ReflectionAgent();
};

const reflectionAgentChatTest = async (agent: ReflectionAgent) => {
    console.log("Running ReflectionAgent chat test...");

    const chatInput = {
        model: "qwen3-coder:30b",
        messages: [
            { role: "user", content: "Hello, ReflectionAgent!" }
        ]
    };

    const response = await agent.chat(chatInput);

    if (!response || !response.message || !response.message.content) {
        throw new Error("ReflectionAgent chat test failed: No valid response received.");
    }

    console.log("ReflectionAgent chat test passed. Response:", response.message.content);
};

const reflectionAgentRunTest = async (agent: ReflectionAgent) => {
    console.log("Running ReflectionAgent run test...");
    
    const reflectInput = {
        model: "qwen3-coder:30b",
        messages: [
            {
                role: "user",
                content: "You just finished building an agent SDK milestone. Write a structured reflection that covers: (1) what went well shipping the new workflow engine, (2) what slowed the team down, (3) concrete experiments we should run next sprint to validate reliability. Keep the tone pragmatic and reference testing, documentation, and developer experience.",
            },
        ],
    };

    const workflow = new ReflectWorkflow(reflectInput as Input, agent.getId());
    const result = await agent.run(workflow);
    console.log("ReflectionAgent run test result: ", result);
    console.log("ReflectionAgent run test completed.");
}

(async function main() {
    try {
        // sync test
        const agent = initializeReflectionAgent();

        // promise tests in order
        // await reflectionAgentChatTest(agent);
        await reflectionAgentRunTest(agent);

        console.log("🎉 All integration tests passed");
    } catch (err) {
        console.error("❌ Integration tests failed:", err);
        process.exit(1);
    }
})();
