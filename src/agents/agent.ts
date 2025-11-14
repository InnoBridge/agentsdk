import { StructuredOutput, ToolComponent } from "@/models/structured_output";
import { DTO } from '@/tools/structured_output';

@DTO({
  type: 'object',
  description: 'Identifier payload for agents (name plus optional stable id).',
  properties: {
    name: { type: 'string', description: 'Agent implementation name.' },
    id: { type: 'string', description: 'Persistent agent identifier, if available.' },
    userId: { type: 'string', description: 'Owner or creator identifier, if applicable.' },
  },
  required: ['name'],
})
class AgentId {
  name: string;
  id?: string;
  userId?: string;

  constructor(name: string, id?: string, userId?: string) {
    this.name = name;
    this.id = id;
    this.userId = userId;
  }
}

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
  // tempId?: string; // short-lived correlation id
}

// PersistentAgent: long-lived registered agent with stable id and ACLs
interface PersistentAgent extends Agent {
  // id: string; // stable identifier (slug/UUID)
  // acl?: Record<string, string[]>; // simple ACL map
}

export {
  Agent,
  // OnDemandAgent,
  // PersistentAgent,
  AgentId,
};
