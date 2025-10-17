# Execution Engine Sketch

## TL;DR
- Drive the plan → act → reflect loop for a single agent run.
- Accept an initialized session, a run spec, and strategy objects (planner, tool executor, optional safety/memory/events).
- Return either the final result or a structured error while emitting step events.

## Minimal API

```ts
interface ExecutionEngine<T = unknown> {
  execute(args: T): Promise<T>; // input/output shape defined by the engine/agent
  abort?(): Promise<void>;   // optional cleanup for long-lived engines
}
```

## Run Outline
1. `Agent` prepares dependencies and calls `engine.execute({ session, spec, ... })`.
2. The engine loops:
   - ask the planner for the next step using the current session state,
   - execute the step via `toolExecutor`, capturing outputs/errors,
   - update the session (memory, scratchpad, telemetry),
   - exit when the planner signals finish or when `abortSignal` fires.
3. The engine resolves the promise with whatever result shape the agent expects (or rejects with an error).

## Hooks & Extensibility (optional)
- Swap planners or executors by passing different strategy objects.
- Emit events (e.g., `engine.step`, `engine.error`) through the optional event bus.
- Implement `shutdown` when the engine owns resources such as worker pools or streaming buffers.

## Engine Flavors

| Variant | Scope / Lifecycle | When to use | Notes |
| --- | --- | --- | --- |
| **GlobalEngine** | Singleton instance shared across the process. | Default choice when the engine is stateless orchestration: kick off each `execute` call as its own async task so multiple agents can run concurrently. | If you need strict serialization, add a queue/lock explicitly; otherwise keep it re-entrant and expose `shutdown` to flush metrics or close shared pools. |
| **RequestEngine** | Created per inbound request (or async context). | Useful when you must inject request-scoped helpers (tenant safety policy, trace span, transactional context) directly into the engine lifecycle. | Typically wraps a `GlobalEngine`, decorating payloads before delegating; dispose at the end of the request so scoped dependencies get cleaned up. |
| **DisposableEngine** | Constructed for a single run and discarded immediately afterwards. | Ideal for tests, CLI tooling, or child workflows that need custom planners/tools without affecting global state. | Safe place to hold run-local state or in-memory stubs; keep construction cheap so callers can spin them up on demand. |

Implementation tips:
- Expose factories so hosts can pick a flavor without touching core orchestration (e.g., `createGlobalEngine()`, `createRequestEngine(globalEngine, requestCtx)`).
- Document whether your `GlobalEngine` processes runs in parallel or serially so callers know if concurrent agents will queue or execute immediately.
