import { WeatherTool } from "@/examples/tools/weather";
import { Tool, ToolComponent, ToolDefinition } from "@/tools/tool";

function toolTest() {
    console.log('Starting tool tests...');

    const toolDefinitions = getDefinitions([WeatherTool]);
    console.log("Tool Definitions:", toolDefinitions);
    console.log('Tool tests completed.');
};

const getDefinitions = (tools: Array<typeof ToolComponent>): ToolDefinition[] => {
    return tools.map(tool => tool.getDefinition!()).filter((def): def is ToolDefinition => def !== undefined);
};

(async function main() {
    try {
        // sync test

        toolTest();
 

        console.log("🎉 All integration tests passed");
    } catch (err) {
        console.error("❌ Integration tests failed:", err);
        process.exit(1);
    }
})();