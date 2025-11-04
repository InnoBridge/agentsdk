import { StructuredOutput } from "@/models/structured_output";
import {
    MathReasoning,
    ArithmeticOperations,
    UserProfile,
    TelemetryReading,
} from "@/__tests__/models/structured_output";
import { WeatherTool } from "@/examples/tools/weather";
import { BraveSearchTool } from "@/examples/tools/brave_search";

async function getSchemaArithmeticOperationsTest() {
    console.log("ArithmeticOperations schema: ", JSON.stringify((ArithmeticOperations as typeof StructuredOutput).getSchema?.(), null, 2));
};

const getSchemaMathReasoningTest = async () => {
    const schema = (MathReasoning as typeof StructuredOutput).getSchema?.();
    // console.log("schema: ", JSON.stringify(schema, null, 2));
    console.log("schema: ", JSON.stringify(schema, null, 2))
}

const getSchemaUserProfileTest = async () => {
    const schema = (UserProfile as typeof StructuredOutput).getSchema?.();
    console.log("UserProfile schema: ", JSON.stringify(schema, null, 2));
};

const getSchemaTelemetryReadingTest = async () => {
    const schema = (TelemetryReading as typeof StructuredOutput).getSchema?.();
    console.log("TelemetryReading schema: ", JSON.stringify(schema, null, 2));
};

const getSchemaWeatherToolTest = async () => {
    const schema = (WeatherTool as typeof StructuredOutput).getSchema?.();
    console.log("WeatherTool schema: ", JSON.stringify(schema, null, 2));
};

const getSchemaBraveSearchToolTest = async () => {
    const schema = (BraveSearchTool as typeof StructuredOutput).getSchema?.();
    console.log("BraveSearchTool schema: ", JSON.stringify(schema, null, 2));
};

(async function main() {
    try {
        // sync test

        // promise tests in order
        //  await getSchemaArithmeticOperationsTest();
        // await getSchemaMathReasoningTest();
        //  await getSchemaUserProfileTest();
        //  await getSchemaTelemetryReadingTest();
        // await getSchemaWeatherToolTest();
        await getSchemaBraveSearchToolTest();

        console.log("🎉 All integration tests passed");
    } catch (err) {
        console.error("❌ Integration tests failed:", err);
        process.exit(1);
    }
})();
