import { StructuredOutputValidationError } from "@/client/llmclient";
import { DTO } from "@/tools/structured_output";
import { State, TerminalState } from "@/workflow/state";
import { StateMachine } from "../workflow";
import { StructuredOutput } from "@/models/structured_output";

class ReflectState extends State {
    private input: any;
    private chatFunc: (input: any) => Promise<any>

    constructor(input: any, chatFunc: (input: any) => Promise<any>) {
        super();
        this.input = input;
        this.chatFunc = chatFunc;
    }

  async run({}): Promise<unknown> {
    const result = await this.chatFunc(this.input);
    this.input.messages.push({ role: "system", content: result.message.content });
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

  async run(): Promise<string> {
    return this.input;
  }
};

@DTO({
    type: "object",
    description: "A class that determines if reflection should be applied.",
    properties: {
        shouldReflect: {
            type: "boolean",
            description: "Indicates whether the agent should reflect on its previous actions before proceeding."
        }
    },
    required: ["shouldReflect"]    
})
class ShouldReflect {
    shouldReflect: boolean;
    
    constructor(shouldReflect: boolean) {
        this.shouldReflect = shouldReflect;
    }

    getShouldReflect(): boolean {
        return this.shouldReflect;
    }
}

class ReflectWorkflow extends StateMachine {

  constructor(
    input: any,
    chatFunc: (input: any) => Promise<any>,
    toStructuredOutput?: <T extends typeof StructuredOutput>(
        input: any, 
        dto: T,
        retries?: number
    ) => Promise<InstanceType<T> | StructuredOutputValidationError>
  ) {
    const initialState = new ReflectState(input, chatFunc);

    const transitionFromReflectState = async (state: State): Promise<ReflectState | TerminalReflectState> => {
      const input = (state as ReflectState).getInput();
      const shouldReflectResult = await toStructuredOutput!(input, ShouldReflect);
      console.log("Should Reflect:", shouldReflectResult);
      console.log("input:", input);
      if (!(shouldReflectResult instanceof StructuredOutputValidationError) && (shouldReflectResult as ShouldReflect).getShouldReflect()) {
        return new ReflectState(input, chatFunc);
      }
      return new TerminalReflectState(input);
    };

    const transitions = new Map<string, (currentState: State) => Promise<State>>([
      [ReflectState.name, transitionFromReflectState],
    ]);

    super(initialState, transitions);
  }
}

export { ReflectState, TerminalReflectState, ReflectWorkflow };
