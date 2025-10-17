# TODO: Error handling, observability & metrics

This file captures sections removed from `agent.md` to keep the base Agent API small. Revisit and implement these items when you want to add full error/metrics handling, observability, and persisted traces.

Contents moved from `agent.md`:

- Rich event stream for observability (step start/end, model tokens, errors).

- Error modes (to formalize):
  - Model failures or timeouts.
  - Tool errors (retriable vs fatal configurable per tool).
  - Safety violations (blocked by policy enforcement layer).

- AgentResult extended fields to implement later (FullAgentResult):
  - error: optional object `{ message, code?, info? }` populated when `success === false`
  - retryInfo?: { attempts: number; lastError?: string }
  - metrics?: { durationMs?: number; toolLatencyMs?: Record<string, number> }

- Agent event hooks (to restore later):
  - onStepStart(stepInfo)
  - onModelTokens(tokens)
  - onToolCall(toolId, input)
  - onError(err)

- Evaluation & Metrics section (to re-add later):
  - Key metrics to capture:
    - Task success rate
    - Steps per task
    - Tool error rates and latencies
    - Model token usage and cost estimate

Note: The "Evaluation & Metrics" section has been moved to `evaluation.md`.

Implementation notes / reminders:
- Keep the base Agent API minimal. Provide an optional observability plug-in or event-bus integration for heavy telemetry.
- Prefer persisted traces (separate storage) or event subscriptions rather than always returning large telemetry objects to callers.
