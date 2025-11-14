import Ajv from "ajv";
import { 
    JsonSchema, 
    SchemaDefinition,
    Repair, 
    ValidatedResult,
    StructuredOutput, 
    StructuredOutputType,
    ToolComponent
} from "@/models/structured_output";
import type { Workflow } from '@/workflow/workflow';
import { copyPrototypeChain } from "@/utils/prototype_helper";
import { buildJSONFromSchema, hydrateWithConstructor, HydrationRecipe, StoredSchema } from "@/utils/structured_output_helper";

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

type ClassDecoratorFactory = <T extends new (...args: any[]) => any>(Target: T) => any;

function BaseStructuredOutput(
    schemaDefinition: SchemaDefinition,
    structuredOutputType: StructuredOutputType = StructuredOutputType.DTO,
): ClassDecoratorFactory {
    switch (structuredOutputType) {
        case StructuredOutputType.DTO: {
            const decorate = <T extends new (...args: any[]) => any>(Target: T): (new (...args: ConstructorParameters<T>) => InstanceType<T> & StructuredOutput) & { getSchema?: () => SchemaDefinition | undefined } => {
                if (schemaDefinition.name === undefined) {
                    schemaDefinition.name = Target.name;
                }
                const Decorated = class extends StructuredOutput {
                    constructor(...args: any[]) {
                        super(...args);
                        const instance = Reflect.construct(Target, args, new.target);
                        Object.assign(this, instance);
                    }
                };

                Object.defineProperty(Decorated, 'name', {
                    value: Target.name,
                    writable: false,
                    configurable: true,
                });

                copyPrototypeChain(Target.prototype, Decorated.prototype, StructuredOutput.prototype);

                const resolveStructuredSchema = (ctor: Function): JsonSchema | undefined => {
                    if (typeof ctor === 'function' && ctor.prototype instanceof StructuredOutput) {
                        return (ctor as typeof StructuredOutput).getSchema?.() ?? undefined;
                    }
                    return undefined;
                };

                const jsonSchema = buildJSONFromSchema(schemaDefinition, resolveStructuredSchema, structuredOutputType);

                Object.defineProperty(Decorated, schemaMetadata, {
                    value: jsonSchema,
                    enumerable: false,
                    writable: false,
                    configurable: true,
                });

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
        case StructuredOutputType.WORKFLOW: {
            const decorate = <T extends new (...args: any[]) => Workflow>(Target: T) => {
                if (schemaDefinition.name === undefined) {
                    schemaDefinition.name = Target.name;
                }

                const resolveStructuredSchema = (ctor: Function): JsonSchema | undefined => {
                    if (typeof ctor === 'function' && ctor.prototype instanceof StructuredOutput) {
                        return (ctor as typeof StructuredOutput).getSchema?.() ?? undefined;
                    }
                    return undefined;
                };

                const jsonSchema = buildJSONFromSchema(schemaDefinition, resolveStructuredSchema, structuredOutputType);

                Object.defineProperty(Target, schemaMetadata, {
                    value: jsonSchema,
                    enumerable: false,
                    writable: false,
                    configurable: true,
                });

                registerDto(Target as unknown as typeof StructuredOutput, schemaDefinition.name);
                return Target;
            };

            return decorate as ClassDecoratorFactory;
        }
        case StructuredOutputType.TOOL: {
            const decorate = <T extends new (...args: any[]) => any>(Target: T): (new (...args: ConstructorParameters<T>) => InstanceType<T> & ToolComponent) & { getSchema?: () => SchemaDefinition | undefined } => {
                if (schemaDefinition.name === undefined) {
                    schemaDefinition.name = Target.name;
                }
                const Decorated = class extends ToolComponent {
                    constructor(...args: any[]) {
                        super(...args);
                        const instance = Reflect.construct(Target, args, new.target);
                        Object.assign(this, instance);
                    }
                };

                Object.defineProperty(Decorated, 'name', {
                    value: Target.name,
                    writable: false,
                    configurable: true,
                });

                copyPrototypeChain(Target.prototype, Decorated.prototype, StructuredOutput.prototype);

                const resolveStructuredSchema = (ctor: Function): JsonSchema | undefined => {
                    if (typeof ctor === 'function' && ctor.prototype instanceof ToolComponent) {
                        return (ctor as typeof ToolComponent).getSchema?.() ?? undefined;
                    }
                    return undefined;
                };

                const jsonSchema = buildJSONFromSchema(schemaDefinition, resolveStructuredSchema, structuredOutputType);

                Object.defineProperty(Decorated, schemaMetadata, {
                    value: jsonSchema,
                    enumerable: false,
                    writable: false,
                    configurable: true,
                });

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
        default:
            throw new Error(`Unsupported StructuredOutputType: ${structuredOutputType}`);
    }
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
    BaseStructuredOutput,
    DTO,
    getRegisteredDto
};
