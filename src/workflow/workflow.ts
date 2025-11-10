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
   * @returns true if the workflow has reached a terminal state (no further transitions), false otherwise
   */
  transition(): boolean;
}

class StateMachine implements Workflow {
  private transitions: Map<typeof State, () => State>;
  private head: State;
  
  constructor(initialState: State, transitions: Map<typeof State, () => State>) {
    this.head = initialState;
    this.transitions = transitions;
  }

  getHead(): State {
    return this.head;
  }

  transition(): boolean {
    // Check if already at terminal state
    if (this.head instanceof TerminalState) {
      return false;
    }

    const nextState = this.transitions.get(this.head.constructor as typeof State);
    if (!nextState) {
      throw new Error(`No transition defined for state: ${this.head.constructor.name}`);
    }
    this.head = nextState();
    return true;
  } 
};

export { Workflow, StateMachine };
