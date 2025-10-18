interface LLMClient {
    chat(input: any): Promise<any>;
    // toolCall?(input: any, tools: Tool[]): Promise<Tool[]>;
    // stream?(input: string | Message[], handler?: { onToken?: (tok: string) => void; onError?: (err: any) => void; onClose?: () => void }, opts?: CallOptions): Promise<void>;
    getModelInfo?(modelId: string): Promise<any>;
    getModels?(): Promise<string[]>;
    stop?(): Promise<void>;
};

export {
    LLMClient
};
