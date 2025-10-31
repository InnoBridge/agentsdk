import { DTO, StructuredOutput } from "@/tools/structured_output";
import { array } from "@/models/structured_output";

@DTO({
    type: 'object',
    name: 'Step',
    description: 'Represents a single step in the reasoning process.',
    properties: {
        explanation: "string",
        output: "string",
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
        final_answer: "string",
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

@DTO({
    type: 'object',
    name: 'AdditionOperation',
    description: 'Represents an addition operation.',
    properties: {
        operand1: "number",
        operand2: "number",
    },
    required: ['operand1', 'operand2']
})
class AdditionOperation {
    operand1: number;
    operand2: number;
    
    constructor(operand1: number, operand2: number) {
        this.operand1 = operand1;
        this.operand2 = operand2;
    }

}


@DTO({
    type: 'object',
    name: 'ArithmeticOperations',
    description: 'Represents a basic arithmetic operation.',
    properties: {
        arithmeticOperations: array(AdditionOperation),
        semanticOperation: AdditionOperation,
    },
    required: ['semanticOperation']
})
class ArithmeticOperations {
    arithmeticOperations: AdditionOperation[];
    semanticOperation?: AdditionOperation;

    constructor(
        additionOperations: AdditionOperation[],
        semanticOperation?: AdditionOperation,
    ) {
        this.arithmeticOperations = additionOperations;
        this.semanticOperation = semanticOperation;
    }
}

async function getSchemaArithmeticOperationsTest() {
    console.log("ArithmeticOperations schema: ", JSON.stringify((ArithmeticOperations as typeof StructuredOutput).getSchema?.(), null, 2));
};

const getSchemaMathReasoningTest = async () => {
    const schema = (MathReasoning as typeof StructuredOutput).getSchema?.();
    // console.log("schema: ", JSON.stringify(schema, null, 2));
    console.log("schema: ", JSON.stringify(schema, null, 2))
}


(async function main() {
    try {
        // sync test

        // promise tests in order
    //    await getSchemaArithmeticOperationsTest();
       await getSchemaMathReasoningTest();

        console.log("🎉 All integration tests passed");
    } catch (err) {
        console.error("❌ Integration tests failed:", err);
        process.exit(1);
    }
})();
