import { ValidatedResult } from "@/models/structured_output";
import { StructuredOutput } from "@/tools/structured_output";
import { ToolComponent } from "@/tools/tool";

class StructuredOutputValidationError extends Error {
    validationResult: ValidatedResult | undefined;
    constructor(message: string, validationResult: ValidatedResult | undefined) {
        super(message);
        this.name = 'StructuredOutputValidationError';
        this.validationResult = validationResult;
    }
}

interface LLMClient {
    chat(input: any): Promise<any>;
    toolCall?(input: any, tools: Array<typeof ToolComponent>): Promise<ToolComponent[]>;
    toStructuredOutput?<T extends typeof StructuredOutput>(input: any, dto: T, retries?: number): Promise<InstanceType<T> | StructuredOutputValidationError>;
    // stream?(input: string | Message[], handler?: { onToken?: (tok: string) => void; onError?: (err: any) => void; onClose?: () => void }, opts?: CallOptions): Promise<void>;
    getModelInfo?(modelId: string): Promise<any>;
    getModels?(): Promise<string[]>;
    stop?(): Promise<void>;
};

export {
    LLMClient,
    StructuredOutputValidationError
};
