import { Tool } from '@/tools/tool';

@Tool({
	type: "function",
	name: "get_current_weather",
	description: "Get the current weather for a given location",
	parameters: {
		location: {
			type: "string",
			description: "The name of the city e.g. San Francisco, CA"
		},
		unit: {
			type: "string",
			enum: ["C", "F"],
			description: "The temperature unit to return the weather in (C or F)"
		},
        required: ["location", "unit"]
	}
})
class WeatherTool {
    // Implement the tool's functionality here

    async run(): Promise<string> {
        // Placeholder implementation
        return `The current weather in.`;
    }
};

export { 
    WeatherTool 
};