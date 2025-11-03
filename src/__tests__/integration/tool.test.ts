import { WeatherTool } from "@/examples/tools/weather";
import { ToolComponent, ToolDefinition } from "@/models/structured_output";
import { Config, getApplicationContext } from "@innobridge/memoizedsingleton";
import { WebClient } from "@/examples/tools/web_client";
import { TemperatureUnit, WeatherClient } from "@/examples/tools/weather_client";
import { BraveSearchClient, SearchOutput } from "@/examples/tools/brave_search_client";
import { BraveSearchTool } from "@/examples/tools/brave_search";

const { CELSIUS } = TemperatureUnit;

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

const getWeatherSchemaTest = () => {
    console.log('Getting WeatherTool schema...');

    const schema = (WeatherTool as typeof ToolComponent).getToolSchema?.();
    console.log("WeatherTool schema: ", JSON.stringify(schema, null, 2));

    console.log('✅ WeatherTool schema retrieved.');
};

const getBraveSearchSchemaTest = () => {
    console.log('Getting BraveSearchTool schema...');

    const schema = (BraveSearchTool as typeof ToolComponent).getToolSchema?.();
    console.log("BraveSearchTool schema: ", JSON.stringify(schema, null, 2));

    console.log('✅ BraveSearchTool schema retrieved.');
};

const toolTest = () => {
    console.log('Starting tool tests...');

    const toolDefinitions = getDefinitions([WeatherTool]);
    console.log("Tool Definitions:", toolDefinitions);
    console.log('Tool tests completed.');
};

const getDefinitions = (tools: Array<typeof ToolComponent>): ToolDefinition[] => {
    return tools.map(tool => tool.getToolSchema!()).filter((def): def is ToolDefinition => def !== undefined);
};

const callWeather = async () => {
    const weatherClient: WebClient = new WeatherClient();
    const data = await weatherClient.get!({ 
        location: 'San Francisco', 
        unit: CELSIUS
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

        // getWeatherSchemaTest();
        getBraveSearchSchemaTest();
        // toolTest();
        // await callWeather();
        // await callBraveSearch();

        shutdownConfig();
        console.log("🎉 All integration tests passed");
    } catch (err) {
        console.error("❌ Integration tests failed:", err);
        process.exit(1);
    }
})();