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
		format: {
			type: "string",
			enum: ["celsius", "fahrenheit"],
			description: "The format to return the weather in"
		},
        required: ["location", "format"]
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