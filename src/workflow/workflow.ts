import type { AgentId } from '@/agents/agent';
import { State, TerminalState } from '@/workflow/state';

type WorkflowId = {
  name: string;
  id: string;
  agentId?: AgentId;
  userId?: string;
};


abstract class Workflow {
  /**
   * Returns the first executable state plus any context needed to bootstrap the run.
   */
  abstract getHead(): State;

  /**
   * Advances the workflow based on the provided current state. Implementations are
   * expected to mutate their internal pointer so subsequent `getHead()` calls reflect
   * the update.
   */
  abstract transition(currentState: State): Promise<State | null>;

  /**
   * Retrieves the identifier associated with the workflow run.
   */
  abstract getId(): WorkflowId;

  /**
   * Returns true if the provided state represents a terminal node.
   */
  isTerminal(state: State): boolean {
    return state instanceof TerminalState;
  }
}

class StateMachine extends Workflow {
  private transitions: Map<string, (currentState: State) => Promise<State>>;
  private head: State;
  private readonly workflowId: WorkflowId;

  constructor(
    initialState: State,
    transitions: Map<string, (currentState: State) => Promise<State>>,
    workflowId: WorkflowId,
  ) {
    super();
    this.head = initialState;
    this.transitions = transitions;
    this.workflowId = workflowId;
  }

  getHead(): State {
    return this.head;
  }

  async transition(currentState: State): Promise<State | null> {
    if (currentState instanceof TerminalState) {
      return null;
    }

    const nextState = this.transitions.get(currentState.constructor.name);
    if (!nextState) {
      throw new Error(`No transition defined for state: ${currentState.constructor.name}`);
    }
    this.head = await nextState(currentState);
    return this.head;
  }

  getId(): WorkflowId {
    return this.workflowId;
  }
}

export { Workflow, StateMachine };
export type { AgentId, WorkflowId };
