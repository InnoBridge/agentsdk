import { 
    Config, 
    getConfig,
    getApplicationContext,
    Insert
} from '@innobridge/memoizedsingleton';
import { LLMClient, OllamaClient } from '@/client/llmclient';
import { strict as assert } from 'node:assert';

class TestLLMClients {
    @Insert(OllamaClient)
    ollamaClient!: LLMClient;

    getOllamaClient(): LLMClient {
        return this.ollamaClient;
    }
}

const initialOllama = (): TestLLMClients => {
    console.log('Initializing OllamaClient with base URL from config...');

    new Config(["OLLAMA_BASE_URL"]);
    const OLLAMA_BASE_URL = getConfig("OLLAMA_BASE_URL");

    new OllamaClient(OLLAMA_BASE_URL!);

    console.log('OllamaClient initialized.');

    return new TestLLMClients();
}

const shutdownOllama = (ollamaClient: LLMClient) => {
    console.log('Shutting down OllamaClient...');

    const ollamaClientBeforeShutdown = getApplicationContext(OllamaClient);
    assert.equal(ollamaClientBeforeShutdown, ollamaClient, 'OllamaClient instance should exist before shutdown');

    ollamaClient.stop!();

    const ollamaClientAfterShutdown = getApplicationContext(OllamaClient);
    assert.equal(ollamaClientAfterShutdown, undefined, 'OllamaClient instance should be removed after shutdown');

    console.log('✅ OllamaClient shut down.');
};

const getModelsTest = async (ollamaClient: LLMClient) => {
    console.log('Starting OllamaClient integration test...');

    const models = await ollamaClient.getModels!();

    console.log('OllamaClient models:', models);

    console.log('OllamaClient integration test completed.');
};

const getModelInfoTest = async (ollamaClient: LLMClient) => {
    console.log('Starting getModelInfoTest ...');

    const modelInfo = await ollamaClient.getModelInfo!('qwen3-coder:30b');
    console.log("✅ Ollama Model Info: ", modelInfo);

    console.log('getModelInfoTest completed.');
};

const chatTest = async (ollamaClient: LLMClient) => {
    console.log('Starting OllamaClient.chat test...');

    const input: any = {
        model: 'qwen3-coder:30b',
        messages: [
            { role: 'user', content: 'Hello from integration test' }
        ]
    };

    const ollamaResponse = await ollamaClient.chat(input);
    console.log('✅ OllamaClient chat response:', ollamaResponse);
    console.log('✅ OllamaClient chat response choice:', ollamaResponse.choices);

    console.log('OllamaClient.chat test completed.');
};


(async function main() {
    try {
        const testLLMClients = initialOllama();

        await getModelsTest(testLLMClients.getOllamaClient());
        await getModelInfoTest(testLLMClients.getOllamaClient());
        await chatTest(testLLMClients.getOllamaClient());
        shutdownOllama(testLLMClients.getOllamaClient());

        console.log("🎉 LLMClient integration test passed");
    } catch (err) {
        console.error("❌ LLMClient integration test failed:", err);
        process.exit(1);
    }
})();

