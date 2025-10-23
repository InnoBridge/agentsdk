import { SchemaDefinition, Structure, StructuredOutput } from '@/tools/structured_output';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

const ZodStep = z.object({
  explanation: z.string(),
  output: z.string(),
});

const ZodMathReasoning = z.object({
  steps: z.array(ZodStep),
  final_answer: z.string(),
});

@Structure({
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

@Structure({
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
    // const jsonSchema = zodToJsonSchema(ZodMathReasoning);
    // console.log('Generated JSON Schema:', JSON.stringify(jsonSchema, null, 2));
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