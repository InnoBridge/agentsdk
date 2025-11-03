import { SchemaDefinition, SchemaValue, StructuredOutputType } from "@/models/structured_output";
import type { StructuredOutput } from "@/models/structured_output";

export type JsonSchema = Record<string, unknown>;
export type HydrationRecipe = Record<string, unknown>;

export type StoredSchema = JsonSchema & {
    properties: Record<string, any>;
    required: string[];
    constructorArgs?: Array<{ name: string; optional?: boolean }>;
};

type ResolveStructuredSchema = (ctor: Function) => JsonSchema | undefined;
type ResolveDto = (name: string) => typeof StructuredOutput | undefined;

//--------------------helpers for StructuredOutput.getSchema() --------------------

const buildJSONFromSchema = (
    schemaDefinition: SchemaDefinition,
    resolveStructuredSchema: ResolveStructuredSchema,
    structuredOutputType: StructuredOutputType
): JsonSchema => {
    const jsonSchema: JsonSchema = {
        type: schemaDefinition.type,
        name: schemaDefinition.name,
        description: schemaDefinition.description,
        properties: {},
        required: schemaDefinition.required,
        ...(schemaDefinition.additionalProperties !== undefined
            ? { additionalProperties: schemaDefinition.additionalProperties }
            : {}),
        ...(schemaDefinition.strict !== undefined ? { strict: schemaDefinition.strict } : {}),
        ...(schemaDefinition.allowNoSchema !== undefined
            ? { allowNoSchema: schemaDefinition.allowNoSchema }
            : {}),
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
                } as JsonSchema;
            }

            const { type, properties, items, ...rest } = schemaValue as Record<string, unknown>;

            if (type === "array") {
                const normalizedItems = items !== undefined
                    ? buildSchemaValue(items as SchemaValue, resolveStructuredSchema)
                    : undefined;

                return {
                    type,
                    ...rest,
                    ...(normalizedItems !== undefined ? { items: normalizedItems } : {}),
                } as JsonSchema;
            }

            if (type === "object" && properties && typeof properties === "object" && !Array.isArray(properties)) {
                const normalizedProperties: Record<string, unknown> = {};
                for (const [key, value] of Object.entries(properties as Record<string, SchemaValue>)) {
                    normalizedProperties[key] = buildSchemaValue(value, resolveStructuredSchema);
                }

                return {
                    type,
                    ...rest,
                    properties: normalizedProperties,
                } as JsonSchema;
            }

            if (type === "string" || type === "number" || type === "boolean") {
                return {
                    type,
                    ...rest,
                } as JsonSchema;
            }

            return {
                ...schemaValue,
            } as JsonSchema;
        }
        default:
            throw new Error(`Unsupported schema value: ${String(schemaValue)}`);
    }
};

//--------------------helpers for StructuredOutput.hydrate() --------------------

type ConstructorArgument =
    | string
    | number
    | boolean
    | StructuredOutput
    | StructuredOutput[]
    | undefined;

const hydrateWithConstructor = (
    ctor: typeof StructuredOutput,
    recipe: HydrationRecipe,
    schema: StoredSchema,
    resolveDto: ResolveDto
): StructuredOutput | undefined => {
    const propertyArgs = mapSchemaPropertyToConstructorArgument(
        schema.properties,
        recipe,
        schema.required,
        resolveDto,
    );

    const rawCtorMeta =
        schema.constructorArgs ??
        Object.keys(schema.properties).map((name: string) => ({
            name,
            optional: !schema.required.includes(name),
        }));

    const ctorMeta: Array<{ name: string; optional: boolean }> = rawCtorMeta.map(({ name, optional }) => ({
        name,
        optional: Boolean(optional),
    }));

    const args = ctorMeta.map(({ name }) => propertyArgs.get(name));

    try {
        return Reflect.construct(ctor, args);
    } catch (error) {
        console.error(`Failed to construct ${ctor.name}`, error, args);
        return undefined;
    }
};

const mapSchemaPropertyToConstructorArgument = (
    properties: Record<string, any>,
    recipe: HydrationRecipe,
    required: string[],
    resolveDto: ResolveDto,
): Map<string, ConstructorArgument> => {
    const propertyToConstructorArgumentMap = new Map<string, ConstructorArgument>();
    for (const [propertyName, propertySchema] of Object.entries(properties)) {
        const propertyValue = buildPropertyArgument(
            propertyName,
            propertySchema,
            recipe,
            required.includes(propertyName),
            resolveDto,
        );
        propertyToConstructorArgumentMap.set(propertyName, propertyValue);
    }

    return propertyToConstructorArgumentMap;
};

const buildPropertyArgument = (
    propertyName: string,
    propertySchema: any,
    recipe: HydrationRecipe,
    required: boolean,
    resolveDto: ResolveDto,
): ConstructorArgument => {
    switch (propertySchema.type) {
        case "string": {
            const stringValue = recipe[propertyName];
            if (typeof stringValue !== "string" && required) {
                throw new Error(`Property ${propertyName} is required to be a string, but got: ${stringValue}`);
            } else if (typeof stringValue === "string") {
                return stringValue;
            } else {
                return undefined;
            }
        }
        case "number": {
            const numberValue = recipe[propertyName];
            if ((numberValue === null || numberValue === undefined) && required) {
                throw new Error(`Property ${propertyName} is required to be a number, but got: ${numberValue}`);
            }
            if (typeof numberValue === "number") {
                return numberValue;
            }
            if (typeof numberValue === "string") {
                const trimmed = numberValue.trim();
                if (trimmed !== "" && !Number.isNaN(Number(trimmed))) {
                    const coerced = Number(trimmed);
                    return coerced;
                }
            }
            return undefined;
        }
        case "boolean": {
            const booleanValue = recipe[propertyName];
            if ((booleanValue === null || booleanValue === undefined) && required) {
                throw new Error(`Property ${propertyName} is required to be a boolean, but got: ${booleanValue}`);
            }
            if (typeof booleanValue === "boolean") {
                return booleanValue;
            }
            if (typeof booleanValue === "string") {
                const trimmed = booleanValue.trim().toLowerCase();
                if (trimmed === "true") return true;
                if (trimmed === "false") return false;
                if (trimmed === "1") return true;
                if (trimmed === "0") return false;
            }
            return undefined;
        }
        case "array": {
            const arrayValue = recipe[propertyName];
            if (!Array.isArray(arrayValue)) {
                if (required) {
                    throw new Error(`Expected array for property ${propertyName}`);
                }
                return undefined;
            }

            const itemType = propertySchema.items?.type;

            switch (itemType) {
                case "object": {
                    const dto = resolveDto(propertySchema.items.name);
                    if (!dto) {
                        throw new Error(`Unknown DTO ${propertySchema.items.name} in array property ${propertyName}`);
                    }

                    return arrayValue.map((item) => {
                        if (typeof dto.hydrate === "function") {
                            return dto.hydrate(item) ?? item;
                        }
                        const instance = Object.create(dto.prototype);
                        return Object.assign(instance, item);
                    }) as StructuredOutput[];
                }
                case "string":
                    return arrayValue as ConstructorArgument;
                case "number":
                    return arrayValue.map((item) =>
                        typeof item === "number" ? item : Number(item),
                    ) as ConstructorArgument;
                case "boolean":
                    return arrayValue.map((item) => {
                        if (typeof item === "boolean") return item;
                        const normalized = String(item).trim().toLowerCase();
                        if (normalized === "true" || normalized === "1") return true;
                        if (normalized === "false" || normalized === "0") return false;
                        return Boolean(item);
                    }) as ConstructorArgument;
                default:
                    throw new Error(`Unsupported array item type: ${itemType}`);
            }
        }
        case "object": {
            const objectValue = recipe[propertyName];
            const dto = resolveDto(propertySchema.name);
            if (dto && typeof dto.hydrate === "function") {
                const hydratedObject = dto.hydrate(objectValue);
                return hydratedObject;
            }
            return undefined;
        }
        default:
            throw new Error(`Unsupported schema type for property ${propertyName}: ${propertySchema.type}`);
    }
};

export { buildJSONFromSchema, hydrateWithConstructor };
