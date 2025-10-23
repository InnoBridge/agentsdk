import { ToolComponent } from "@/tools/tool";
import { ZodType, ZodTypeDef } from "zod";

interface LLMClient {
    chat(input: any): Promise<any>;
    toolCall?(input: any, tools: Array<typeof ToolComponent>): Promise<ToolComponent[]>;
    toStructuredOutput?<TParsed>(input: any, schema: ZodType<TParsed, ZodTypeDef, any>): Promise<TParsed>;
    // stream?(input: string | Message[], handler?: { onToken?: (tok: string) => void; onError?: (err: any) => void; onClose?: () => void }, opts?: CallOptions): Promise<void>;
    getModelInfo?(modelId: string): Promise<any>;
    getModels?(): Promise<string[]>;
    stop?(): Promise<void>;
};

export {
    LLMClient
};
