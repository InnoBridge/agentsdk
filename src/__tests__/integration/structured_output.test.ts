import { SchemaDefinition, DTO, StructuredOutput } from '@/tools/structured_output';

@DTO({
    type: 'object',
    name: 'Step',
    description: 'Represents a single step in the reasoning process.'
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
    description: 'Represents the step-by-step reasoning process for solving a math problem.'
})
class MathReasoning {
    steps: Step[];
    final_answer: string;

    constructor(steps: Step[], final_answer: string) {
        this.steps = steps;
        this.final_answer = final_answer;
    }
}

const getDefinitions = (structure: Array<typeof StructuredOutput>): SchemaDefinition[] => {
    return structure.map(struct => struct.getSchema!()).filter((def): def is SchemaDefinition => def !== undefined);
};

const runStructuredOutputTest = () => {
    console.log('Starting structured output tests...');
    const schemas = getDefinitions([MathReasoning]); 
    console.log('MathReasoning schema from decorator:', JSON.stringify(schemas, null, 2));

    console.log('Structured output tests completed.');
};


(async function main() {
    try {
        // sync test

        // promise tests in order
        runStructuredOutputTest();
 

        console.log("🎉 All integration tests passed");
    } catch (err) {
        console.error("❌ Integration tests failed:", err);
        process.exit(1);
    }
})();