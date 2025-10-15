## MemoryClient (short-term memory)

Short-term memory (`MemoryClient`) is an ephemeral store that lives for the duration of a run. It is used for step context, scratchpads, chain-of-thought, and other transient state the runner needs during execution.

Primary primitives:
- append(streamKey: string, entry: unknown): Promise<void>
- read(streamKey: string, opts?: any): Promise<any[]>
- search?(query: any, opts?: any): Promise<any[]>
- clear?(streamKey: string): Promise<void>

Implementation notes:
- In-memory implementations are the default for tests and deterministic runs.
- Memory should be size-bounded and support eviction policies to prevent runaway runs.
- Writes to memory should be checked by the Safety layer for sensitive content and redaction where necessary.

Use cases:
- Conversation state and short-lived scratchpads
- Storing intermediate computation results that are not meant to be persisted
- Chain-of-thought traces for debugging (optional and gated by flags)
