import { ToolComponent } from "@/tools/tool";

interface StructuredOutputParser<TParsed> {
    parse(input: unknown): TParsed;
}

interface LLMClient {
    chat(input: any): Promise<any>;
    toolCall?(input: any, tools: Array<typeof ToolComponent>): Promise<ToolComponent[]>;
    toStructuredOutput?<TParsed>(input: any, parser: StructuredOutputParser<TParsed>): Promise<TParsed>;
    // stream?(input: string | Message[], handler?: { onToken?: (tok: string) => void; onError?: (err: any) => void; onClose?: () => void }, opts?: CallOptions): Promise<void>;
    getModelInfo?(modelId: string): Promise<any>;
    getModels?(): Promise<string[]>;
    stop?(): Promise<void>;
};

export {
    LLMClient,
    StructuredOutputParser,
};
