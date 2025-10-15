## DatabaseClient (long-term memory)

`DatabaseClient` represents the long-term, persistent storage used for knowledge bases, user profiles, and retrieval-augmented generation (RAG).

Recommended client types:
- In-memory (default for tests)
- SQLite (embedded, zero-deps)
- Redis/Postgres (production)

Primary primitives:
- append(streamKey, entry)
- read(streamKey, opts)
- search(query, opts)

Convenience CRUD/query signatures (recommended):
- write(collection: string, key: string, value: any): Promise<void>
- read(collection: string, key: string): Promise<any | null>
- query(collection: string, q: any, opts?): Promise<any[]>
- search?(text: string, opts?: { topK?: number }): Promise<any[]>

Usage notes:
- Keep the public API small and transactional where possible. Prefer append/read/search primitives over arbitrary query execution unless explicitly required.
- Consider a simple schema for RAG: documents with id, text, embedding, metadata; provide a utility to create/update embeddings.

Privacy & policy:
- Database clients must support redaction and access controls. The Safety layer should intercept sensitive writes and apply retention policies.
- Writes originating from agents should run through policy hooks to detect PII, secrets, or other disallowed content before persistence.

Safety and access patterns:
- Provide a bounded write budget per-run to avoid unbounded persistence during loops.
- Support dry-run or staging modes for testing (do not persist in these modes).

Connector contract (suggested):
- metadata: id, description, safeByDefault boolean
- append(key, entry, opts?): Promise<{ok: boolean; id?: string; error?: string}>
- read(key, opts?): Promise<{ok: boolean; items?: unknown[]; cursor?: string}>
- search(query, opts?): Promise<{ok: boolean; hits?: unknown[]; total?: number}>

TypeScript sketch:

```ts
export interface DatabaseClient {
	write(collection: string, key: string, value: any): Promise<void>;
	read(collection: string, key: string): Promise<any | null>;
	query(collection: string, q: any, opts?: any): Promise<any[]>;
	search?(text: string, opts?: { topK?: number }): Promise<any[]>;

	// Optional helpers
	append?(streamKey: string, entry: unknown): Promise<{ok: boolean; id?: string}>;
	// Embedding helpers
	createEmbedding?(docId: string, vector: number[]): Promise<void>;
}
```

Optional features:
- Embedding helpers (create/update embeddings) for RAG pipelines
- Bulk import/export for migration
- TTL/retention controls and redaction utilities
