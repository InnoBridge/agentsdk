## Tools

`ToolDefinition` describes a tool available to the agent's planner/runner. Tools should be pluggable, typed, and contain safety metadata.

Core fields:
- id: string
- schema?: JSONSchema
- run(input: ToolInput): Promise<ToolOutput>

Guidance:
- Include metadata such as description and safeByDefault flag to enable runtime policy decisions.
- Provide a JSON Schema for input validation where possible.
- Tool connectors should be sandboxed; dangerous tool types (shell/process) are disabled by default and must be explicitly allowed.
