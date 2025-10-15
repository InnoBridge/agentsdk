# PromptTemplate

This document defines the `PromptTemplate` resource used by the `PromptStore`.

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
