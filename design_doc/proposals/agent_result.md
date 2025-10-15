## AgentResult (detailed)

This document contains the detailed shape and helper types for the `AgentResult` returned by `Agent.run()` and `AgentSession.run()`.

Keep the base surface minimal in `agent.md`. Use this file when you need the richer fields for observability, billing, or replay.

Full fields (recommended) and helper type sketches

Required fields:
- `id`: unique identifier for the run/result (string)
- `success`: boolean outcome flag
- `result`: final user-facing payload (string or structured object)
- `startedAt` / `finishedAt`: ISO timestamps
- `error`: optional object `{ message, code?, info? }` populated only when `success === false`

Optional / extended fields (for implementors):
- `sessionId`: per-run session identifier
- `steps`: number of plan/act iterations executed
- `actions`: ordered list of tool/planner steps with inputs/outputs
- `modelCalls`: summary of each LLM invocation (prompt reference, provider, token usage)
- `tokenUsage`, `costEstimate`: usage accounting for billing/monitoring
- `eventStream`: inline events or pointer to persisted trace
- `memoryDeltas`: changes applied to memory/database clients during the run
- `provenance`: template/model references for auditability
- `diagnostics`: warnings, traces, retry metadata, deterministic seed, etc.

TypeScript sketches for helper types:

```ts
export interface ActionResult {
  id: string;
  toolId?: string;
  input?: unknown;
  output?: unknown;
  startedAt?: string;
  finishedAt?: string;
  ok?: boolean;
  error?: { message?: string; code?: string; info?: unknown };
}

export interface ModelCall {
  id: string;
  provider: string;
  model: string;
  promptRef?: string;
  startedAt?: string;
  finishedAt?: string;
  tokens?: TokenUsage;
  rawResponse?: unknown;
}

export interface TokenUsage { promptTokens?: number; completionTokens?: number; totalTokens?: number }

export interface MemoryChange { key: string; op: 'set'|'append'|'delete'; before?: unknown; after?: unknown }

export interface Provenance { promptTemplateId?: string; promptTemplateVersion?: string; modelId?: string }

export interface Event { t: string; type: string; payload?: unknown }

export interface AgentResult {
  id: string;
  sessionId?: string;
  success: boolean;
  result?: unknown;
  error?: { message?: string; code?: string; info?: unknown };
  startedAt: string;
  finishedAt: string;
  steps?: number;
  actions?: ActionResult[];
  modelCalls?: ModelCall[];
  tokenUsage?: TokenUsage;
  costEstimate?: number;
  eventStream?: Event[] | string;
  memoryDeltas?: MemoryChange[];
  provenance?: Provenance;
  diagnostics?: { warnings?: string[]; traces?: string[] };
  aborted?: boolean;
  seed?: number;
  deterministic?: boolean;
  attachments?: Record<string, string>;
}
```

Notes:
- Implementations may extend these shapes when they need extra fields. Keep the base fields stable for consumers that only need the final `result`.
- Fields such as `retryInfo`, richer `metrics`, and event hook payload shapes are intentionally left to `todo.md` and optional plugin modules.
