import Ajv from "ajv";
import { JsonSchema, SchemaDefinition, Repair, ValidatedResult, array } from "@/models/structured_output";
import { copyPrototypeChain } from "@/utils/prototype_helper";
import { buildJSONFromSchema } from "@/utils/schema_helper";

const ajv = new Ajv({ allErrors: true, strict: false });

const schemaMetadata = Symbol('structured:schema');

const structureRegistry = new Map<string, any>();

const dtoRegistry = new Map<string, typeof StructuredOutput>();
const registerDto = (dto: typeof StructuredOutput) => {
    if (dtoRegistry.get(dto.name)) {
        throw new Error(`DTO with name ${dto.name} is already registered.`);
    }
    dtoRegistry.set(dto.name, dto);
};
const getRegisteredDto = (name: string): typeof StructuredOutput | undefined => {
    return dtoRegistry.get(name);
};

function DTO(schemaDefinition: SchemaDefinition) {
    schemaDefinition.type = schemaDefinition.type || 'object';
    const decorate = <T extends new (...args: any[]) => any>(Target: T): (new (...args: ConstructorParameters<T>) => InstanceType<T> & StructuredOutput) & { getSchema?: () => SchemaDefinition | undefined } => {

        // Create a new class that extends StructuredOutput
        const Decorated = class extends StructuredOutput {
            constructor(...args: any[]) {
                super(...args);
                const instance = Reflect.construct(Target, args, new.target);
                Object.assign(this, instance);
            }
        };

        // Set the class name to match the original Target
        Object.defineProperty(Decorated, 'name', {
            value: Target.name,
            writable: false,
            configurable: true
        });
            
        copyPrototypeChain(Target.prototype, Decorated.prototype, StructuredOutput.prototype);

        const resolveStructuredSchema = (ctor: Function): JsonSchema | undefined => {
            if (typeof ctor === "function" && ctor.prototype instanceof StructuredOutput) {
                return (ctor as typeof StructuredOutput).getSchema?.() ?? undefined;
            }
            return undefined;
        };

        const jsonSchema = buildJSONFromSchema(schemaDefinition, resolveStructuredSchema);

        // Attach the canonical schema definition to the decorated class
        // StructuredOutput.getSchema() (or other helpers) can read it.
        Object.defineProperty(Decorated, schemaMetadata, {
            value: jsonSchema,
            enumerable: false,
            writable: false,
            configurable: true
        });

        // Copy static properties from Target
        Object.getOwnPropertyNames(Target).forEach((name) => {
            if (['prototype', 'name', 'length'].includes(name)) return;
            const descriptor = Object.getOwnPropertyDescriptor(Target, name);
            if (descriptor) {
                Object.defineProperty(Decorated, name, descriptor);
            }
        });

        registerDto(Decorated);
        structureRegistry.set(Decorated.name, Decorated);
        return Decorated as any;
    };
          
    return <T extends new (...args: any[]) => any>(Target: T) => decorate(Target) as any;
}

class StructuredOutput {
    constructor(..._args: any[]) {
    }

    static getSchema?: () => JsonSchema | undefined;

    static validate?: (originalHydrationRecipe: unknown, previousRepairs?: Repair[]) => ValidatedResult;

    static hydrate?: (hydrationRecipe: unknown) => StructuredOutput | undefined;
}

// Attach the runtime implementation for StructuredOutput.getSchema()
StructuredOutput.getSchema = function() {
    return (this as any)[schemaMetadata] as JsonSchema | undefined;
};

StructuredOutput.validate = function(
    originalHydrationRecipe: unknown,
    previousRepairs?: Repair[]
): ValidatedResult {
    const schema = this.getSchema?.();
    if (!schema) {
        throw new Error(`No schema defined for ${this.name}. Cannot validate.`);
    }
    const repairs = previousRepairs || [];

    let hydrationRecipe: unknown = originalHydrationRecipe;
    if (typeof originalHydrationRecipe === 'string') {
        try {
            hydrationRecipe = JSON.parse(originalHydrationRecipe);
            repairs.push({attempt: 'Parsed JSON string', originalCandidate: originalHydrationRecipe, candidate: hydrationRecipe});
        } catch (e) {
            repairs.push({attempt: 'Failed to parse JSON string', originalCandidate: originalHydrationRecipe, candidate: hydrationRecipe, error: String(e)});
        }
    }

    // compile validator (cached by Ajv internally)
    const validator = ajv.compile(schema);
    const valid = validator(hydrationRecipe);

    if (valid) {
        return { valid: true, candidate: hydrationRecipe, originalCandidate: originalHydrationRecipe, repairs };
    }

    // Here you would implement the actual validation logic
    return { valid: false, errors: validator.errors, candidate: hydrationRecipe, originalCandidate: originalHydrationRecipe, repairs };
};


StructuredOutput.hydrate = function (hydrationRecipe: unknown): StructuredOutput | undefined {
    let recipe = hydrationRecipe;
    if (typeof recipe === 'string') {
        try {
            recipe = JSON.parse(recipe);
        } catch (_err) {
            return undefined;
        }
    } else if (recipe === null || typeof recipe !== 'object') {
        return undefined;
    }

    const schema = (this as any)[schemaMetadata];
    return hydrateWithConstructor(this, recipe as JsonSchema);    
};

const hydrateWithConstructor = (
    ctor: typeof StructuredOutput,
    recipe: JsonSchema,
): StructuredOutput | undefined => {
    const schema = (ctor as any)[schemaMetadata];
    if (!schema) return undefined;

    const propertyArgs = mapSchemaPropertyToConstructorArgument(
        schema.properties,
        recipe,
        schema.required,
    );

    const ctorMeta: Array<{ name: string; optional: boolean }> =
        (schema as any).constructorArgs ??
        Object.keys(schema.properties).map((name: string) => ({
            name,
            optional: !schema.required.includes(name),
        }));

    const args = ctorMeta.map(({ name }) => propertyArgs.get(name));

    try {
        return Reflect.construct(ctor, args);
    } catch (error) {
        console.error(`Failed to construct ${ctor.name}`, error, args);
        return undefined;
    }
};

type ConstructorArgument = string | number | boolean | StructuredOutput | StructuredOutput[] | undefined;

const mapSchemaPropertyToConstructorArgument = (properties: Record<string, any>, recipe: JsonSchema, required: string[]): Map<string, ConstructorArgument> => {
    const propertyToConstructorArgumentMap = new Map<string, ConstructorArgument>();
    for (const [propertyName, propertySchema] of Object.entries(properties)) {
        
        const propertyValue = buildPropertyArgument(
            propertyName, 
            propertySchema, 
            recipe, 
            required.includes(propertyName)
        );
        propertyToConstructorArgumentMap.set(propertyName, propertyValue);
    };

    return propertyToConstructorArgumentMap;
};

const buildPropertyArgument = (
    propertyName: string, 
    propertySchema: any, 
    recipe: JsonSchema, 
    required: boolean) => {
        
    switch (propertySchema.type) {        
        case "string":
            const stringValue = recipe[propertyName];
            
            if (typeof stringValue !== 'string' && required) {
                throw new Error(`Property ${propertyName} is required to be a string, but got: ${stringValue}`);
            } else if (typeof stringValue === 'string') {
                return stringValue;
            } else {
                return undefined;
            }
        case "number":
            const numberValue = recipe[propertyName];
            
            if ((numberValue === null || numberValue === undefined) && required) {
                throw new Error(`Property ${propertyName} is required to be a number, but got: ${numberValue}`);
            }
            if (typeof numberValue === 'number') {
                return numberValue;
            }
            if (typeof numberValue === 'string') {
                const trimmed = numberValue.trim();
                if (trimmed !== '' && !Number.isNaN(Number(trimmed))) {
                    const coerced = Number(trimmed);
                    
                    return coerced;
                }
            }
            return undefined;
        case "boolean":
            const booleanValue = recipe[propertyName];
            
            if ((booleanValue === null || booleanValue === undefined) && required) {
                throw new Error(`Property ${propertyName} is required to be a boolean, but got: ${booleanValue}`);
            }
            if (typeof booleanValue === 'boolean') {
                return booleanValue;
            }
            if (typeof booleanValue === 'string') {
                const trimmed = booleanValue.trim().toLowerCase();
                if (trimmed === 'true') return true;
                if (trimmed === 'false') return false;
                // also accept numeric-like booleans
                if (trimmed === '1') return true;
                if (trimmed === '0') return false;
            }
            return undefined;
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
                    const dto = getRegisteredDto(propertySchema.items.name);
                    if (!dto) {
                        throw new Error(`Unknown DTO ${propertySchema.items.name} in array property ${propertyName}`);
                    }

                    return arrayValue.map((item) => {
                        if (typeof dto.hydrate === "function") {
                            return dto.hydrate(item) ?? item;
                        }
                        const instance = Object.create(dto.prototype);
                        return Object.assign(instance, item);
                    });
                }
                case "string":
                    return arrayValue as ConstructorArgument[];
                case "number":
                    return arrayValue.map((item) =>
                        typeof item === "number" ? item : Number(item),
                    );
                case "boolean":
                    return arrayValue.map((item) => {
                        if (typeof item === "boolean") return item;
                        const normalized = String(item).trim().toLowerCase();
                        if (normalized === "true" || normalized === "1") return true;
                        if (normalized === "false" || normalized === "0") return false;
                        return Boolean(item);
                    });
                default:
                    throw new Error(`Unsupported array item type: ${itemType}`);
            }
        }
        case "object":
            const objectValue = recipe[propertyName];
            const dto = getRegisteredDto(propertySchema.name);
            if (dto && typeof dto.hydrate === 'function') {
                const hydratedObject = dto.hydrate(objectValue);
                return hydratedObject;
            }
            return undefined;
        default:
            throw new Error(`Unsupported schema type for property ${propertyName}: ${propertySchema.type}`);
    }
};

export {
    StructuredOutput,
    DTO,
    getRegisteredDto
};