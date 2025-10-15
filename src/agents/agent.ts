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

export {
    Agent,
    AgentSession,
    AgentResult
};
