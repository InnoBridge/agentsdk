import { 
    Config, 
    getConfig,
    getApplicationContext
} from '@innobridge/memoizedsingleton';
import { LLMClient, OllamaClient } from '@/client/llmclient';

async function ollamaClientTest() {
    console.log('Starting OllamaClient integration test...')

    new Config(["OLLAMA_BASE_URL"]);

    const OLLAMA_BASE_URL = getConfig("OLLAMA_BASE_URL");

    console.log('OLLAMA_BASE_URL:', OLLAMA_BASE_URL);

    new OllamaClient(OLLAMA_BASE_URL!);

    const llmClient: LLMClient = getApplicationContext(OllamaClient)!;

    console.log('LLMClient instance:', llmClient);

    // const client = new Ollama(apiKey);
    // const res = await client.call('Say hello in one sentence');
    // if (!res || typeof res.text !== 'string') throw new Error('Invalid response from Ollama client');
    // console.log('OllamaClient test response:', res.text.slice(0, 120));
}

(async function main() {
    try {
        await ollamaClientTest();
        console.log("🎉 LLMClient integration test passed");
    } catch (err) {
        console.error("❌ LLMClient integration test failed:", err);
        process.exit(1);
    }
})();
