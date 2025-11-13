import { StructuredOutput, ToolComponent } from "@/models/structured_output";

type AgentId = {
  name: string;
  id?: string;
};

// Agent runtime contract: createSession (per-run), run (required), stop (optional)
interface Agent {
  chat(input: unknown): Promise<unknown>;
  toolCall?(input: unknown, tools: Array<typeof ToolComponent>): Promise<ToolComponent[]>;
  toStructuredOutput?<T extends typeof StructuredOutput>(
    input: unknown,
    dto: T,
    retries?: number,
  ): Promise<InstanceType<T>>;
  run<T = unknown>(input?: unknown): Promise<T>;
  stop?(): Promise<void>;
  getId?(): AgentId;
}

// OnDemandAgent: short-lived, ephemeral agent
interface OnDemandAgent extends Agent {
  // tempId: short-lived correlation id to map a client/request to this ephemeral agent
  // (not a stable identity, not used for authorization; expires quickly)
  // tempId?: string;

  // owner: optional user id who created the agent (for audit/access while active)
  // owner?: string; // optional short-term owner
  // ...existing code...
}

// PersistentAgent: long-lived registered agent with stable id and ACLs
interface PersistentAgent extends Agent {
  // id: string; // stable identifier (slug/UUID)
  // owner: string; // owner/team id
  // acl?: Record<string, string[]>; // simple ACL map
}

export {
  Agent,
  // OnDemandAgent,
  // PersistentAgent,
};

export type { AgentId };
