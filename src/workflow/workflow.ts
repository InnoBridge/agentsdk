import { State, TerminalState } from '@/workflow/state';

interface Workflow {
  /**
   * Returns the first executable state plus any context needed to bootstrap the run.
   */
  getHead(): State;

  /**
   * Advances the workflow based on the provided current state. Implementations are
   * expected to mutate their internal pointer so subsequent `getHead()` calls reflect
   * the update.
   */
  transition(currentState: State): Promise<State | null>;

  /**
   * Returns true if the provided state represents a terminal node.
   */
  isTerminal(state: State): boolean;
}

class StateMachine implements Workflow {
  private transitions: Map<string, (currentState: State) => Promise<State>>;
  private head: State;

  constructor(initialState: State, transitions: Map<string, (currentState: State) => Promise<State>>) {
    this.head = initialState;
    this.transitions = transitions;
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

  isTerminal(state: State): boolean {
    return state instanceof TerminalState;
  }
};

export { Workflow, StateMachine };
