import { StructuredOutput } from "@/tools/structured_output";
import { ToolComponent } from "@/tools/tool";

interface LLMClient {
    chat(input: any): Promise<any>;
    toolCall?(input: any, tools: Array<typeof ToolComponent>): Promise<ToolComponent[]>;
    toStructuredOutput?(input: any, dto: typeof StructuredOutput): Promise<void>;
    // stream?(input: string | Message[], handler?: { onToken?: (tok: string) => void; onError?: (err: any) => void; onClose?: () => void }, opts?: CallOptions): Promise<void>;
    getModelInfo?(modelId: string): Promise<any>;
    getModels?(): Promise<string[]>;
    stop?(): Promise<void>;
};

export {
    LLMClient
};
