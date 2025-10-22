import { WeatherTool } from "@/examples/tools/weather";
import { Tool, ToolComponent, ToolDefinition } from "@/tools/tool";
import { Config, getApplicationContext, getConfig } from "@innobridge/memoizedsingleton";
import { WebClient } from "@/examples/tools/web_client";
import { TemperatureUnit, WeatherClient } from "@/examples/tools/weather_client";
import { BraveSearchClient, SearchOutput } from "@/examples/tools/brave_search_client";

const { CELCIUS } = TemperatureUnit;

const initialConfig = () => {
    console.log('Initializing Weather API client with base URL from config...');

    new Config(['WEATHER_API_BASEURL', 'WEATHER_API_KEY', 'BRAVE_SEARCH_BASEURL', 'BRAVE_SEARCH_API_KEY']);
};

const shutdownConfig = () => {
    console.log('Shutting down Weather API client...');
    // No specific shutdown logic for WeatherClient as of now
    const config = getApplicationContext(Config);
    if (config) {
        config.stop();
    }
    console.log('✅ Weather API client shut down.');
};

function toolTest() {
    console.log('Starting tool tests...');

    const toolDefinitions = getDefinitions([WeatherTool]);
    console.log("Tool Definitions:", toolDefinitions);
    console.log('Tool tests completed.');
};

const getDefinitions = (tools: Array<typeof ToolComponent>): ToolDefinition[] => {
    return tools.map(tool => tool.getDefinition!()).filter((def): def is ToolDefinition => def !== undefined);
};

const callWeather = async () => {
    const weatherClient: WebClient = new WeatherClient();
    const data = await weatherClient.get!({ 
        location: 'San Francisco', 
        unit: CELCIUS
    });
    console.log("Weather Data:", data);
}

const callBraveSearch = async () => {
    const braveSearchClient: WebClient = new BraveSearchClient();
    const data: SearchOutput[] = await braveSearchClient.get!({
        query: 'Is AWS still down?'
    });

    data.forEach(item => {
        console.log("search result item:", item);
    });
};

(async function main() {
    try {
        // sync test

        initialConfig();

        toolTest();
        await callWeather();
        await callBraveSearch();

        shutdownConfig();
        console.log("🎉 All integration tests passed");
    } catch (err) {
        console.error("❌ Integration tests failed:", err);
        process.exit(1);
    }
})();