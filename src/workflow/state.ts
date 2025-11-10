abstract class State {
  /**
   * Perform the unit of work for this node. Runners invoke `run` every time the
   * workflow enters the state.
   */
  abstract run(input: unknown): Promise<unknown>;
}

/**
 * A terminal state that marks the end of a workflow.
 * When reached, no further transitions are possible.
 */
class TerminalState extends State {
  constructor(private readonly result?: unknown) {
    super();
  }

  async run(input: unknown): Promise<unknown> {
    return this.result ?? input;
  }
}

export { State, TerminalState };
