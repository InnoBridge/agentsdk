```markdown
# Observability & Testing

Emit structured events to a pluggable event bus for persisting traces and debugging. Provide a test harness that can:
- Stub model responses deterministically
- Capture the event stream and assert on the sequence of actions
- Run fast integration tests using in-memory clients and connectors

Deterministic mode: allow seeding RNGs and stubbing model tokens to enable snapshot-style tests.

Persist event streams to an append-only store (database client, blob storage, or log aggregator) so production runs can be replayed. Emit redacted logs by default; provide feature flags to include or exclude tool inputs that may contain sensitive data.

Key metrics to capture:
- Task success rate
- Steps per task
- Tool error rates and latencies
- Model token usage and cost estimate

Add unit/integration tests to measure regressions and a lightweight benchmark harness for common scenarios.

```