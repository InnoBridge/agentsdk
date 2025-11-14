import { randomUUID } from "crypto";
import { AgentId } from "@/agents/agent";
import { StructuredOutputValidationError } from "@/client/llmclient";
import { DTO } from "@/tools/structured_output";
import { State, TerminalState } from "@/workflow/state";
import { StateMachine, type WorkflowId, Work } from "@/workflow/workflow";
import { ChatRequest } from "ollama";
import { array } from "@/models/structured_output";

@DTO({
  type: 'object',
  description:
    'Decision payload describing whether the previous response was unsatisfactory enough to warrant a reflection pass.',
  properties: {
    shouldReflect: {
      type: 'boolean',
      description: "Set to true only when the prior response fails to meet the user's needs and needs another reasoning pass.",
    },
    reason: {
      type: 'string',
      description: 'Short explanation describing why the agent should or should not reflect.',
    },
  },
  required: ['shouldReflect', 'reason'],
})
class ShouldReflect {
  shouldReflect: boolean;
  reason: string;

  constructor(shouldReflect: boolean, reason: string) {
    this.shouldReflect = shouldReflect;
    this.reason = reason;
  }

  getShouldReflect(): boolean {
    return this.shouldReflect;
  }

  getReason(): string {
    return this.reason;
  }
}

class ReflectState extends State {
  private input: any;

  constructor(input: any) {
    super();
    this.input = input;
    this.input.messages ??= [];
  }

  async run({ chatFunction }: {
    chatFunction: (input: any) => Promise<any>;
  }): Promise<unknown> {
    const result = await chatFunction(this.input);
    const assistantMessage =
      result?.message ??
      ({
        role: 'assistant',
        content: result,
      } as any);

    this.input.messages.push({
      role: assistantMessage.role ?? 'assistant',
      content: assistantMessage.content,
    });

    return result;
  }

  getInput(): any {
    return this.input;
  }
}

class ShouldReflectState extends State {
  private input: any;
  private decision: ShouldReflect | null = null;

  constructor(input: any) {
    super();
    this.input = input;
  }

  async run({
    structuredOutputFunction,
  }: {
    structuredOutputFunction?: (
      input: any,
      dto: typeof ShouldReflect,
      retries?: number
    ) => Promise<ShouldReflect | StructuredOutputValidationError>;
  } = {}): Promise<ShouldReflect | null> {
    if (!structuredOutputFunction) {
      this.decision = null;
      return this.decision;
    }
    const messages = this.input.messages ?? [];
    const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
    if (!lastAssistant) {
      this.decision = null;
      return this.decision;
    }
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    const judgeMessages = [
      ...(lastUser ? [lastUser] : []),
      lastAssistant,
      {
        role: 'system',
        content:
          'You are a strict quality gate. Set shouldReflect to true ONLY when the latest assistant reply is incomplete, incorrect, or unsatisfactory. If the reply already fulfills the prompt, set shouldReflect to false and explain why.',
      },
    ];
    const judgeInput = {
      ...this.input,
      messages: judgeMessages,
    };
    const result = await structuredOutputFunction(judgeInput, ShouldReflect);
    if (result instanceof StructuredOutputValidationError) {
      throw result;
    }
    this.decision = result;
    return this.decision;
  }

  getDecision(): ShouldReflect | null {
    return this.decision;
  }

  getInput(): any {
    return this.input;
  }
}

class TerminalReflectState extends TerminalState {
  private input: any;

  constructor(input: any) {
    super();
    this.input = input;
  }

  async run(_: unknown = undefined): Promise<string> {
    return this.input;
  }
}

@DTO({
  type: 'object',
  description: 'Message payload for chat-based workflows (role plus content).',
  properties: {
    role: {
      type: 'string',
      description: 'The role of the message, e.g., "user", "assistant", "system".',
    },
    content: {
      type: 'string',
      description: 'The content of the message.',
    },
  },
  required: ['role', 'content'],
})
class Message {
    role: string;
    content: string;
    constructor(role: string, content: string) {
        this.role = role;
        this.content = content;
    }
}

@DTO({
    type: 'object',
    description: 'Input payload for chat requests including model identifier and message history.',
    properties: {
        model: {
            type: 'string',
            description: 'The model to be used for the chat request. default to "qwen3-coder:30b"',
        },
        messages: array(Message)
    },
    required: ['model', 'messages'],
})
class Input {
    model: string;
    messages: Message[];
    constructor(model: string, messages: Message[]) {
        this.model = model;
        this.messages = messages;
    }

    toChatRequest(): ChatRequest {
        return {
            model: this.model,
            messages: this.messages.map(msg => ({
                role: msg.role,
                content: msg.content
            }))
        };
    }
}

@Work({
  type: 'object',
  description: 'ReflectWorkflow metadata describing the input payload and optional agent identifier.',
  properties: {
    input: Input,
    agentId: AgentId,
  },
  required: ['input'],
})
class ReflectWorkflow extends StateMachine {
  constructor(input: Input, agentId?: AgentId) {
    const initialState = new ReflectState(input);

    const transitions = new Map<string, (currentState: State) => Promise<State>>([
      [
        ReflectState.name,
        async (state: State): Promise<State> => {
          const currentInput = (state as ReflectState).getInput();
          return new ShouldReflectState(currentInput);
        },
      ],
      [
        ShouldReflectState.name,
        async (state: State): Promise<State> => {
          const shouldReflectState = state as ShouldReflectState;
          if (shouldReflectState.getDecision()?.getShouldReflect()) {
            return new ReflectState(shouldReflectState.getInput());
          }
          return new TerminalReflectState(shouldReflectState.getInput());
        },
      ],
    ]);

    const workflowId: WorkflowId = {
      name: ReflectWorkflow.name,
      id: randomUUID(),
      agentId,
    };

    super(initialState, transitions, workflowId);
  }
}

export { ReflectState, ShouldReflectState, TerminalReflectState, ReflectWorkflow, ShouldReflect };
export type { Input };
