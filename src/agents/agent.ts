import { LLMClient } from "@/client/llmclient";

interface AgentResult {
  id: string;
  success: boolean;
  result?: unknown;
  startedAt: string;
  finishedAt: string;
};

interface AgentSession<T = unknown> {
  id: string;
  run(): Promise<AgentResult | T>;
  abort(): void;
};

interface Agent {
  createSession(opts?: any): AgentSession;
  runOnce?<T = unknown>(opts?: any): Promise<T>;
  stop?(): Promise<void>;
};

interface OnDemandAgent extends Agent {
  /**
   * Temporary/on-demand agents are created for quick runs or interactive prototypes.
   * They may be stateful and are generally short-lived.
   */
  tempId?: string; // optional client/server-generated temporary id
  owner?: string; // optional user id who created the agent (for short-term access control)
  // ...existing code...
}

interface PersistentAgent extends Agent {
  /**
   * Persistent agents are registered resources with stable identity and ACLs.
   */
  id: string; // required stable identifier (slug or UUID)
  owner: string; // owner/team id responsible for this agent
  acl?: Record<string, string[]>; // simple ACL map (role -> permissions)
}

export {
    Agent,
    OnDemandAgent,
    PersistentAgent,
    AgentSession,
    AgentResult
};
