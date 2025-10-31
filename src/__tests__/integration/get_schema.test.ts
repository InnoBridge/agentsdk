import { StructuredOutput } from "@/tools/structured_output";
import {
    MathReasoning,
    ArithmeticOperations,
} from "@/__tests__/models/structured_output";

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
