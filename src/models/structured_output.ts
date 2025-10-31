import type { ErrorObject } from "ajv";

type JsonSchema = Record<string, unknown>;

// Local SchemaValue type to avoid circular runtime imports.
// This mirrors the shape used by the tools module but keeps this file independent.
type SchemaValue = "string" | "number" | "boolean" | Record<string, unknown> | Array<SchemaValue> | any;

const array = (value: SchemaValue): SchemaValue => {
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