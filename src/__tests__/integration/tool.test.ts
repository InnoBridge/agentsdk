import { Tool, ToolComponent, ToolDefinition } from "@/tools/tool";

function toolTest() {
    console.log('Starting tool tests...');

    @Tool({
	type: "function",
	name: "get_temperature",
	description: "Get the current temperature for a city",
	parameters: {
		type: "object",
		required: ["city"],
		properties: {
			city: { type: "string", description: "The name of the city" },
		},
	    },
    })
    class GetTemperatureTool {
        // Implement the tool's functionality here
    }

    const toolDefinitions = getDefinitions([GetTemperatureTool]);
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