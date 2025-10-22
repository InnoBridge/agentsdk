import {
    Config,
    getConfig,
    getApplicationContext,
    Insert,
} from '@innobridge/memoizedsingleton';
import { LLMClient } from '@/client/llmclient';
import { OllamaClient } from '@/client/ollama_client';
import { strict as assert } from 'node:assert';
import { ShowResponse } from 'ollama';
import { Tool, ToolComponent } from '@/tools/tool';
import { WeatherTool } from '@/examples/tools/weather';
import { BraveSearchTool } from '@/examples/tools/brave_search';

class TestLLMClients {
    @Insert(OllamaClient)
    ollamaClient!: LLMClient;

    getOllamaClient(): LLMClient {
        return this.ollamaClient;
    }
}

const initialOllama = (): TestLLMClients => {
    console.log('Initializing OllamaClient with base URL from config...');

    new Config([
        'OLLAMA_BASE_URL', 
        'WEATHER_API_BASEURL', 
        'WEATHER_API_KEY',
        'BRAVE_SEARCH_BASEURL',
        'BRAVE_SEARCH_API_KEY',
    ]);
    const OLLAMA_BASE_URL = getConfig('OLLAMA_BASE_URL');

    new OllamaClient(OLLAMA_BASE_URL!);

    console.log('OllamaClient initialized.');

    return new TestLLMClients();
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

const getModelsTest = async (ollamaClient: LLMClient) => {
    console.log('Starting OllamaClient integration test...');

    const models = await ollamaClient.getModels!();

    console.log('OllamaClient models:', models);

    console.log('OllamaClient integration test completed.');
};

const getModelInfoTest = async (ollamaClient: LLMClient) => {
    console.log('Starting getModelInfoTest ...');

    const modelInfo: ShowResponse = await ollamaClient.getModelInfo!('gpt-oss:20b') as ShowResponse;

    console.log(
        '✅ Ollama Model Info (basename): ',
        (modelInfo.model_info as any)['general.basename']
    );

    console.log('getModelInfoTest completed.');
};

const chatTest = async (ollamaClient: LLMClient) => {
    console.log('Starting OllamaClient.chat test...');

    const input: any = {
        model: 'qwen3-coder:30b',
        messages: [
            { role: 'user', content: 'Write a one-sentence bedtime story about a unicorn.' },
        ],
    };

    const ollamaResponse = await ollamaClient.chat(input);
    console.log('✅ OllamaClient chat response message: ', ollamaResponse.message.content);

    console.log('OllamaClient.chat test completed.');
};

const toolCallTest = async (ollamaClient: LLMClient) => {
    console.log('Starting OllamaClient.toolCall test...');

    const tools = [WeatherTool, BraveSearchTool];
    const input: any = {
        model: 'qwen3-coder:30b',
        messages: [
            { role: 'user', content: 'What is the temperature in New York City, and Beijing in celsius? is Aws still down?' },
        ],
    };

    const toolResponses = await ollamaClient.toolCall!(input, tools);

    toolResponses.forEach(async toolResponse => {
        const result = await toolResponse.run();
        console.log(`Tool response run result: ${result}`);
    });

    console.log('OllamaClient.toolCall test completed.');
};

import { z } from 'zod'


const Step = z.object({
  explanation: z.string(),
  output: z.string(),
});

const MathReasoning = z.object({
  steps: z.array(Step),
  final_answer: z.string(),
});

const Country = z.object({
  name: z.string(),
  capital: z.string(),
  languages: z.array(z.string()),
});
const structuredOutputTest = async (ollamaClient: LLMClient) => {
    console.log('Starting OllamaClient.structuredOutput test...');

    // const schema = zodToJsonSchema(Country);
    // console.log('✅ Country schema:', schema);

    // const schema = zodToJsonSchema(MathReasoning);
    // console.log('✅ MathReasoning schema:', JSON.stringify(schema, null, 2));
    // 
   

    const input: any = {    
        model: 'qwen3-coder:30b',
        messages: [
                {
      role: "system",
      content:
        "You are a helpful math tutor. Guide the user through the solution step by step.",
    },
    { role: "user", content: "how can I solve 8x + 7 = -23" },
        ]
    };
    const result = await ollamaClient.toStructuredOutput!(input, MathReasoning);
    console.log('✅ OllamaClient structured output response object:', result);
    console.log('OllamaClient.toStructuredOutput - validated result:', MathReasoning.parse(result));

    console.log('OllamaClient.structuredOutput test completed.');
};

    // "text": {
    //   "format": {
    //     "type": "json_schema",
    //     "name": "math_reasoning",
    //     "schema": {
    //       "type": "object",
    //       "properties": {
    //         "steps": {
    //           "type": "array",
    //           "items": {
    //             "type": "object",
    //             "properties": {
    //               "explanation": { "type": "string" },
    //               "output": { "type": "string" }
    //             },
    //             "required": ["explanation", "output"],
    //             "additionalProperties": false
    //           }
    //         },
    //         "final_answer": { "type": "string" }
    //       },
    //       "required": ["steps", "final_answer"],
    //       "additionalProperties": false
    //     },
    //     "strict": true
    //   }
    // }


(async function main() {
    try {
        const testLLMClients = initialOllama();

        // await getModelsTest(testLLMClients.getOllamaClient());
        // await getModelInfoTest(testLLMClients.getOllamaClient());
        // await chatTest(testLLMClients.getOllamaClient());
        // await toolCallTest(testLLMClients.getOllamaClient());
        await structuredOutputTest(testLLMClients.getOllamaClient());
        await shutdownOllama(testLLMClients.getOllamaClient());

        console.log('🎉 LLMClient integration test passed');
    } catch (err) {
        console.error('❌ LLMClient integration test failed:', err);
        process.exit(1);
    }
})();
