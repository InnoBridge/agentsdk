type JsonSchema = Record<string, unknown>;

import { copyPrototypeChain } from "../utils/prototype_helper";

interface ToolDefinition {
    type: "function";
    name: string;
    description?: string;
    parameters?: JsonSchema;
    allowNoSchema?: boolean;
    strict?: boolean;
}

function Tool(toolDefinition: ToolDefinition) {
    const decorate = <T extends new (...args: any[]) => any>(Target: T): (new (...args: ConstructorParameters<T>) => InstanceType<T> & ToolComponent) & { getDefinition?: () => ToolDefinition | undefined } => {
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

        copyPrototypeChain(Target.prototype, Decorated.prototype, ToolComponent.prototype);

        // Attach the canonical tool definition to the decorated class so
        // ToolComponent.getDefinition() (and other helpers) can read it.
        try {
            if (typeof (Reflect as any).defineMetadata === "function") {
                (Reflect as any).defineMetadata("tool:definition", toolDefinition, Decorated);
            } else {
                Object.defineProperty(Decorated, toolMetadata, {
                    value: toolDefinition,
                    enumerable: false,
                    configurable: false,
                    writable: false,
                });
            }
        } catch (e) {
            Object.defineProperty(Decorated, toolMetadata, {
                value: toolDefinition,
                enumerable: false,
                configurable: false,
                writable: false,
            });
        }

        // Copy static properties from Target
        Object.getOwnPropertyNames(Target).forEach(name => {
            if (['prototype', 'name', 'length'].includes(name)) return;
            const descriptor = Object.getOwnPropertyDescriptor(Target, name);
            if (descriptor) {
                Object.defineProperty(Decorated, name, descriptor);
            }
        });
        
        return Decorated as unknown as any;
    };

    return <T extends new (...args: any[]) => any>(Target: T) => decorate(Target) as any;
}

class ToolComponent {
    constructor(..._args: any[]) {
    }

    // Static helper is optional at the type level so plain decorated classes
    // are still assignable to `typeof ToolComponent` without forcing authors
    // to declare a static member. We attach an implementation below.
    static getDefinition?: () => ToolDefinition | undefined;

    // A static hydrator attached to the decorated class. It accepts a provider
    // tool call (the raw LLM/provider call object) and returns an instantiated
    // ToolComponent when the arguments validate against the authoritative
    // ToolDefinition.parameters. Implementations may override this static on
    // a per-tool basis by providing their own static member; the decorator
    // will attach a default implementation when absent.
    static hydrate?: (providerCall?: any) => ToolComponent | undefined;

    // Accept a single untyped/unknown parameter (canonical tool args object)
    // and return Promise<unknown> so implementations can choose the concrete
    // return type. Use `unknown` to encourage validation/casting inside tools.
    async run(params?: unknown): Promise<unknown> {
        // Base implementation is a no-op; concrete tools should override.
        return undefined;
    }
}

// Attach the runtime implementation for ToolComponent.getDefinition
ToolComponent.getDefinition = function () {
    if (typeof (Reflect as any).getMetadata === "function") {
        return (Reflect as any).getMetadata("tool:definition", this);
    }
    return (this as any)[toolMetadata] as ToolDefinition | undefined;
};

const toolMetadata = Symbol("tool:definition");


export {
    JsonSchema,
    Tool,
    ToolComponent,
    ToolDefinition
 };
