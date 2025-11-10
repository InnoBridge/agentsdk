# Workflow Engine Proposal

This document captures the initial shape of the Workflow Engine. The focus here is on two foundational elements: the `Workflow` contract (interface vs. base class) and the “unit of compute” that workflows stitch together. Additional sections (runner, persistence, introspection, etc.) can layer on top of these primitives later.

## Goals
- Make the workflow contract explicit so runners and tooling can rely on a stable API.
- Keep authoring ergonomic: simple workflows should be easy to implement without subclass gymnastics.
- Allow advanced engines to extend the primitives (caching, tracing, metrics) without forcing every workflow to inherit heavy base classes.

## Element 1: Workflow Contract

### Interface vs. Base Class
- **Interface first**: Workflows are domain-specific graphs; forcing inheritance makes testing and composition harder. An interface keeps the contract pure and lets authors compose via functions, mixins, or decorators.
- **Optional helper base**: We can still ship a lightweight `AbstractWorkflow` that implements convenience helpers (state machine helpers, guards, logging). It should remain opt-in and depend only on the interface.
- **Transition semantics stay in user land**: Implementors retain full control over concurrency, determinism, and side-effects because the interface only mandates “where to start” (`head`) and “how to move” (`transition`).

### Proposed Interface

```ts
// src/workflow/state.ts
interface State {
  /**
   * Perform the unit of work for this node. Runners invoke `run` every time the
   * workflow enters the state.
   */
  run(input: unknown): Promise<unknown>;
}

export { State };

// src/workflow/workflow.ts
import { State } from '@/workflow/state';

interface Workflow {
  /**
   * Returns the first executable state plus any context needed to bootstrap the run.
   */
  head(): State;

  /**
   * Advances the workflow to the next state. Implementations mutate their own
   * internal `head` pointer (or similar) so the next `head()` call reflects
   * the updated state. Returning nothing keeps the contract simple.
   */
  transition(): void;
}

export { Workflow };
```

Notes:
- `State` keeps the execution contract focused on `run`. Authors can extend the interface locally if they want richer metadata, but the base shape never forces extra fields.
- Workflows can track any contextual data (latest results, external signals) on the instance before calling `transition()`.
- Completion is an implementation detail: workflows can flip an internal `done` flag, make `head()` return a sentinel state, or expose their own `isFinished()` helper.

### Optional Base Class

```ts
abstract class AbstractWorkflow implements Workflow {
  constructor(protected readonly graph: WorkflowGraph<State>) {}

  abstract head(): State;

  transition(): void {
    this.graph.resolveNext();
  }
}

export { AbstractWorkflow };
```

`WorkflowGraph` is a helper that can hold adjacency lists, guards, and fallback logic. Workflows can choose to ignore this base class and implement the interface directly when they need full control.

## Element 2: Executable State

We need a consistent description for the “thing that runs” inside the workflow. The `State` interface introduced above carries everything the runner needs.

### Key Fields
- **`run`**: the unit of compute (LLM call, tool invocation, fan-out) invoked whenever the runner enters the state. Authors can extend the interface if they want richer metadata, but the core contract stays minimal.

### Workflow Events & Transitions
- Workflows define their own notion of events (tool results, external triggers, timers) and stash those payloads however they like (`recordEvent`, `recordResult`, etc.) before `transition()` runs.
- The workflow author decides how to interpret any stored events/results and pick the next state inside `transition`, keeping the `State` definition minimal.

### Putting It Together

```ts
const makeNotifyState = (runId: string): State => ({
  async run(input) {
    const request = input as { email: string };
    return sendEmail(request.email, runId);
  },
});

const fallbackState: State = {
  async run() {
    await sendSmsFallback();
    return { delivered: true };
  },
};

const finishState: State = {
  async run() {
    return { status: 'ok' };
  },
};

class NotificationWorkflow implements Workflow {
  private readonly notifyState = makeNotifyState(crypto.randomUUID());
  private current: State = this.notifyState;
  private lastResult: unknown;
  private pendingEvent: unknown;
  private done = false;

  head(): State {
    return this.current;
  }

  isDone() {
    return this.done;
  }

  recordResult(result: unknown) {
    this.lastResult = result;
  }

  recordEvent(event: unknown) {
    this.pendingEvent = event;
  }

  transition(): void {
    if (this.done) {
      return;
    }

    if (this.current === this.notifyState) {
      const delivered = this.getDeliveredFlag();
      this.current = delivered ? finishState : fallbackState;
      return;
    }

    if (this.current === fallbackState) {
      this.current = finishState;
      return;
    }

    if (this.current === finishState) {
      this.done = true;
      return;
    }

    this.done = true;
  }

  private getDeliveredFlag(): boolean {
    if (typeof this.pendingEvent === 'object' && this.pendingEvent !== null) {
      const candidate = this.pendingEvent as { type?: string; data?: { delivered?: boolean } };
      if (candidate.type === 'result' && candidate.data?.delivered !== undefined) {
        return !!candidate.data.delivered;
      }
    }

    if (typeof this.lastResult === 'object' && this.lastResult !== null) {
      const result = this.lastResult as { delivered?: boolean };
      if (result.delivered !== undefined) {
        return !!result.delivered;
      }
    }

    return false;
  }
}
```

This example keeps each state simple (just a `run` function) while the workflow stores whatever metadata it needs (`lastResult`, `pendingEvent`, `done`) and takes full responsibility for routing in `transition()`.

## Next Steps
- Define the runner contract that consumes `Workflow` + `State`.
- Layer persistence + revisioning so workflows are versioned artifacts.
- Specify tracing/telemetry hooks on `State.run` executions.
