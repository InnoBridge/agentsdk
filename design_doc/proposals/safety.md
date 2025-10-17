```markdown
# Safety & Policy

Provide an intercepting policy engine with rules configured per-agent. Rules examples:
- toolAllowlist / toolDenylist
- requestRateLimit per-tool
- contentFilter (block prompts or tool inputs that match disallowed categories)

Policy enforcement points:
- Planner output validation (prevent disallowed tool selections)
- Tool input sanitization
- Memory write filters (redact or drop sensitive data)

Audit logs: all blocked/modified actions must be recorded for audit and debugging.

Security Considerations:
- Default deny for potentially destructive tools (shell, DB writes, cloud APIs).
- Provide role-based access controls for tool registration and agent creation.
- Encrypt persisted memory at rest; ensure secrets are never written to logs or persisted stores.

Privacy notes:
- Redact logs by default; provide feature flags to include or exclude tool inputs that may contain sensitive data.
- Memory writes should be filtered or redacted before persisting; sensitive fields must be excluded from backups or exports.

```