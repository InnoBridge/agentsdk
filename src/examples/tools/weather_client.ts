import axios, { AxiosInstance } from "axios";
import { getConfig } from "@innobridge/memoizedsingleton";
import { WebClient } from '@/examples/tools/web_client';

interface WeatherInput {
    location: string;
    unit?: TemperatureUnit;
};

enum TemperatureUnit {
    CELCIUS = 'C',
    FARENHEIGHT = 'F',
};

interface WeatherOutput {
    name: string;
    region: string;
    country: string;
    temp: number; // temperature in the requested unit
    unit: TemperatureUnit;
    condition: string; // textual condition, e.g. 'Sunny', 'Rain'
};

/**
 * WeatherClient is a small wrapper around axios for WeatherAPI.
 * - constructor(baseUrl, apiKey) requires both values or will throw an Error.
 * - get(input) expects an object { location }
 */
class WeatherClient implements WebClient {
    private client: AxiosInstance;
    private apiKey: string;

    constructor(baseUrl?: string, apiKey?: string) {
        const base = baseUrl || getConfig('WEATHER_API_BASEURL');
        const key = apiKey || getConfig('WEATHER_API_KEY');

        if (!base) throw new Error('WEATHER_API_BASEURL is required to construct WeatherClient');
        if (!key) throw new Error('WEATHER_API_KEY is required to construct WeatherClient');

        this.apiKey = key;
        this.client = axios.create({
            baseURL: base,
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
            },
            timeout: 10_000,
        });
    }

    async get(input: WeatherInput): Promise<WeatherOutput> {
        console.log("WeatherClient get called with input:", input);
        const path = '/current.json';
        const params = {
            key: this.apiKey,
            q: input.location,
            aqi: 'no',
        };
        const unit = input.unit ?? TemperatureUnit.CELCIUS;

        const res = await this.client.get(path, { params });
        const data = res.data;

        const name = data?.location?.name ?? '';
        const region = data?.location?.region ?? '';
        const country = data?.location?.country ?? '';
        // WeatherAPI returns both temp_c and temp_f on the current object
        const tempC = data?.current?.temp_c;
        const tempF = data?.current?.temp_f;

        let temp: number;
        if (unit === TemperatureUnit.CELCIUS) {
            temp = typeof tempC === 'number' ? tempC : (typeof tempF === 'number' ? (tempF - 32) * (5 / 9) : NaN);
        } else {
            temp = typeof tempF === 'number' ? tempF : (typeof tempC === 'number' ? (tempC * 9) / 5 + 32 : NaN);
        }

        const condition = data?.current?.condition?.text ?? '';

        return {
            name,
            region,
            country,
            temp,
            unit,
            condition,
        };
    }
}

export {
    WeatherInput,
    TemperatureUnit,
    WeatherOutput,
    WeatherClient,
};