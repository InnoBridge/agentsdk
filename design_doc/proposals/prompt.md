# Prompt templates & store

This document combines the `PromptTemplate` resource shape and the `PromptStore` service that manages and renders templates.

## PromptTemplate

Prompts should be versioned, auditable resources. The `PromptStore` should validate templates for required variables, policy compliance, and provide helpers for safe rendering and redaction.

Minimal TypeScript shape:

```ts
export interface PromptTemplate {
  id: string;
  version: string;
  name?: string;
  text: string;
  requiredVars?: string[];
  engine?: 'handlebars' | 'liquid' | 'mustache' | 'fstring';
  metadata?: Record<string, unknown>;
  createdBy?: string;
  createdAt?: string;
}
```

Guidance
- Version templates on each edit so runs can be reproduced precisely.
- Keep templates as plain-text + structured metadata; avoid embedding secrets into templates.
- Provide a `render(templateId, params)` helper that performs strict variable substitution and returns token estimates when possible.
- The `PromptStore` should emit audit events on create/update/delete and integrate with policy checks before making templates available to agents.

## PromptStore

The `PromptStore` is a versioned store of prompt templates and rendering helpers used by planners and runners.

Core functions:
- get(templateId: string, version?: string): Promise<PromptTemplate | null>
- render(templateId: string, params?: Record<string, any>, opts?: { throwOnMissing?: boolean }): Promise<{ text: string; meta?: { tokensEstimate?: number } }>
- put(template: Omit<PromptTemplate, 'version'|'createdAt'>, opts?: { author?: string }): Promise<PromptTemplate>
- list(filter?: { tag?: string; name?: string }): Promise<PromptTemplate[]>
- validate(templateText: string): Promise<{ ok: boolean; errors?: string[] }>

Notes:
- Provide server-side rendering helpers as well as client-side libraries for convenience.
- Run light policy checks on template content to detect disallowed text before rendering.
