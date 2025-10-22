import axios, { AxiosInstance } from "axios";
import { getConfig } from "@innobridge/memoizedsingleton";
import { WebClient } from '@/examples/tools/web_client';
import { title } from "process";

interface Query {
    query: string;
};

interface SearchOutput {
    title: string;
    url: string;
    description: string;
};

/**
 * BraveSearchClient is a small wrapper around axios for Brave Search API.
 * - constructor(baseUrl, apiKey) requires both values or will throw an Error.
 * - get(input) expects an object { query }
 */
class BraveSearchClient implements WebClient {
    private client: AxiosInstance;

    constructor(baseUrl?: string, apiKey?: string) {
        const base = baseUrl || getConfig('BRAVE_SEARCH_BASEURL');
        const key = apiKey || getConfig('BRAVE_SEARCH_API_KEY');

        if (!base) throw new Error('BRAVE_SEARCH_BASEURL is required to construct BraveSearchClient');
        if (!key) throw new Error('BRAVE_SEARCH_API_KEY is required to construct BraveSearchClient');
    
        this.client = axios.create({
            baseURL: base,
            headers: {
                'Accept': 'application/json',
                'Accept-Encoding': 'gzip',
                'X-Subscription-Token': key,
            },
            timeout: 10_000,
        });
    }

    async get(input: Query): Promise<SearchOutput[]> {
        console.log("BraveSearchClient get called with input:", input);
        const path = '/res/v1/web/search';
        const params = {
            q: input.query,
            count: '3',
        };

        const res = await this.client.get(path, { params });
        const data = res.data;

        return data.web.results.map((item: any) => ({
            title: item.title,
            url: item.url,
            description: item.description,
        } as SearchOutput));
    }
}

export {
    BraveSearchClient,
    Query,
    SearchOutput,
};