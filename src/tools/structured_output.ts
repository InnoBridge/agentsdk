import Ajv from "ajv";
import { JsonSchema, SchemaDefinition, Repair, ValidatedResult, StructuredOutputType } from "@/models/structured_output";
import { copyPrototypeChain } from "@/utils/prototype_helper";
import { buildJSONFromSchema, hydrateWithConstructor, HydrationRecipe, StoredSchema } from "@/utils/structured_output_helper";
import { ToolComponent } from "./tool";

const ajv = new Ajv({ allErrors: true, strict: false });

const schemaMetadata = Symbol('structured:schema');

const dtoRegistry = new Map<string, typeof StructuredOutput>();
const registerDto = (dto: typeof StructuredOutput, schemaName: string) => {
    const registerKey = (key: string) => {
        if (!key) return;
        const existing = dtoRegistry.get(key);
        if (existing && existing !== dto) {
            throw new Error(`DTO with name ${key} is already registered.`);
        }
        dtoRegistry.set(key, dto);
    };

    registerKey(dto.name);
    if (schemaName && schemaName !== dto.name) {
        registerKey(schemaName);
    }
};
const getRegisteredDto = (name: string): typeof StructuredOutput | undefined => {
    return dtoRegistry.get(name);
};

function DTO(schemaDefinition: SchemaDefinition) {
    schemaDefinition.type = schemaDefinition.type || 'object';
    return BaseStructuredOutput(schemaDefinition);
}

function BaseStructuredOutput(schemaDefinition: SchemaDefinition, structuredOutputType: StructuredOutputType = StructuredOutputType.DTO) {    
    if (structuredOutputType === StructuredOutputType.DTO) {
        const decorate = <T extends new (...args: any[]) => any>(Target: T): (new (...args: ConstructorParameters<T>) => InstanceType<T> & StructuredOutput) & { getSchema?: () => SchemaDefinition | undefined } => {
            if (schemaDefinition.name === undefined) {
                schemaDefinition.name = Target.name;
            }
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

            const jsonSchema = buildJSONFromSchema(schemaDefinition, resolveStructuredSchema, structuredOutputType);

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

            registerDto(Decorated, schemaDefinition.name);
            return Decorated as any;
        };
            
        return <T extends new (...args: any[]) => any>(Target: T) => decorate(Target) as any;
    } else if (structuredOutputType === StructuredOutputType.TOOL) {
        const decorate = <T extends new (...args: any[]) => any>(Target: T): (new (...args: ConstructorParameters<T>) => InstanceType<T> & ToolComponent) & { getSchema?: () => SchemaDefinition | undefined } => {
            if (schemaDefinition.name === undefined) {
                schemaDefinition.name = Target.name;
            }
            // Create a new class that extends ToolComponent
            const Decorated = class extends ToolComponent {
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
                if (typeof ctor === "function" && ctor.prototype instanceof ToolComponent) {
                    return (ctor as typeof ToolComponent).getSchema?.() ?? undefined;
                }
                return undefined;
            };

            const jsonSchema = buildJSONFromSchema(schemaDefinition, resolveStructuredSchema, structuredOutputType);

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

            registerDto(Decorated, schemaDefinition.name);
            return Decorated as any;
        };
              
        return <T extends new (...args: any[]) => any>(Target: T) => decorate(Target) as any;
    }
    throw new Error(`Unsupported StructuredOutputType: ${structuredOutputType}`);
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

    const schema = (this as any)[schemaMetadata] as StoredSchema | undefined;
    if (!schema) return undefined;

    return hydrateWithConstructor(this, recipe as HydrationRecipe, schema, getRegisteredDto);
};

export {
    StructuredOutput,
    BaseStructuredOutput,
    DTO,
    getRegisteredDto
};
