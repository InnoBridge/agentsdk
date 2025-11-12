import { LLMClient, StructuredOutputValidationError } from "@/client/llmclient";
import { DTO } from "@/tools/structured_output";
import { State, TerminalState } from "@/workflow/state";
import { StateMachine } from "../workflow";

class ReflectState extends State {
  private input: any;

  constructor(input: any) {
    super();
    this.input = input;
    this.input.messages ??= [];
  }

  async run({ chatFunc }: { chatFunc: (input: any) => Promise<any> }): Promise<unknown> {
    const result = await chatFunc(this.input);
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

class TerminalReflectState extends TerminalState {
  private input: any;

  constructor(input: any) {
    super();
    this.input = input;
  }

  async run(_: unknown = undefined): Promise<string> {
    return this.input;
  }
};

@DTO({
    type: "object",
    description: "Decision payload describing whether the previous response was unsatisfactory enough to warrant a reflection pass.",
    properties: {
        shouldReflect: {
            type: "boolean",
            description: "Set to true only when the prior response fails to meet the user's needs and needs another reasoning pass."
        },
        reason: {
            type: "string",
            description: "Short explanation describing why the agent should or should not reflect."
        }
    },
    required: ["shouldReflect", "reason"]
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

class ReflectWorkflow extends StateMachine {
  private readonly llmClient: LLMClient;

  constructor(input: any, llmClient: LLMClient) {
    const initialState = new ReflectState(input);

    const evaluateShouldReflect = async (currentInput: any): Promise<ShouldReflect | null> => {
      if (!llmClient.toStructuredOutput) {
        return null;
      }
      const messages = currentInput.messages ?? [];
      const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
      if (!lastAssistant) {
        return null;
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
        ...currentInput,
        messages: judgeMessages,
      };
      const result = await llmClient.toStructuredOutput(judgeInput, ShouldReflect);
      if (result instanceof StructuredOutputValidationError) {
        throw result;
      }
      console.log('Input to evaluateShouldReflect:', judgeInput.messages);
      console.log('Evaluated ShouldReflect:', result);
      return result;
    };

    const transitionFromReflectState = async (state: State): Promise<ReflectState | TerminalReflectState> => {
      const currentInput = (state as ReflectState).getInput();
      const judgment = await evaluateShouldReflect(currentInput);
      if (judgment?.getShouldReflect()) {
        console.log('[ReflectWorkflow] Triggering another reflection:', judgment.getReason());
        return new ReflectState(currentInput);
      }
      if (judgment) {
        console.log('[ReflectWorkflow] Reflection complete:', judgment.getReason());
      }
      return new TerminalReflectState(currentInput);
    };

    const transitions = new Map<string, (currentState: State) => Promise<State>>([
      [ReflectState.name, transitionFromReflectState],
    ]);

    super(initialState, transitions);
    this.llmClient = llmClient;
  }
}

export { ReflectState, TerminalReflectState, ReflectWorkflow };
