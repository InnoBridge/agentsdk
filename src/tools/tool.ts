import { 
    StructuredOutputType, 
    SchemaDefinition, 
    ToolComponent, 
    ToolDefinition
} from "@/models/structured_output";
import { BaseStructuredOutput } from "@/tools/structured_output";

type JsonSchema = Record<string, unknown>;

function Tool(schemaDefinition: SchemaDefinition) {
    return BaseStructuredOutput(schemaDefinition, StructuredOutputType.TOOL);
}

ToolComponent.getToolSchema = function() {
    const schema = (this as typeof ToolComponent).getSchema?.();
    if (typeof schema !== 'object' || !schema) return undefined;
    
    const toolType = (schema as { toolType?: string }).toolType ?? 'object';
    const name = (schema as { name?: string }).name;
    if (!name) return undefined;

    const description = (schema as { description?: string }).description;
    const properties = (schema as { properties?: Record<string, JsonSchema> }).properties;
    const directProperties =
        properties ?? (Object.keys(schema).length > 0 ? (schema as Record<string, JsonSchema>) : undefined);

    const toolDefinition: ToolDefinition = {
        name,
        type: toolType,
    };

    if (description) {
        toolDefinition.description = description;
    }

    if (directProperties && Object.keys(directProperties).length > 0) {
        toolDefinition.parameters = {
            type: 'object',
            properties: directProperties,
        };

        const required = (schema as { required?: string[] }).required;
        if (Array.isArray(required) && required.length > 0) {
            toolDefinition.parameters.required = required;
        }

        const additionalProperties = (schema as { additionalProperties?: boolean }).additionalProperties;
        if (additionalProperties !== undefined) {
            toolDefinition.parameters.additionalProperties = additionalProperties;
        }
    }

    const strict = (schema as { strict?: boolean }).strict;
    if (strict !== undefined) {
        toolDefinition.strict = strict;
    }

    return toolDefinition;
};

export {
    JsonSchema,
    Tool
 };
