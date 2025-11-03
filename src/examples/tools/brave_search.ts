import { Tool } from '@/tools/tool';
import { ToolCall } from 'ollama';
import { WebClient } from './web_client';
import { BraveSearchClient, SearchOutput } from './brave_search_client';

@Tool({
    type: 'function',
    description: 'Run a Brave search and return top results',
    properties: {
        query: {
            type: 'string',
            description: 'The search query to run against Brave Search'
        },
    },
    required: ['query']
})
class BraveSearchTool {
    private client: WebClient = new BraveSearchClient();
    private query: string;

    constructor(query: string) {
        this.query = query;
    }

    static hydrate = (hydrationRecipe: unknown): BraveSearchTool | undefined => {
        try {
            const toolCall = hydrationRecipe as ToolCall;
            console.log('Hydrating BraveSearchTool from tool call:', toolCall);
            const { query } = toolCall.function.arguments;
            return new BraveSearchTool(query);
        } catch (e) {
            return undefined;
        }
    };

    async run(): Promise<string> {
        const results = await this.client.get?.({ query: this.query }) as SearchOutput[];
        if (!results || !results.length) return 'No results found.';
        const top = results.slice(0, 3).map((r, i) => `${i + 1}. ${r.title} — ${r.url}\n${r.description}`).join('\n\n');
        return `Top results for "${this.query}":\n\n${top}`;
    }
}

export { BraveSearchTool };
