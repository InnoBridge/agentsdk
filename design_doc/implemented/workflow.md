# Workflow

A workflow is a series of units of work executed in sequence (or with deliberate branching) to achieve a particular goal. Each unit is wrapped by a `State` instance that carries the resources and context it needs to do its job (LLM client handles, DTO inputs, cached outputs), and calling `state.run(...)` executes that unit of work. The workflow coordinates execution via `transition`: after a state finishes, `transition` selects the next unit to run, while `getHead()` always returns the current state so runners know which step is next. This loop continues until a terminal state signals completion. In this SDK the workflow engine aligns with the structured-output layer so workflows can publish schemas, hydrate from raw data, and participate in the same validation tooling as DTOs.

## Goals
- Keep the workflow contract explicit so runners and tooling share a stable API.
- Make authoring ergonomic: small workflows should only need a couple of state classes and a runner.
- Allow advanced engines (tracing, caching, persistence) to extend the same contract without forking it.

## Current Implementation Snapshot (2025-02-14)
- `Workflow` is an abstract class extending `StructuredOutput`. It defines `getHead()`, `transition(state)`, `getId()`, and the shared `isTerminal()` helper. Because it inherits from `StructuredOutput`, workflows can be validated, hydrated, and described via the same schema tooling as DTOs.
- `StateMachine` is the default concrete runner. It stores the transition map, maintains the current head pointer, and embeds a `WorkflowId` object (`{ name, id, agentId?, userId? }`).
- `AgentId` itself is a `@DTO`, so agent metadata (name plus optional id) can be embedded directly inside workflow DTOs and logged consistently.
- `StructuredOutputType` includes a `WORKFLOW` discriminator. `BaseStructuredOutput` routes DTO, WORKFLOW, and TOOL decorations through a `switch`, so workflow decorators attach schema metadata without wrapping/altering the runtime class.
- The `@Work` decorator (exported from `src/workflow/workflow.ts`) publishes workflow schemas. `ReflectWorkflow` uses it to expose its normalized `input` payload plus optional `agentId`, unlocking `toStructuredOutputRaw` and `hydrate` flows for workflows.
- Reflection-specific DTOs (`Message`, `Input`, `ShouldReflect`) ensure inputs are normalized. Even raw objects run through the constructor, defaulting the model to `qwen3-coder:30b` and coercing each message into a DTO instance. Integration tests now consume the workflow entirely through structured output APIs.

## Workflow Contract Today

```ts
// src/workflow/state.ts
abstract class State {
  abstract run(input: unknown): Promise<unknown>;
}

class TerminalState extends State {
  async run(input: unknown) {
    return input;
  }
}

// src/workflow/workflow.ts
abstract class Workflow extends StructuredOutput {
  abstract getHead(): State;
  abstract transition(currentState: State): Promise<State | null>;
  abstract getId(): WorkflowId;

  isTerminal(state: State) {
    return state instanceof TerminalState;
  }
}

class StateMachine extends Workflow {
  constructor(
    private head: State,
    private readonly transitions: Map<string, (state: State) => Promise<State>>,
    private readonly workflowId: WorkflowId,
  ) {
    super();
  }

  getHead() {
    return this.head;
  }

  async transition(currentState: State) {
    if (this.isTerminal(currentState)) return null;
    const lookup = this.transitions.get(currentState.constructor.name);
    if (!lookup) {
      throw new Error(`No transition defined for ${currentState.constructor.name}`);
    }
    this.head = await lookup(currentState);
    return this.head;
  }

  getId() {
    return this.workflowId;
  }
}
```

**State** – Every workflow node derives from `State` and implements a single `run()` method. Calling `state.run(...)` executes the unit of work for that node; the runner invokes it each time the workflow enters the state, passing along whatever context the previous step produced. You can think of a `State` as a wrapper object around one unit of work: it packages the resources and context (LLM clients, DTO inputs, cached results) needed to execute that step, and exposes helper getters so transitions can inspect the outcome.

**TerminalState** – A convenience subclass that simply echoes the inbound payload. `Workflow.isTerminal()` checks for this type, allowing runners to short-circuit transitions without scattered `instanceof` checks. Most workflows return a `TerminalState` once the reflection/evaluation loop has converged so the runner knows to stop advancing.

## DTO + Annotation Integration

- **AgentId DTO** – Agents expose an optional `getId(): AgentId` hook. `AgentId` is a `@DTO` with required `name` and optional `id`, making provenance metadata consistent everywhere (workflow IDs, logs, structured outputs).
- **StructuredOutputType.WORKFLOW** – The decorator factory checks the enum and either extends `StructuredOutput`, extends `Workflow`, or extends `ToolComponent`. For the `WORKFLOW` branch we only attach schema metadata to the existing class; we no longer wrap constructors, which avoids breaking virtual methods like `getHead()`.
- **`@Work` decorator** – Mirrors `@DTO` but targets workflows. Annotated workflows can be fetched via `toStructuredOutputRaw`, hydrated in tests, and documented automatically. `ReflectWorkflow` exports a schema describing its `input` DTO and optional `agentId`.
- **Normalized input DTOs** – `Message` and `Input` DTOs ensure workflows receive consistent data. Even if callers pass plain objects, the constructor defaults `model` to `qwen3-coder:30b` and maps objects into `Message` instances.

## Executable States in Practice

States remain plain classes extending `State`. They encapsulate all business logic and can stash results for transitions to read. For example:

```ts
class ReflectState extends State {
  constructor(private input: Input) {
    super();
  }

  async run({ chatFunction }: { chatFunction: (input: Input) => Promise<any> }) {
    const result = await chatFunction(this.input.toChatRequest());
    this.input.messages.push({ role: 'assistant', content: result.message.content });
    return result;
  }

  getInput() {
    return this.input;
  }
}
```

`ShouldReflectState` follows the same pattern, storing the last judgment so transitions can branch without global state. Because states are classes, it’s easy to add helpers (`getDecision()`, `getAnnotation()`, etc.) without bloating the shared `State` base.

## Dynamically Generating Workflows at Runtime

- Because workflows inherit from `StructuredOutput` and are decorated with `@Work`, clients can prompt an LLM to generate a serialized workflow (or just its metadata) via the existing `LLMClient.toStructuredOutput` / `toStructuredOutputRaw` methods. The reflection integration tests literally call `ollamaClient.toStructuredOutput!(input, ReflectWorkflow)` with a natural-language prompt, and the response hydrates directly into a `ReflectWorkflow` instance.
- This means tooling (or even end users) can describe the desired workflow in a prompt—e.g., “capture annotations per state and log agent provenance”—and the client will hydrate the resulting workflow object without manual parsing.
- The same path works for debugging: `toStructuredOutputRaw` returns the JSON payload, and `.hydrate(...)` reconstructs the workflow locally, so tests can assert on schemas or on the normalized `Input` DTO without executing the full state machine.

```ts
const input = {
  model: 'qwen3-coder:30b',
  messages: [
    {
      role: 'system',
      content: 'You are a release reviewer; reflect on workflow refactors succinctly.',
    },
    {
      role: 'user',
      content: 'We added AgentId DTOs and per-state annotations. Summarize wins and follow-ups.',
    },
  ],
};

const workflow = await ollamaClient.toStructuredOutput!(input, ReflectWorkflow);
const agent = new ReflectionAgent();
const prompt = {
  model: 'qwen3-coder:30b',
  messages: [
    { role: 'system', content: 'Act as a release reviewer.' },
    { role: 'user', content: 'Evaluate the new annotation pipeline.' },
  ],
};
await agent.run(prompt, workflow);
```

## Next Steps
- **Workflow engine** – Formalize the runtime as a reusable engine (hooks, persistence, introspection) so agents can swap in different runners without touching individual workflows.
- **Paused workflows** – Support human-in-the-loop pauses where a workflow can suspend (persisting `WorkflowId`, pending state, and context) and resume later when an external trigger or approval arrives.
- **Workflow history** – Record every state transition and annotation so auditors can replay decisions or visualize the execution graph.
- **Observability** – Let states emit structured metrics or annotations after each `run()` and have the runner forward them to tracing/monitoring sinks.
- **Validation** – Provide static/dynamic validators that confirm terminal states are reachable and, for DAG-style workflows, verify the graph is acyclic (or highlight cycles for manual review).
- **Graph inspection** – Expose a canonical `getGraph()` representation of states and transitions so tooling can render or diff workflow graphs at runtime.
