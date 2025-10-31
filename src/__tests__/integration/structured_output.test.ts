import { StructuredOutput } from '@/tools/structured_output';
import { JSONSchema } from 'openai/lib/jsonschema.js';
import {
    Step,
    Metadata,
    ReasoningSummary,
    MathReasoning,
    ArithmeticOperations,
    UserProfile,
    Address,
    TelemetryReading,
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

const structuredOutputGetUserProfileSchemaTest = () => {
    console.log('Starting structured output tests for UserProfile...');
    const schemas = getSchema([UserProfile]);
    console.log('UserProfile schema from decorator:', JSON.stringify(schemas, null, 2));

    console.log('Structured output tests for UserProfile completed.');
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

const testUserProfileHydration = () => {
    console.log('Starting UserProfile hydration test...');
    const profileRecipe = {
        id: 'user-001',
        displayName: 'Ada Lovelace',
        age: '37',
        isActive: 'true',
        primaryAddress: {
            line1: '123 Analytical Engine Way',
            city: 'London',
            country: 'UK',
        },
        previousAddresses: [
            {
                line1: '42 Binary Road',
                city: 'Cambridge',
                country: 'UK',
                postalCode: 'CB1',
            },
        ],
        emails: ['ada@example.com'],
    };

    const hydratedProfile = (UserProfile as typeof StructuredOutput).hydrate?.(profileRecipe);
    console.log('Hydrated UserProfile instance:', hydratedProfile);
    if (!hydratedProfile) throw new Error('Expected UserProfile hydration to produce an instance');
    if (!(hydratedProfile instanceof UserProfile)) throw new Error('Hydration result is not a UserProfile instance');
    if (hydratedProfile.age !== 37) throw new Error('Expected age to coerce into a number');
    if (hydratedProfile.isActive !== true) throw new Error('Expected isActive to coerce into a boolean');
    if (!(hydratedProfile.primaryAddress instanceof Address)) throw new Error('Primary address did not hydrate into Address');
    if (hydratedProfile.previousAddresses.length !== 1) throw new Error('Previous addresses length mismatch');
    if (!(hydratedProfile.previousAddresses[0] instanceof Address)) throw new Error('Previous address did not hydrate into Address');
    console.log('UserProfile hydration test passed');
};

const testTelemetryReadingCoercion = () => {
    console.log('Starting TelemetryReading hydration test...');
    const readingRecipe = {
        deviceId: 'sensor-123',
        temperatureCelsius: '21.5',
        humidityPercentage: '55',
        isOnline: 'false',
        notes: ['scheduled calibration']
    };

    const validationPayload = {
        deviceId: 'sensor-123',
        temperatureCelsius: 21.5,
        humidityPercentage: 55,
        isOnline: true,
        notes: ['scheduled calibration']
    };
    const validation = (TelemetryReading as typeof StructuredOutput).validate?.(validationPayload);
    if (!validation?.valid) throw new Error('Expected TelemetryReading validation to succeed');

    const hydratedReading = (TelemetryReading as typeof StructuredOutput).hydrate?.(readingRecipe);
    console.log('Hydrated TelemetryReading instance:', hydratedReading);
    if (!hydratedReading) throw new Error('Expected TelemetryReading hydration to produce an instance');
    if (!(hydratedReading instanceof TelemetryReading)) throw new Error('Hydration result is not a TelemetryReading instance');
    if (hydratedReading.temperatureCelsius !== 21.5) throw new Error('Temperature did not coerce into a number');
    if (hydratedReading.humidityPercentage !== 55) throw new Error('Humidity did not coerce into a number');
    if (hydratedReading.isOnline !== false) throw new Error('Boolean coercion failed for isOnline');
    console.log('TelemetryReading hydration test passed');
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
        // structuredOutputGetUserProfileSchemaTest();
        // testReasoningSummaryHydration();
        // testUserProfileHydration();
        testTelemetryReadingCoercion();

        console.log("🎉 All integration tests passed");
    } catch (err) {
        console.error("❌ Integration tests failed:", err);
        process.exit(1);
    }
})();
