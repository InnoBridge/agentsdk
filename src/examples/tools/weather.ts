import { Tool } from '@/tools/tool';
import { ToolCall } from 'ollama';
import { WebClient } from './web_client';
import { WeatherClient } from './weather_client';

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
			enum: ["celsius", "fahrenheit"],
			description: "The temperature unit to return the weather in (Celsius or Fahrenheit)"
		},
        required: ["location", "unit"]
	}
})
class WeatherTool {
    
    private weatherClient: WebClient = new WeatherClient();
    private location: string;
    private unit?: string;

    constructor(location: string, unit?: string) {
        this.location = location;
        this.unit = unit;
    }
    
    static hydrate = (toolCall: ToolCall): WeatherTool | undefined => {
        const { location, unit } = toolCall.function.arguments;
        return new WeatherTool(location, unit);
    };

    async run(): Promise<string> {
        const weather = await this.weatherClient.get?.({
            location: this.location,
            unit: this.unit
        });
        return `The current weather in ${weather.name}, ${weather.region}, ${weather.country} is ${weather.temp}° ${weather.unit}. Condition: ${weather.condition}.`;
    }
};

export { 
    WeatherTool 
};