import { randomUUID } from "crypto";
import type { AgentId } from "@/agents/agent";
import { StructuredOutputValidationError } from "@/client/llmclient";
import { DTO } from "@/tools/structured_output";
import { State, TerminalState } from "@/workflow/state";
import { StateMachine, type WorkflowId } from "../workflow";

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

class ReflectWorkflow extends StateMachine {
  constructor(input: any, agentId?: AgentId) {
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
