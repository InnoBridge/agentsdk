# Agentsdk Style Guide

This document captures small conventions that help the codebase (and design docs) stay consistent. Expand it as new preferences emerge.

## TypeScript Export Style
- Define types, interfaces, and classes without inline `export` keywords.
- Re-export the symbols from a grouped `export { ... }` block at the bottom of the module or snippet.
- For named functions/constants, prefer the same pattern unless a default export is absolutely required.

Example:

```ts
type WorkflowCursor = { /* ... */ };
interface WorkflowState { /* ... */ }

export { WorkflowCursor, WorkflowState };
```

Refer to this section when editing TypeScript files or TS snippets inside design docs. This keeps reminders persistent for both humans and AI contributors.

## Imports & Aliases
- Prefer project alias imports (for example `@/workflow/state`) instead of long relative paths.
- If a module lacks an alias, add it to the TypeScript/Rollup config before introducing deeply nested relative imports.
