import { LLMClient } from "@/client/llmclient";

// Agent runtime contract: createSession (per-run), run (required), stop (optional)
interface Agent {
  // create per-run session/context — returns an implementation-defined (opaque) handle
  createSession(opts?: any): any;

  // run the agent: given opts (input/params), perform planning and actions
  // (may call tools, the LLM, or DB), produce a result T, and resolve or throw on fatal errors
  run<T = unknown>(opts?: any): Promise<T>;

  // optional graceful shutdown for long-lived agents; idempotent and best-effort
  stop?(): Promise<void>;
};

// OnDemandAgent: short-lived, ephemeral agent
interface OnDemandAgent extends Agent {
  // tempId: short-lived correlation id to map a client/request to this ephemeral agent
  // (not a stable identity, not used for authorization; expires quickly)
  tempId?: string;

  // owner: optional user id who created the agent (for audit/access while active)
  owner?: string; // optional short-term owner
  // ...existing code...
}

// PersistentAgent: long-lived registered agent with stable id and ACLs
interface PersistentAgent extends Agent {
  id: string; // stable identifier (slug/UUID)
  owner: string; // owner/team id
  acl?: Record<string, string[]>; // simple ACL map
}

export {
  Agent,
  OnDemandAgent,
  PersistentAgent,
};
