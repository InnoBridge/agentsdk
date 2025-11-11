import { State, TerminalState } from '@/workflow/state';

interface Workflow {
  /**
   * Returns the first executable state plus any context needed to bootstrap the run.
   */
  getHead(): State;

  /**
   * Advances the workflow to the next state. Implementations mutate their own
   * internal pointer so the next `getHead()` call reflects the updated state.
   * 
   * @returns true when the workflow advanced, false when it is already terminal
   */
  transition(): Promise<boolean>;
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

  async transition(): Promise<boolean> {
    if (this.head instanceof TerminalState) {
      return false;
    }

    const nextState = this.transitions.get(this.head.constructor.name);
    if (!nextState) {
      throw new Error(`No transition defined for state: ${this.head.constructor.name}`);
    }
    this.head = await nextState(this.head);
    return true;
  }
};

export { Workflow, StateMachine };
