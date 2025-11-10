import { ReflectionAgent } from "@/agents/reflection_agent";
import { OllamaClient } from "@/client/ollama_client";
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

(async function main() {
    try {
        // sync test
        const agent = initializeReflectionAgent();

        // promise tests in order
        await reflectionAgentChatTest(agent);   

        console.log("🎉 All integration tests passed");
    } catch (err) {
        console.error("❌ Integration tests failed:", err);
        process.exit(1);
    }
})();