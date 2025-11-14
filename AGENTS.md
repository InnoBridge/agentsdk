# Repository Guidelines

## Project Structure & Module Organization
- `src/` holds every runtime module: `agents/` and `workflow/` for orchestration logic, `client/` for provider adapters, `memory/` + `database/` for persistence helpers, and `tools/`, `models/`, `utils/`, `examples/` for reusable components.
- Tests live in `src/__tests__/`, fixtures in `assets/`, and reference material in `docs/` + `design_doc/`. Bundled artifacts are emitted to `dist/` by tsup; keep this directory clean in commits.
- Treat `index.ts` as the public barrel—add exports there when exposing new features to SDK consumers.

## Build, Test, and Development Commands
- `npm run dev` watches the library with tsup; prefer it while refining agents or workflows.
- `npm run build` emits optimized ESM/CJS packages; `npm run clean` removes `dist/` before a fresh build.
- `npm run typecheck` enforces the strict TS config; `npm run test` and `npm run test:watch` execute Vitest suites.
- `npm run test:integration --file=<pattern>` runs slower end-to-end specs via `tsx`. `npm run verify` chains typecheck, unit tests, and build and must be green pre-publish/PR.

## Coding Style & Naming Conventions
- Code in TypeScript with two-space indent, trailing commas, and explicit exports. Use the `@/*` alias for internal imports to avoid relative path churn.
- Adopt `PascalCase` for classes/interfaces, `camelCase` for functions/variables, and `kebab-case` filenames such as `workflow/graph-runner.ts`. Keep functions pure when viable and document observable side effects with brief JSDoc.
- Defer to `docs/style-guide.md` for export conventions, alias usage, and other fine-grained formatting expectations.
- Agents should surface their identity via the shared `AgentId` DTO (`{ name: string; id?: string }`). Implement `getId(): AgentId` when an agent has a stable identity so workflows can stamp provenance into `WorkflowId` metadata.

## Testing Guidelines
- Default to Vitest globals (already injected via `tsconfig`); stub network clients through `vi.mock` to keep tests deterministic.
- Co-locate unit specs as `src/__tests__/feature.test.ts` and label broader flows `*.integration.test.ts`. Aim for ≥80% statement coverage on new code and always rerun `npm run test:integration` before merging changes touching `workflow/` or `client/`.

## Commit & Pull Request Guidelines
- Follow the repo’s imperative, lowercase commit style (`address pr comment`, `add validate step`). Keep summaries under ~72 characters and explain breaking behavior in the body.
- PRs should describe intent, link issues, attach logs or screenshots when CLI output changes, and state any follow-up work. Require a green `npm run verify` check before requesting review.

## Security & Configuration Tips
- Use Node 20+ per `package.json` and keep secrets in untracked `.env` files. Never commit provider tokens or raw transcripts.
- Prefer the stubbed clients in `src/client/` while reproducing bugs; when real credentials are unavoidable, sanitize fixtures and redact logs before pushing.
