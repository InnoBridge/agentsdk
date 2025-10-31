import type { SchemaDefinition, SchemaValue } from "@/models/structured_output";
import { getRegisteredDto } from "@/tools/structured_output";

export type JsonSchema = Record<string, unknown>;

type ResolveStructuredSchema = (ctor: Function) => JsonSchema | undefined;

const buildJSONFromSchema = (
    schemaDefinition: SchemaDefinition,
    resolveStructuredSchema: ResolveStructuredSchema
): JsonSchema => {
    const jsonSchema: JsonSchema = {
        type: schemaDefinition.type,
        name: schemaDefinition.name,
        description: schemaDefinition.description,
        properties: {},
        required: schemaDefinition.required,
        additionalProperties: schemaDefinition.additionalProperties ?? false,
    };

    const properties = buildPropertySchema(schemaDefinition.properties, resolveStructuredSchema);
    jsonSchema.properties = properties;
    return jsonSchema;
};

const buildPropertySchema = (
    properties: Record<string, SchemaValue>,
    resolveStructuredSchema: ResolveStructuredSchema
): JsonSchema => {
    const jsonProperties: JsonSchema = {};
    for (const [key, value] of Object.entries(properties)) {
        jsonProperties[key] = buildSchemaValue(value, resolveStructuredSchema);
    }
    return jsonProperties;
};

const buildSchemaValue = (
    schemaValue: SchemaValue,
    resolveStructuredSchema: ResolveStructuredSchema
): JsonSchema => {
    switch (typeof schemaValue) {
        case "string":
            return { type: schemaValue };
        case "number":
        case "boolean":
            // these branches shouldn't happen given SchemaValue definition,
            // but keep fallbacks for completeness
            return { type: typeof schemaValue };
        case "function": {
    
            const resolved = resolveStructuredSchema(schemaValue);
            if (resolved) return resolved;
            throw new Error(`Unsupported function schema value: ${schemaValue.name ?? schemaValue}`);
        }
        case "object": {

            if (schemaValue === null) {
                throw new Error("Null schema values are not supported");
            }

            if (Array.isArray(schemaValue)) {
                return {
                    type: "array",
                    items: schemaValue.length === 1
                        ? buildSchemaValue(schemaValue[0], resolveStructuredSchema)
                        : schemaValue.map((value) => buildSchemaValue(value, resolveStructuredSchema))
                };
            }

            if ((schemaValue as any).type === "array") {
                const items = (schemaValue as any).items;
                return {
                    type: "array",
                    items: buildSchemaValue(items, resolveStructuredSchema)
                };
            }

            return schemaValue as JsonSchema;
        }
        default:
            throw new Error(`Unsupported schema value: ${String(schemaValue)}`);
    }
};

export { buildJSONFromSchema };
