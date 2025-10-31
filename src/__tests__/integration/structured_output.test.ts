import { StructuredOutput } from '@/tools/structured_output';
import { JSONSchema } from 'openai/lib/jsonschema.js';
import {
    Step,
    Metadata,
    ReasoningSummary,
    MathReasoning,
    ArithmeticOperations,
} from '@/__tests__/models/structured_output';

const getSchema = (structure: Array<typeof StructuredOutput>): JSONSchema[] => {
    return structure.map(struct => struct.getSchema!()).filter(Boolean) as JSONSchema[];
};

const structuredOutputGetMathLogicSchemaTest = () => {
    console.log('Starting structured output tests...');
    const schemas = getSchema([MathReasoning]);
    console.log('MathReasoning schema from decorator:', JSON.stringify(schemas, null, 2));

    console.log('Structured output tests completed.');
};

const structuredOutputGetArithmeticOperationsSchemaTest = () => {
    console.log('Starting structured output tests for ArithmeticOperations...');
    const schemas = getSchema([ArithmeticOperations]);
    console.log('ArithmeticOperations schema from decorator:', JSON.stringify(schemas, null, 2));

    console.log('Structured output tests for ArithmeticOperations completed.');
}

const structuredOutputValidationTest = () => {
    console.log('Starting structured output validation tests...');
    // Add your validation tests here
    const candidate = `{ "steps": [ {"explanation": "I need to solve the equation 8x + 7 = -23 for x.", "output": "8x + 7 = -23"}, {"explanation": "First, I'll subtract 7 from both sides to isolate the term with x.", "output": "8x + 7 - 7 = -23 - 7"}, {"explanation": "Simplifying both sides.", "output": "8x = -30"}, {"explanation": "Now I'll divide both sides by 8 to solve for x.", "output": "8x ÷ 8 = -30 ÷ 8"}, {"explanation": "Simplifying the division.", "output": "x = -30/8"}, {"explanation": "I can simplify this fraction by dividing both numerator and denominator by their greatest common divisor, which is 2.", "output": "x = -15/4"}, {"explanation": "Converting to decimal form if needed: -15 ÷ 4 = -3.75", "output": "x = -3.75"} ], "final_answer": "x = -15/4 or x = -3.75" }`;
    const validationResult = (MathReasoning as typeof StructuredOutput).validate?.(candidate);
    console.log('Structured output validation result:', validationResult);
    console.log('Structured output validation tests completed.');

    const invalidCandidate = `{ "steps": [ {"explanation": "I need to solve the equation 8x + 7 = -23 for x.", "output": 123}, {"explanation": "First, I'll subtract 7 from both sides to isolate the term with x.", "output": "8x + 7 - 7 = -23 - 7"} ], "final_answer": "x = -15/4 or x = -3.75" }`;
    const invalidValidationResult = (MathReasoning as typeof StructuredOutput).validate?.(invalidCandidate);
    console.log('Structured output validation result for invalid candidate:', invalidValidationResult);

    console.log('Structured output validation tests completed.');
};

const testMathReasoningHydration = () => {
    console.log('Starting MathReasoning hydration test...');
    const validatedResponse = `{ "steps": [ {"explanation": "I need to solve the equation 8x + 7 = -23 for x.", "output": "8x + 7 = -23"}, {"explanation": "First, I'll subtract 7 from both sides to isolate the term with x.", "output": "8x + 7 - 7 = -23 - 7"}, {"explanation": "Simplifying both sides.", "output": "8x = -30"}, {"explanation": "Now I'll divide both sides by 8 to solve for x.", "output": "8x ÷ 8 = -30 ÷ 8"}, {"explanation": "Simplifying the division.", "output": "x = -30/8"}, {"explanation": "I can simplify this fraction by dividing both numerator and denominator by their greatest common divisor, which is 2.", "output": "x = -15/4"}, {"explanation": "Converting to decimal form if needed: -15 ÷ 4 = -3.75", "output": "x = -3.75"} ], "final_answer": "x = -15/4 or x = -3.75" }`;

    const hydrationResult = (MathReasoning as typeof StructuredOutput).hydrate?.(validatedResponse);
    if (!hydrationResult) throw new Error('Expected hydration to produce a MathReasoning instance');
    if (!(hydrationResult instanceof MathReasoning)) throw new Error('Hydration result is not an instance of MathReasoning');
    if (!Array.isArray(hydrationResult.steps) || hydrationResult.steps.length !== 7) throw new Error('Hydrated steps array does not match expected length');
    const firstStep = hydrationResult.steps[0];
    if (!(firstStep instanceof Step)) throw new Error('Hydrated step is not an instance of Step');
    if (firstStep.explanation !== 'I need to solve the equation 8x + 7 = -23 for x.') throw new Error('Hydrated step explanation does not match');
    if (hydrationResult.final_answer !== 'x = -15/4 or x = -3.75') throw new Error('Hydrated final answer does not match');
    console.log('MathReasoning hydration test passed');
};

const testObjectRecipeHydration = () => {
    console.log('Starting object-recipe hydration test...');
    const objectRecipeHydration = (MathReasoning as typeof StructuredOutput).hydrate?.({
        steps: [
            { explanation: 'Step one explanation', output: 'Step one output' },
            { explanation: 'Step two explanation', output: 'Step two output' }
        ],
        final_answer: 'Step two output'
    });
    if (!objectRecipeHydration) throw new Error('Hydration from object recipe should succeed');
    if (!(objectRecipeHydration instanceof MathReasoning)) throw new Error('Hydration from object recipe did not produce a MathReasoning instance');
    if (objectRecipeHydration.steps.length !== 2) throw new Error('Object recipe hydration returned unexpected number of steps');
    if (!(objectRecipeHydration.steps[1] instanceof Step) || objectRecipeHydration.steps[1].output !== 'Step two output') throw new Error('Hydrated step from object recipe does not match expected output');
    console.log('Object-recipe hydration test passed');
};

const testInvalidHydrations = () => {
    console.log('Starting invalid hydration tests...');
    const invalidHydration = (MathReasoning as typeof StructuredOutput).hydrate?.('not-json');
    if (invalidHydration !== undefined) throw new Error('Hydration should return undefined for invalid JSON input');
    const invalidShapeRecipe = { steps: 'not-an-array', final_answer: 42 };
    const invalidShapeValidation = (MathReasoning as typeof StructuredOutput).validate?.(invalidShapeRecipe);
    if (invalidShapeValidation && invalidShapeValidation.valid) throw new Error('Validation should fail for invalid MathReasoning shape');
    console.log('Invalid hydration tests passed');
};

const testReasoningSummaryHydration = () => {
    console.log('Starting ReasoningSummary hydration test...');
    const summaryRecipe = {
        steps: [
            { explanation: 'Summarise inputs', output: 'Collected data points' },
            { explanation: 'Compute mean', output: 'Average calculated' }
        ],
        metadata: {
            source: 'unit-test',
            confidence: 0.87
        },
        tags: ['statistics', 'summary']
    };
    const summaryInstance = (ReasoningSummary as typeof StructuredOutput).hydrate?.(summaryRecipe);
    console.log('Hydrated ReasoningSummary instance:', summaryInstance);
    if (!summaryInstance) throw new Error('Expected ReasoningSummary hydration to succeed');
    if (!(summaryInstance instanceof ReasoningSummary)) throw new Error('ReasoningSummary hydration did not return a ReasoningSummary instance');
    if (!(summaryInstance.metadata instanceof Metadata)) throw new Error('ReasoningSummary metadata did not hydrate into Metadata instance');
    if (summaryInstance.metadata.confidence !== 0.87) throw new Error('ReasoningSummary metadata confidence did not match expected value');
    if (summaryInstance.tags.join(',') !== 'statistics,summary') throw new Error('ReasoningSummary tags did not hydrate as expected');

    const summaryStringRecipe = JSON.stringify({
        steps: [
            { explanation: 'Check optional metadata', output: 'No confidence provided' }
        ],
        metadata: {
            source: 'fallback-test'
        },
        tags: []
    });
    const summaryStringInstance = (ReasoningSummary as typeof StructuredOutput).hydrate?.(summaryStringRecipe);
    console.log('Hydrated ReasoningSummary instance from string recipe:', summaryStringInstance);
    if (!summaryStringInstance) throw new Error('ReasoningSummary hydration from string recipe should succeed');
    if (!(summaryStringInstance instanceof ReasoningSummary)) throw new Error('ReasoningSummary string hydration did not return a ReasoningSummary instance');
    if (summaryStringInstance.metadata.confidence !== undefined) throw new Error('Optional metadata confidence should remain undefined when omitted');
    const invalidSummaryRecipe = {
        steps: [{ explanation: 'Invalid metadata shape', output: 'will fail' }],
        metadata: 'not-an-object',
        tags: ['invalid']
    };
    const invalidSummaryValidation = (ReasoningSummary as typeof StructuredOutput).validate?.(invalidSummaryRecipe);
    console.log('Invalid metadata shape validation result:', invalidSummaryValidation);
    if (invalidSummaryValidation && invalidSummaryValidation.valid) throw new Error('Validation should fail for ReasoningSummary with invalid metadata shape');
    console.log('ReasoningSummary hydration test passed');
};

(async function main() {
    try {
        // sync test

        // promise tests in order
    // structuredOutputGetMathLogicSchemaTest();
    // structuredOutputGetArithmeticOperationsSchemaTest();
    // structuredOutputValidationTest();
    // testMathReasoningHydration();
    // testObjectRecipeHydration();
    // testInvalidHydrations();
    testReasoningSummaryHydration();

        console.log("🎉 All integration tests passed");
    } catch (err) {
        console.error("❌ Integration tests failed:", err);
        process.exit(1);
    }
})();
