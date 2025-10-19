// Example Tool decorator and validation helpers (agentsdk/src/tools/tool_decorator_example.ts)
// This is a lightweight example showing how to store canonical JSON Schema verbatim
// on the tool class, pre-compile an AJV validator, and perform safe parse/validate/instantiate.

import Ajv, { ValidateFunction } from 'ajv';

export type JsonSchema = Record<string, any>;

export interface CanonicalToolDefinition {
  type: 'function';
  name: string;
  description?: string;
  parameters: JsonSchema;
  strict?: boolean;
  safety?: Record<string, any>;
}

export interface ToolClassStatic {
  new (args: any): any;
  definition?: CanonicalToolDefinition;
  validator?: ValidateFunction;
}

const ajv = new Ajv({ strict: false, allErrors: true });

export function Tool(def: CanonicalToolDefinition) {
  return function (ctor: any) {
    // attach the canonical definition verbatim
    ctor.definition = def;
    try {
      // compile and attach validator for runtime use
      ctor.validator = ajv.compile(def.parameters || { type: 'object' });
    } catch (e) {
      // If compile fails, still attach definition; surface error at startup
      console.error(`Failed to compile schema for tool ${def.name}:`, e);
      ctor.validator = undefined;
    }
    return ctor;
  };
}

export class ToolArgumentError extends Error {
  public details?: any;
  constructor(message: string, details?: any) {
    super(message);
    this.name = 'ToolArgumentError';
    this.details = details;
  }
}

export function parseMaybeString(input: unknown) {
  if (typeof input === 'string') {
    try {
      return JSON.parse(input);
    } catch (e) {
      // If it's not valid JSON, keep as string (some providers pass raw strings)
      return input;
    }
  }
  return input;
}

export function instantiateTool(ToolClass: ToolClassStatic, rawArgs: unknown) {
  const args = parseMaybeString(rawArgs);
  const validator = ToolClass.validator;
  if (validator) {
    const ok = validator(args);
    if (!ok) {
      throw new ToolArgumentError('Tool arguments validation failed', validator.errors);
    }
  }
  // instantiate with validated args
  return new (ToolClass as any)(args);
}

// --- Example usage ---

@Tool({
  type: 'function',
  name: 'get_temperature',
  description: 'Get the current temperature for a city',
  parameters: {
    type: 'object',
    required: ['city'],
    properties: {
      city: { type: 'string' },
      units: { type: 'string', enum: ['celsius', 'fahrenheit'], default: 'celsius' }
    }
  }
})
class GetTemperatureTool {
  constructor(private args: { city: string; units?: 'celsius' | 'fahrenheit' }) {}
  async run() {
    return { temp: 42, units: this.args.units };
  }
}

// Simulate hydrate step
const rawFromProvider = '{"city":"Berlin","units":"celsius"}';
const instance = instantiateTool(GetTemperatureTool as unknown as ToolClassStatic, rawFromProvider);
console.log('Instantiated tool instance:', instance);

export { GetTemperatureTool };
