```markdown
# Evaluation & Metrics

Key metrics to capture:
- Task success rate
- Steps per task
- Tool error rates and latencies
- Model token usage and cost estimate

Add unit/integration tests to measure regressions and a lightweight benchmark harness for common scenarios.

Implementation notes:
- Emit metrics via the event bus with a compact schema so replay and aggregation are cheap.
- Prefer sampling for high-volume metrics and provide sampling controls in the agent spec.
- Store long-term metrics in a time-series store or metrics backend (Prometheus, Datadog, etc.) and keep traces in append-only archives.

```