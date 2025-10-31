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
import { WeatherTool } from '@/examples/tools/weather';
import { BraveSearchTool } from '@/examples/tools/brave_search';
import { DTO, StructuredOutput } from '@/tools/structured_output';
import { array } from '@/models/structured_output';
import { A } from 'ollama/dist/shared/ollama.27169772.mjs';

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

@DTO({
    type: 'object',
    name: 'Step',
    description: 'Represents a single step in the reasoning process.',
    properties: {
        explanation: 'string',
        output: 'string',
    },
    required: ['explanation', 'output']
})
class Step {
    explanation: string;
    output: string;
    
    constructor(explanation: string, output: string) {
        this.explanation = explanation;
        this.output = output;
    }
}

@DTO({
    type: 'object',
    name: 'MathReasoning',
    description: 'Represents the step-by-step reasoning process for solving a math problem.',
    properties: {
        steps: array(Step),
        final_answer: { type: 'string' },
    },
    required: ['steps', 'final_answer']
})
class MathReasoning {
    steps: Step[];
    final_answer: string;

    constructor(steps: Step[], final_answer: string) {
        this.steps = steps;
        this.final_answer = final_answer;
    }
}

interface ArithmeticOperation {
    getOrder(): number;
    getStaticNumber(): number;
    getSymbol(): string;
    operate(providedNumber: number): number;
};

@DTO({
    type: 'object',
    name: 'AdditionOperation',
    description: `Represents an addition operation, 
    where order is the position of the operation in the list.
    staticNumber is the number term added to the other term.`,
    properties: {
        order: 'number',
        staticNumber: 'number',
    },
    required: ['order', 'staticNumber']
})
class AdditionOperation implements ArithmeticOperation {
    private order: number;
    private staticNumber: number;

    constructor(order: number, staticNumber: number) {
        this.order = order;
        this.staticNumber = staticNumber;
    }

    getOrder(): number {
        return this.order;
    }

    getSymbol(): string {
        return '+';
    }

    getStaticNumber(): number {
        return this.staticNumber;
    }

    operate(providedNumber: number): number {
        return this.staticNumber + providedNumber;
    }
}


@DTO({
    type: 'object',
    name: 'SubtractionOperation',
    description: `Represents a subtraction operation, 
    where order is the position of the operation in the list.
    staticNumber is the number term subtracted from the other term.`,
    properties: {
        order: 'number',
        staticNumber: 'number',
    },
    required: ['order', 'staticNumber']
})
class SubtractionOperation implements ArithmeticOperation {
    private order: number;
    private staticNumber: number;

    constructor(order: number, staticNumber: number) {
        this.order = order;
        this.staticNumber = staticNumber;
    }

    getOrder(): number {
        return this.order;
    }

    getSymbol(): string {
        return '-';
    }

    getStaticNumber(): number {
        return this.staticNumber;
    }

    operate(providedNumber: number): number {
        return providedNumber - this.staticNumber;
    }
}

@DTO({
    type: 'object',
    name: 'MultiplicationOperation',
    description: `Represents a multiplication operation, 
    where order is the position of the operation in the list.
    staticNumber is the number term multiplied to the other term.`,
    properties: {
        order: 'number',
        staticNumber: 'number',
    },
    required: ['order', 'staticNumber']
})
class MultiplicationOperation implements ArithmeticOperation {
    private order: number;
    private staticNumber: number;

    constructor(order: number, staticNumber: number) {
        this.order = order;
        this.staticNumber = staticNumber;
    }

    getOrder(): number {
        return this.order;
    }

    getSymbol(): string {
        return '*';
    }

    getStaticNumber(): number {
        return this.staticNumber;
    }

    operate(providedNumber: number): number {
        return this.staticNumber * providedNumber;
    }
}

@DTO({
    type: 'object',
    name: 'DivisionOperation',
    description: `Represents a division operation, 
    where order is the position of the operation in the list.
    staticNumber is the number term the other term is divided by should not be zero.`,
    properties: {
        order: 'number',
        staticNumber: 'number',
    },
    required: ['order', 'staticNumber']
})
class DivisionOperation implements ArithmeticOperation {
    private order: number;
    private staticNumber: number;

    constructor(order: number, staticNumber: number) {
        this.order = order;
        this.staticNumber = staticNumber;
    }

    getOrder(): number {
        return this.order;
    }

    getSymbol(): string {
        return '/';
    }

    getStaticNumber(): number {
        return this.staticNumber;
    }

    operate(providedNumber: number): number {
        return providedNumber / this.staticNumber;
    }
}

@DTO({
    type: 'object',
    name: 'ArithmeticOperations',
    description: 'Represents a basic arithmetic operation.',
    properties: {
        additionOperations: array(AdditionOperation),
        subtractionOperations: array(SubtractionOperation),
        multiplicationOperations: array(MultiplicationOperation),
        divisionOperations: array(DivisionOperation)
    },
    required: ['additionOperations', 'subtractionOperations', 'multiplicationOperations', 'divisionOperations']
})
class ArithmeticOperations {
    arithmeticOperations: ArithmeticOperation[];

    constructor(
        additionOperations: AdditionOperation[], 
        subtractionOperations: SubtractionOperation[],
        multiplicationOperations: MultiplicationOperation[],
        divisionOperations: DivisionOperation[]) {
        this.arithmeticOperations = [
            ...additionOperations,
            ...subtractionOperations,
            ...multiplicationOperations,
            ...divisionOperations
        ];
        // Sort operations by their order
        this.arithmeticOperations.sort((a, b) => a.getOrder() - b.getOrder());
    }

    compute(): number {
        let result = 0;
        for (const operation of this.arithmeticOperations) {
            result = operation.operate(result);
            console.log(`Operation ${operation.getOrder()}: ${result} ${operation.getSymbol()} ${operation.getStaticNumber()} = ${operation.operate(result)}`);
        }
        return result;
    }
}

const dtoStructuredOutputMathReasoningTest = async (ollamaClient: LLMClient) => {
    console.log('Starting OllamaClient.DTO structuredOutput test...');

    const input: any = {    
        model: 'qwen3-coder:30b',
        messages: [
                {
                    role: "system",
                    content: "You are a helpful math tutor. Guide the user through the solution step by step.",
            },
            { role: "user", content: "how can I solve 8x + 7 = -23" },
        ]
    };
    const result = await ollamaClient.toStructuredOutput!(input, MathReasoning, 5);
    console.log('✅ OllamaClient DTO structured output response object:', result);

    console.log('OllamaClient.DTO structuredOutput test completed.');
};

const structuredOutputArithmeticOperationsTest = async (ollamaClient: LLMClient) => {
    console.log('Starting OllamaClient.structuredOutput arithmetic operations test...');

    const input: any = {
        model: 'qwen3-coder:30b',
        messages: [
            {
                role: 'user',
                content: `<think>Perform a series of arithmetic operations less than 12 starting 
                from 3 that and computes to 74
                 where the order of the operations are consecutive.</think>`
            }
        ],
    };

    console.log('MathReasoning :', JSON.stringify((MathReasoning as any).getSchema?.(), null, 2));
    console.log('ArithmeticOperations schema definition:', JSON.stringify((ArithmeticOperations as any).getSchema?.(), null, 2));
    console.log('ArithmeticOperation schema definition:', JSON.stringify((AdditionOperation as any).getSchema?.(), null, 2));

    const result = await ollamaClient.toStructuredOutput!(input, ArithmeticOperations, 5);
    console.log('✅ OllamaClient structured output arithmetic operations response object:', result);
    // console.log('Arithmetic Operations:', (result as ArithmeticOperations).getArithmeticOperations());

    const computedResult = (result as ArithmeticOperations).compute();
    console.log('Computed result of all operations:', computedResult);

    // arithmeticOps.forEach((op, index) => {
        // console.log(`Operation ${index + 1}: ${op.operand1} + ${op.operand2} = ${op.operate()}`);
    // });
    // if (result instanceof ArithmeticOperations) {
        // const computedResult = result.compute();
        // console.log('Computed sum of all addition operations:', computedResult);
    // }
    
    console.log('OllamaClient.structuredOutput arithmetic operations test completed.');
};


(async function main() {
    try {
        const testLLMClients = initialOllama();

        // await getModelsTest(testLLMClients.getOllamaClient());
        // await getModelInfoTest(testLLMClients.getOllamaClient());
        // await chatTest(testLLMClients.getOllamaClient());
        // await toolCallTest(testLLMClients.getOllamaClient());
        // await structuredOutputTest(testLLMClients.getOllamaClient());
        // await dtoStructuredOutputMathReasoningTest(testLLMClients.getOllamaClient());
        await structuredOutputArithmeticOperationsTest(testLLMClients.getOllamaClient());
        await shutdownOllama(testLLMClients.getOllamaClient());

        console.log('🎉 LLMClient integration test passed');
    } catch (err) {
        console.error('❌ LLMClient integration test failed:', err);
        process.exit(1);
    }
})();
