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

type EnumProp = {
    type?: string;
    description?: string;
    enum: unknown[];
};

type EnumSchema = JsonSchema & {
    type?: string;
    description?: string;
    enum: unknown[];
};

const enumToSchema = (enumProp: EnumProp): EnumSchema => {
    if (!Array.isArray(enumProp.enum) || enumProp.enum.length === 0) {
        throw new Error("Enum values must be a non-empty array");
    }

    const schema: EnumSchema = {
        enum: [...enumProp.enum],
    };

    if (enumProp.type !== undefined) {
        schema.type = enumProp.type;
    }

    if (enumProp.description !== undefined) {
        schema.description = enumProp.description;
    }

    return schema;
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
    enumToSchema,
    SchemaValue,
    EnumProp,
    EnumSchema,
}
