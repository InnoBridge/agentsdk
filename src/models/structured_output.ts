import type { ErrorObject } from "ajv";
import type { StructuredOutput } from "@/tools/structured_output";

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

type SchemaDefinition = {
    type: string;
    name: string;
    description: string;
    properties: Record<string, SchemaValue>;
    required: string[];
    additionalProperties?: boolean;
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

export {
    JsonSchema,
    SchemaDefinition,
    ValidatedResult,
    Repair,
    array,
    SchemaValue
}
