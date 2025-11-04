import type { ErrorObject } from "ajv";

type JsonSchema = Record<string, unknown>;

type StructuredOutputCtor = abstract new (...args: any[]) => StructuredOutput;

type ArraySchemaValue = {
    type: "array";
    items: SchemaValue;
};

type SchemaValue =
    | "string"
    | "number"
    | "boolean"
    | StructuredOutputCtor
    | ArraySchemaValue
    | JsonSchema;

const array = (value: SchemaValue): ArraySchemaValue => {
    return {
        type: 'array',
        items: value,
    };
};

enum StructuredOutputType {
    DTO,
    TOOL
};

type EnumProp = {
    type?: string;
    description?: string;
    enum: unknown;
};

type EnumSchema = JsonSchema & {
    type?: string;
    description?: string;
    enum: unknown[];
};

const enumToSchema = (enumProp: EnumProp): EnumSchema => {
    const values = Array.isArray(enumProp.enum)
        ? (enumProp.enum as unknown[])
        : Object.values(enumProp.enum as Record<string, unknown>);

    const schema: EnumSchema = {
        enum: values,
    };

    if (enumProp.type !== undefined) {
        schema.type = enumProp.type;
    }

    if (enumProp.description !== undefined) {
        schema.description = enumProp.description;
    }

    return schema;
};

interface SchemaDefinition {
    type: string;
    name?: string;
    description: string;
    properties: Record<string, SchemaValue>;
    required: string[];
    additionalProperties?: boolean;
    strict?: boolean;
    allowNoSchema?: boolean;
};

type Repair = {
    attempt: string;
    originalCandidate: unknown;
    candidate: unknown;
    error?: string;
    timestamp?: string;
};

type ValidatedResult = {
    valid: boolean;
    candidate: unknown;
    originalCandidate: unknown;
    errors?: ErrorObject[] | null;
    repairs?: Repair[];
};

class StructuredOutput {
    constructor(..._args: any[]) {
    }

    static getSchema?: () => JsonSchema | undefined;

    static validate?: (originalHydrationRecipe: unknown, previousRepairs?: Repair[]) => ValidatedResult;

    static hydrate?: (hydrationRecipe: unknown) => StructuredOutput | undefined;
}

class ToolComponent extends StructuredOutput {

    static getToolSchema?: () => ToolDefinition | undefined;
   
    async run(params?: unknown): Promise<unknown> {
        // Base implementation is a no-op; concrete tools should override.
        return undefined;
    }
}

interface ToolDefinition {
    name?: string;
    description?: string;
    type?: string;
    parameters?: {
        type?: string;
        items?: any;
        properties?: JsonSchema;
        required?: string[];
        additionalProperties?: boolean;
    };
    strict?: boolean;
};


export { 
    JsonSchema, 
    StructuredOutputType, 
    array, 
    enumToSchema,
    ToolDefinition,
    StructuredOutput,
    ToolComponent
};
export type {
  SchemaDefinition,
  ValidatedResult,
  Repair,
  SchemaValue,
  EnumProp,
  EnumSchema,
};

