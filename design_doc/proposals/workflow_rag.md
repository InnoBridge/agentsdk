# Workflow RAG Proposal

## Objective
Determine whether Retrieval-Augmented Generation (RAG) can reliably index and retrieve workflows—capturing both node semantics and transition structure—so agents can reason about, refactor, and autocomplete automation graphs.

## Workflow Representation
1. **Whole-workflow summaries** – Serialize each workflow into a canonical, human-readable description (topological order, trigger descriptions, termination states). Good for quick similarity search but weak on fine-grained structure.
2. **Node-centric chunks** – One document per node including:
   - Type (trigger/action/branch/system)
   - Key parameters (HTTP method, table name, expression snippets)
   - Incoming/outgoing edges with condition labels
   - Execution stats (avg duration, failure codes)
   Enables retrieval like “find workflows where Airtable trigger feeds a Code node.”
3. **Transition records** – One document per edge capturing `{fromNode, toNode, pathType, guardConditions}` plus short natural-language explanation ("Webhook output filtered by IF, success branch hits Slack"). Preserves directionality for path completion queries.
4. **Path motifs (length k=3–5)** – Sliding windows over executions; store as mini-graphs with textual context ("Webhook → Code (normalize) → HTTP Request (POST Salesforce)"). Useful for template suggestions and debugging repeated anti-patterns.
5. **Graph embeddings adjunct** – Run lightweight graph embedding (node2vec/GraphSAGE) over each workflow to capture structural fingerprints (breadth vs. depth, branching factor). Concatenate or store as metadata for filtering/reranking.

## Node & Transition Similarity
- **Node embeddings first**: represent each node as an embedding that mixes type, key parameters, and normalized metadata. Nodes that play the same role (e.g., identical Airtable triggers) end up close in space even across workflows.
- **Transition vectors**: embed each directed edge `{fromNode → toNode}` with its guard condition and slot position (success/failure branch). These vectors capture sequencing, which pure node embeddings miss.
- **Path signatures**: build deterministic tokens for short walks, e.g., `A→B→C→D` or branching tuples like `A→{B,C}`. Signatures can be textual (stored in `workflow_paths_k3`) or hashed for fast similarity checks.
- **Transition-output sequences**: record actual execution traces as node-visit strings (e.g., `AABBAA`, `AABBBA`, `BABBA`). Treat each character as a normalized node alias and compare sequences with edit distance, longest common subsequence, or n-gram overlap to capture behavioral similarity during runtime, not just static topology.
- **Similarity scoring**:
  1. **Linear paths** – compare ordered sequences with cosine similarity over their embeddings or with edit distance over the path tokens.
  2. **Branching** – treat each fan-out as a set and compute weighted Jaccard between `{A→B, A→C}` etc. This surfaces that workflows 2 and 3 share the same root but diverge on targets, while workflow 1 contains the full linear motif `A→B→C→D`.
  3. **Graph edit distance lite** – approximate GED by summing costs for node substitutions (embedding distance) plus edge insert/delete penalties. Useful for ranking “most similar workflow” candidates without full exponential search.
  4. **Structural features** – store branching factor histograms, depth distributions, and strongly connected component counts alongside embeddings to break ties between similar textual descriptions.
- **Retrieval flow**: when a user provides a partial path (e.g., `A→B`), search the transition index for compatible edges, pull adjacent nodes, and compute the above similarity metrics to rank completions (workflow 2 prefers continuing to `C`, workflow 3 to `D`, workflow 1 provides the longest continuation `C→D`).

## Example: Workflow Similarity Scoring

**Workflow 1:** Webhook → Validate → HTTP POST → Slack  
**Workflow 2:** Webhook → Validate → HTTP POST → Email  
**Workflow 3:** Webhook → Filter → HTTP POST → Slack

Query: "Similar workflows to Webhook → Validate → HTTP POST"

Scoring breakdown:
- WF1: Path similarity = 0.95 (3/4 exact match)
- WF2: Path similarity = 0.85 (2/4 exact, 1/4 semantic)
- WF3: Path similarity = 0.75 (2/4 exact, different node at position 2)

## Workflow Algebra
- **Sequential composition (`WF1 + WF2`)** – Connect sink nodes of `WF1` to source nodes of `WF2`, optionally inserting mediator nodes (queue, mapper). Embedding-wise, concatenate terminal-path vectors or average the embeddings of the participating nodes so the resulting `WF3` inherits semantics from both workflows.
- **Union (`WF1 ∪ WF2`)** – Merge node/edge sets while keeping original triggers. Use this to create super-workflows that can branch into either automation. Practically, union equals taking the union of motif hashes and deduplicating nodes whose embeddings fall below a distance threshold.
- **Intersection (`WF1 ∩ WF2`)** – Extract the shared subgraph by matching nodes and transitions whose embeddings/metadata align. Handy for surfacing reusable building blocks or compliance-critical segments present in both workflows.
- **Difference (`WF1 \\ WF2`)** – Remove the intersecting subgraph to highlight what is unique to `WF1`. This is the algebraic view behind “what changed between versions” and is computed by subtracting motif IDs or node-visit sequences.
- **Closure / repetition (`WF*`)** – Mark a motif as repeatable and materialize `n` copies during composition. Metadata `repeatable=true` lets the retrieval layer know it should expand or summarize loop bodies depending on query intent.
- **Validation hooks** – After any algebraic operation we re-run static checks (acyclicity, credential scopes, rate limits). The composition type is stored in metadata so RAG queries like “show workflows formed by union of marketing and CS flows” can filter on it.
- **Practical capabilities**:
  1. **Auto-composed drafts** – Given a natural language goal, retrieve building blocks via RAG and apply `+` to stitch them (e.g., `WF lead-capture + WF enrichment + WF routing`), yielding a runnable baseline.
  2. **Variant exploration** – Offer users side-by-side alternatives by computing `WF1 ∪ WF2` (combined automation) or `WF1 \\ WF2` (delta view) so they can compare scope and risk quickly.
  3. **Compliance proof** – Use intersections to show two workflows share the mandated approval motif; if `WF1 ∩ WF2 = ∅`, flag missing controls.
  4. **Template refactoring** – Factor common motifs via intersection, label them, and reuse with closure (`WF motif*`) when generating repeating constructs like pagination or retries.
  5. **Governance search** – Filter by `compositionType` to find mega workflows (unions) that may need ownership review, or diff-based compositions that warrant regression testing.
- **Embedding impacts**:
  - **Sequential (`+`)** – Compose embeddings by concatenating or attention-weighting the tail of `WF1` with the head of `WF2`, yielding `vec(WF3)` without re-embedding the entire merged JSON. This enables on-the-fly draft generation.
  - **Union (`∪`)** – Take a weighted centroid over motif embeddings from each branch (weights proportional to execution frequency) so the vector reflects both behaviors; store with metadata `compositionType=union`.
  - **Intersection (`∩`)** – Intersect motif IDs, average their vectors, and treat the result as a “shared-core” embedding that supports queries like “find workflows sharing the same approval spine.”
  - **Difference (`\\`)** – Subtract the intersection vector from the source workflow vector (or down-weight overlapping motifs) to obtain a residual embedding representing new/changed logic.
- **Closure (`*`)** – Reuse the motif vector but annotate repetition counts; during retrieval we either replicate the vector `n` times (if depth matters) or keep a single embedding plus metadata `repeatable=true` to reduce storage.

### Workflow Algebra: Concrete Example

**Given:**
- WF_lead: "Capture form submission → Store in Airtable"
- WF_enrich: "Get contact from Airtable → Call Clearbit → Update Airtable"

**Sequential Composition (WF_lead + WF_enrich):**  
Result: "Form → Store → Retrieve → Clearbit → Update"
- Sink of WF_lead (Store) connects to source of WF_enrich (Retrieve)
- Embedding: concat(tail(WF_lead), head(WF_enrich))

**Union (WF_lead ∪ WF_urgent_lead):**  
Result: Two parallel triggers, shared downstream processing
- Use case: A/B testing different lead capture methods

## Agent Integration
- **Planning** – Agents translate high-level requests into algebraic expressions (e.g., “augment lead workflow with enrichment” → `WF_lead + WF_enrich`). The RAG layer returns candidate subflows plus their embeddings so the agent can pick the best composition plan.
- **Tool selection** – Node-level embeddings let an agent reason about which tools/nodes are available; transition embeddings ensure the agent proposes valid hand-offs between tools when applying algebraic operations.
- **Editing & verification** – After composing workflows via algebra, the agent runs structural checks and retrieves similar precedents to validate the design. Difference embeddings highlight what changed, enabling explanatory responses to the user.
- **Runtime adaptation** – Logged execution traces (node-visit sequences) allow agents to detect drift (workflow behaving differently) and suggest algebraic adjustments, such as union with a fallback branch or pruning via difference.
- **Memory/feedback** – Agents store accepted compositions and their metadata (compositionType, embedding) for future reuse, improving retrieval quality over time.

## Implementation Approach
1. **Ingestion / feature extraction**
   - Listen to workflow CRUD events, materialize a normalized graph (`nodes`, `edges`, `paths_k3`).
   - For each node, produce a feature object `{type, paramsSummary, credentialsHash, execStats, depth, branchRole}`.
   - For each edge, add `{fromId, toId, condition, branchLabel, sequencePosition}` and pre-compute adjacency lists for fast neighborhood lookups.
   - Generate path signatures by sliding a window over topologically sorted executions; store both textual token (e.g., `A→B→C`) and hashed id for vector search.
   - Collect execution traces per run, normalize node names into compact aliases (`A`, `B`, …), and persist the resulting strings for downstream sequence-similarity scoring or HMM/Markov fingerprints.
2. **Embedding & storage**
   - Feed node feature text into the embedding model → store in `workflow_nodes` collection (vector + metadata).
   - Embed transition descriptions (include guard text + branch context) → store in `workflow_transitions`.
   - Compose path embeddings by concatenating node vectors or re-embedding the signature sentence; persist into `workflow_paths_k3`.
   - Cache lightweight structural stats (branching factor histogram, depth) alongside each document for hybrid scoring.
3. **Similarity service**
   - API accepts a query graph fragment (e.g., `{ nodes: [A,B], edges: [A→B] }`).
   - Fetch candidate continuations:
     ```pseudo
     candidates = searchTransitions(embedding(edge(A,B)))
     for each candidate:
       pathExtend = stitchPath(candidate.workflowId, start=A, length<=k)
       score = α*cos(vec(pathFragment), vec(pathExtend))
             + β*jaccard(branchSet(query), branchSet(candidate))
             + γ*structuralSim(stats(query), stats(candidate))
     ```
   - Return top-k suggestions annotated with source workflow IDs, node IDs, and probability/confidence.
4. **Worked example (A/B/C/D)**
   - Query path `A→B`: transition search finds matching edges in workflows 1–3.
   - Workflow 1’s path signature `A→B→C→D` has highest cosine similarity + longest continuation score.
   - Workflows 2 & 3 share branch Jaccard = 0.5 (one shared edge `A→B`, different fan-out), so they rank below workflow 1 for “continue path” intent but would rank highest for “find alternate branches from A”.
5. **Feedback loop**
   - Log which suggestions users accept, use that to fine-tune weights (α/β/γ) and to retrain reranker on “good completion” vs “bad completion” labels.

## Embedding Strategy
- **Textualization pipeline**: flatten structured parameters into sentences ("HTTP Request node sends GET to /leads with retries=3"); redact secrets, hash credential IDs.
- **Control-flow tokens**: introduce reserved markers `<TRIGGER>`, `<BRANCH_IF>`, `<MERGE>`, `<LOOP>` so the embedding model recognizes role changes between nodes.
- **Model selection**: start with high-recall text embedding (e.g., `text-embedding-3-large`, Cohere Embed v3, Voyage-large-2). Benchmark vs. cheaper options for latency/cost.
- **Dimensional regime**: 1.5k–3k dims for textual vectors; optionally append a short structural vector (degree counts, depth histogram, execution risk score) in metadata for hybrid search.
- **Normalization**: lower-case names, strip UUID noise, bucket numeric params, and quantize durations to keep vectors comparable across tenants.
- **End-to-end flow**:
  1. Pre-process node/edge/path payloads into canonical sentences with control-flow tokens.
  2. Batch-call embedding API (with retries + rate limiting) and persist vectors plus metadata IDs.
  3. Store vectors in Qdrant/Weaviate collections configured with cosine distance; metadata carries workflowId, nodeType, feature flags.
  4. During retrieval, execute vector search + optional filter, then merge results with structural stats (branching factors) for hybrid scoring.
  5. Cache frequently accessed vectors in Redis/memory to cut cold-start latency for interactive builder sessions.

## Index Design & Retrieval Flow
| Index | Document granularity | Key metadata | Typical query |
| --- | --- | --- | --- |
| `workflow_full` | Entire workflow summary | tenant, tags, size, updatedAt | “Find customer onboarding workflow.” |
| `workflow_nodes` | Node-centric text chunk | workflowId, nodeType, credentials, status | “Where is Salesforce upsert used?” |
| `workflow_transitions` | Edge/branch doc | triggerType, condition label, outcome | “How to go from webhook to Airtable insert via filter?” |
| `workflow_paths_k3` | Motif (3–5 nodes) | industry, successRate, author | “Recommend snippet for data cleaning before HTTP POST.” |

Retrieval pipeline:
1. **Query understanding** – A small LLM classifier detects intent: search, diagnose, autocomplete, compliance.
2. **Vector search** – Route query to one or more indexes. Apply metadata filters derived from intent (e.g., `nodeType:trigger`). Keep BM25 fallback for high-precision keyword constraints ("contains IF node").
3. **Reranking** – Use cross-encoder or lightweight reranker (MiniLM-b6, Cohere Rerank) to ensure structural fit for top-k hits.
4. **Grounding output** – Return documents plus raw workflow fragments (node JSON, edge definitions). The answering LLM cites node IDs/path IDs so downstream actions (execution, editing) remain deterministic.

## Query Examples

| Natural Language Query | RAG Strategy | Expected Result |
|------------------------|--------------|-----------------|
| "Find workflows that validate emails before sending" | Node + transition search | Workflows with Email nodes preceded by validation logic |
| "Show me invoice processing patterns" | Full-workflow + path motifs | Template workflows with PDF → Extract → Store → Notify pattern |
| "What happens after Stripe payment succeeds?" | Transition + path continuation | All edges from Stripe nodes with success conditions |
| "Workflows using deprecated HTTP Auth" | Node + metadata filter | Nodes with specific credential types |

## Evaluation Metrics

### Retrieval Quality
- **MRR (Mean Reciprocal Rank):** Position of first relevant result
- **NDCG@k:** Ranking quality of top-k results
- **Coverage:** % of queries returning ≥1 relevant workflow

### Autocomplete Accuracy
- **Suggestion Acceptance Rate:** % of AI suggestions user accepts
- **Edit Distance:** How much user modifies suggested completions
- **Contextual Relevance:** Does suggestion match user's intent?

### Operational
- **Latency:** p50, p95, p99 for retrieval queries
- **Ingestion Lag:** Time from workflow save → indexed
- **Cache Hit Rate:** % of queries served from cache

### Gold Dataset Examples
1. "Find workflows that sync Salesforce to Slack" → 5 labeled relevant workflows
2. "Autocomplete: Webhook → Filter → ?" → Expected: [HTTP Request, Database Insert, Email]
3. "Debug: Why did payment workflow fail?" → Workflows with similar error patterns

## When Text Embeddings Fail

**Limitation 1: Isomorphic Workflows**
- Workflows A and B have identical structure but different node labels
- Text embeddings would miss structural similarity
- **Solution:** Concatenate graph embedding (node2vec) with text embedding

**Limitation 2: Equivalent Logic, Different Topology**
- Workflow A: IF → Action → ELSE → Action
- Workflow B: Switch (3 branches) → Action
- Same business logic, different structure
- **Solution:** Normalize control flow patterns before embedding

**Limitation 3: Execution Order Matters**
- A → B → C ≠ A → C → B (different semantics)
- Pure text co-occurrence misses ordering
- **Solution:** Use positional encodings or sequence models (LSTM/Transformer)

## Use Cases
- Workflow autocomplete while an agent edits a graph (suggest next node/branch).
- Template discovery by natural-language intent ("B2B lead routing with enrichment").
- Debug assistant retrieving prior runs with similar failure fingerprints.
- Governance queries ("show automations touching S3 with public ACL changes").
- Knowledge transfer: explain unfamiliar workflows via retrieved summaries + node details.

## Challenges & Mitigations
- **Volume & churn** – Continuous workflow edits require streaming upserts. Use event bus → vector DB ingestion workers; keep version metadata for rollback.
- **Privacy** – Remove secrets/PII before embedding; isolate per-tenant namespaces or encrypt vectors at rest.
- **Long/branchy workflows** – Chunk by depth or logical group to avoid oversized embeddings; rely on motif index for targeted retrieval.
- **Evaluation** – Create gold datasets from support tickets/docs; measure MRR/NDCG and human-rated helpfulness. Include operational metrics (latency, ingestion lag).
- **Cost** – Cache embeddings for unchanged parts; deduplicate identical motifs across tenants to cut storage.

## Next Steps
1. Build ingestion prototype that exports node, transition, and motif documents from a sample workspace and indexes them in Qdrant/Weaviate.
2. Assemble 20–30 benchmark queries with labeled relevant workflows to compare embedding models + rerankers.
3. Integrate retrieval into the AI workflow builder experiment; track acceptance rate of suggestions vs. baseline heuristics.
4. Explore graph-aware models (Graph Transformers, Text+Node2Vec concatenations) if textual embeddings fail to capture branching semantics.
