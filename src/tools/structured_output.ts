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
    properties?: JsonSchema;
}

function Structure(schemaDefinition: SchemaDefinition) {
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

export {
    StructuredOutput,
    Structure,
    SchemaDefinition
};