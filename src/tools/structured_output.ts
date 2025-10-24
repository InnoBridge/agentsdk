import { J } from "vitest/dist/chunks/reporters.d.C-cu31ET.js";

type JsonSchema = Record<string, unknown>;

const copyPrototypeChain = (
    sourceProto: object,
    targetProto: object,
    stopProto: object
    ) => {
    const visited = new Set<string>();
    let proto: any = sourceProto;

    while (proto && proto !== stopProto && proto !== Object.prototype) {
        for (const name of Object.getOwnPropertyNames(proto)) {
        if (name === 'constructor') continue;
        if (visited.has(name)) continue;

        const descriptor = Object.getOwnPropertyDescriptor(proto, name);
        if (!descriptor) continue;

        if (!Object.prototype.hasOwnProperty.call(targetProto, name)) {
            Object.defineProperty(targetProto, name, descriptor);
        }

        visited.add(name);
        }

        proto = Object.getPrototypeOf(proto);
    }
};

interface SchemaDefinition {
    type?: string;
    name?: string;
    description?: string;
    properties?: Record<string, JsonSchema>;
    required?: string[];
    additionalProperties?: boolean;
}

// new
const structureRegistry = new Map<string, any>();

function DTO(schemaDefinition: SchemaDefinition) {
    schemaDefinition.type = schemaDefinition.type || 'object';
    const decorate = <T extends new (...args: any[]) => any>(Target: T): (new (...args: ConstructorParameters<T>) => InstanceType<T> & StructuredOutput) & { getSchema?: () => SchemaDefinition | undefined } => {
    
        inferSchemaFromConstructor(Target, schemaDefinition);

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

        // Attach the canonical schema definition to the decorated class
        // StructuredOutput.getSchema() (or other helpers) can read it.
        try {
            if (typeof (Reflect as any).defineMetadata === "object") {
                (Reflect as any).defineMetadata("structured:schema", schemaDefinition, Decorated);
            } else {
                Object.defineProperty(Decorated, schemaMetadata, {
                    value: schemaDefinition,
                    enumerable: false,
                    writable: false,
                    configurable: true
                });
            }
        } catch (e) {
            Object.defineProperty(Decorated, schemaMetadata, {
                value: schemaDefinition,
                enumerable: false,
                writable: false,
                configurable: true
            });
        }

        // Copy static properties from Target
        Object.getOwnPropertyNames(Target).forEach((name) => {
            if (['prototype', 'name', 'length'].includes(name)) return;
            const descriptor = Object.getOwnPropertyDescriptor(Target, name);
            if (descriptor) {
                Object.defineProperty(Decorated, name, descriptor);
            }
        });

        structureRegistry.set(Decorated.name, Decorated);

        return Decorated as any;
    };
        
    return <T extends new (...args: any[]) => any>(Target: T) => decorate(Target) as any;
}

class StructuredOutput {
    constructor(..._args: any[]) {
        // Initialization logic if needed
    }

    static getSchema?: () => SchemaDefinition | undefined;

    // hydrate(data: any) {
        // Implementation for hydrating data into class instance
    // }
}

// Attach the runtime implementation for StructuredOutput.getSchema()
StructuredOutput.getSchema = function() {
    if (typeof (Reflect as any).getMetadata === "function") {
        return (Reflect as any).getMetadata("structured:schema", this);
    }
    return (this as any)[schemaMetadata] as SchemaDefinition | undefined;  
};

const schemaMetadata = Symbol('structured:schema');

const primitiveTypeMap = new Map<any, JsonSchema>([
    [String, { type: 'string' }],
    [Number, { type: 'number' }],
    [Boolean, { type: 'boolean' }],
    [Date, { type: 'string', format: 'date-time' }],
]);

const singularize = (name: string): string => {
    if (name.endsWith('ies')) return name.slice(0, -3) + 'y';
    if (name.endsWith('ses')) return name.slice(0, -2);
    if (name.endsWith('s')) return name.slice(0, -1);
    return name;
};

const capitalize = (value: string): string => value.charAt(0).toUpperCase() + value.slice(1);

const cloneSchema = (schema: SchemaDefinition | JsonSchema | undefined): JsonSchema | undefined => {
    if (!schema) return undefined;
    return JSON.parse(JSON.stringify(schema));
};

const getConstructorParamTypes = (Target: any): any[] => {
    if (typeof (Reflect as any).getMetadata === 'function') {
        return (Reflect as any).getMetadata('design:paramtypes', Target) || [];
    }
    return [];
};

const mapAssignments = (constructorBody: string): Array<{ property: string; parameter: string }> => {
    const assignments: Array<{ property: string; parameter: string }> = [];
    const assignmentRegex = /this\.(\w+)\s*=\s*(\w+)/g;
    let match: RegExpExecArray | null;
    while ((match = assignmentRegex.exec(constructorBody)) !== null) {
        assignments.push({ property: match[1], parameter: match[2] });
    }
    return assignments;
};

const inferSchemaFromConstructor = (Target: any, schemaDefinition: SchemaDefinition) => {
    if (schemaDefinition.properties) return;

    const ctorSource = Target.prototype?.constructor?.toString?.();
    if (!ctorSource) return;

    const ctorMatch = ctorSource.match(/constructor\s*\(([^)]*)\)\s*{([\s\S]*)}/);
    if (!ctorMatch) return;

    const params = ctorMatch[1]
        .split(',')
        .map((p: string) => p.trim())
        .filter((value: string) => Boolean(value));
    if (!params.length) return;

    const assignments = mapAssignments(ctorMatch[2]);
    if (!assignments.length) return;

    const paramTypes = getConstructorParamTypes(Target);

    const properties: Record<string, JsonSchema> = {};
    const required = new Set<string>();

    assignments.forEach(({ property, parameter }) => {
        const index = params.indexOf(parameter);
        if (index === -1) return;
        const paramType = paramTypes[index];
        const propertySchema = buildSchemaForParam(property, parameter, paramType);
        if (propertySchema) {
            properties[property] = propertySchema;
            required.add(property);
        }
    });

    if (Object.keys(properties).length) {
        schemaDefinition.properties = properties;
        schemaDefinition.required = Array.from(required);
        if (schemaDefinition.type === 'object' && schemaDefinition.additionalProperties === undefined) {
            schemaDefinition.additionalProperties = false;
        }
    }
};

const resolveRegisteredSchema = (name: string): JsonSchema | undefined => {
    const cls = structureRegistry.get(name);
    return cloneSchema(cls?.getSchema?.());
};

const inferredStringSchema: JsonSchema = { type: 'string' };

const buildSchemaForParam = (property: string, parameter: string, paramType: any): JsonSchema | undefined => {
    if (primitiveTypeMap.has(paramType)) {
        return primitiveTypeMap.get(paramType);
    }

    const singularParam = capitalize(singularize(parameter));
    const singularProp = capitalize(singularize(property));

    if (paramType === Array || (!paramType && /s$/.test(property))) {
        const registryEntrySchema = resolveRegisteredSchema(singularParam) ?? resolveRegisteredSchema(singularProp);
        return {
            type: 'array',
            items: registryEntrySchema ?? {},
        };
    }

    if (typeof paramType === 'function') {
        const nestedSchema = cloneSchema(paramType.getSchema?.()) ?? resolveRegisteredSchema(paramType.name);
        if (nestedSchema) {
            return nestedSchema;
        }
    }

    const registryFallback = resolveRegisteredSchema(singularParam) ?? resolveRegisteredSchema(singularProp);
    if (registryFallback) {
        return registryFallback;
    }

    // Fallback when type cannot be determined — assume string to keep schema usable.
    return inferredStringSchema;
};

export {
    StructuredOutput,
    DTO,
    SchemaDefinition
};