## pickTools

### Motivation

When an agent maintains a large catalog of tools (50+), sending all tool definitions to the LLM on every request creates several problems:

1. **Token cost explosion**: Each tool definition consumes tokens (name, description, JSON schema). A 100-tool catalog can add 5-10K tokens per request.
2. **Degraded LLM accuracy**: Research shows function-calling accuracy drops significantly when models must choose from 30+ functions. Attention dilution makes the model more likely to hallucinate or pick suboptimal tools.
3. **No safety gates**: Without pre-filtering, unsafe or expensive tools are always visible to the LLM, even when context or permissions should exclude them.
4. **Missing provenance**: When the LLM selects tools directly, we lose visibility into *why* those tools were candidates and what alternatives were considered.

`pickTools` addresses these issues by introducing an optional **pre-filtering and ranking step** that runs before `toolCall`. It scores and ranks tools based on relevance, safety, and compatibility, then passes only the top candidates to the LLM.

### When to Use `pickTools`

**Use `pickTools` when:**
- Tool catalog is large (>20 tools)
- You need safety/permission filtering before LLM sees tools
- You want cost control (limit token usage per request)
- You need audit trails (scores, reasons, provenance)
- LLM accuracy is degrading due to catalog size

**Skip `pickTools` when:**
- Catalog is small (<10 tools)
- All tools are safe and low-cost
- You want maximum LLM flexibility (let model see everything)

### Interface

`pickTools` is a pure, selection-only function that scores and ranks candidate tools without executing them:

```ts
pickTools(input: any, tools: ToolClass[], opts?: PickOptions): Promise<PickResult[]>
```

**Types:**

```ts
interface PickOptions {
  maxCandidates?: number;     // default 3; how many to return
  minScore?: number;          // default 0.05; threshold for inclusion
  allowUnsafe?: boolean;      // default false; whether to include tools marked unsafe
  scorer?: ScorerFn;          // custom scoring function (overrides default)
  timeoutMs?: number;         // optional overall timeout for scoring
  debug?: boolean;            // include extra provenance in results
}

interface PickResult {
  tool: ToolClass;            // the tool class (not instance)
  score: number;              // normalized 0..1
  reason?: string;            // human-readable explanation
  provenance?: {              // optional audit metadata
    scorer?: string;
    details?: any;
  };
}

type ScorerFn = (input: any, tool: ToolClass) => Promise<{
  score: number;
  reason?: string;
  details?: any;
}>;
```

### Behavior

1. **Normalize input**: convert `input` to a searchable string (stringify if object).
2. **Score each tool**:
   - If `opts.scorer` provided, use it to score each tool.
   - Otherwise, use default keyword-based scorer (token overlap between input and tool name/description/tags).
   - If tool has `safe: false` and `allowUnsafe: false`, skip it entirely.
3. **Filter and rank**: keep tools with `score >= minScore`, sort descending by score, take top `maxCandidates`.
4. **Return results**: array of `PickResult` objects with tool class, score, and reason.

`pickTools` is **pure**: it never calls `tool.run()` or causes side effects. It only ranks and returns metadata.

### Default Scorer (Keyword-Based)

The default scorer uses simple token overlap:

```ts
function defaultScorer(input: any, tool: ToolClass): { score: number; reason?: string } {
  const inputText = typeof input === 'string' ? input : JSON.stringify(input);
  const toolText = [tool.definition.name, tool.definition.description, ...(tool.definition.tags || [])]
    .filter(Boolean)
    .join(' ');

  const score = keywordOverlap(inputText, toolText); // 0..1
  const reason = score > 0 ? `matched keywords in ${tool.definition.name}` : undefined;

  return { score, reason };
}
```

This is fast and deterministic, but limited to surface-level matching. For better results, use a semantic scorer.

### Custom Scorers

`pickTools` accepts a `scorer` function to replace the default heuristic. Common patterns:

**1. Embedding-based scorer (semantic similarity)**

```ts
const embeddingScorer: ScorerFn = async (input, tool) => {
  const inputEmbed = await embedText(input);
  const toolEmbed = await embedText(tool.definition.description);
  const score = cosineSimilarity(inputEmbed, toolEmbed);
  return { score, reason: 'semantic similarity' };
};

const picks = await pickTools(userQuery, allTools, { scorer: embeddingScorer, maxCandidates: 3 });
```

**2. LLM-based scorer (classify relevance)**

```ts
const llmScorer: ScorerFn = async (input, tool) => {
  const prompt = `Given input: "${input}"\nTool: ${tool.definition.name} - ${tool.definition.description}\nRelevance (0-1):`;
  const response = await llm.chat({ messages: [{ role: 'user', content: prompt }] });
  const score = parseFloat(response.text);
  return { score, reason: 'LLM classifier', details: { prompt, model: 'gpt-4' } };
};
```

**3. Hybrid scorer (keyword + embeddings)**

```ts
const hybridScorer: ScorerFn = async (input, tool) => {
  const keywordScore = defaultScorer(input, tool).score;
  const semanticScore = (await embeddingScorer(input, tool)).score;
  const score = 0.4 * keywordScore + 0.6 * semanticScore;
  return { score, reason: 'hybrid (keyword + semantic)' };
};
```

### Integration with `toolCall`

`pickTools` sits **before** `toolCall` in the agent loop:

```ts
// Without pickTools (send all tools to LLM)
const toolInstances = await llmClient.toolCall(input, allTools);

// With pickTools (pre-filter to top 3 relevant tools)
const candidates = await pickTools(input, allTools, { maxCandidates: 3 });
const selectedTools = candidates.map(c => c.tool);
const toolInstances = await llmClient.toolCall(input, selectedTools);
```

This reduces token cost (3 tool definitions instead of 100) and improves LLM accuracy.

### Safety and Permissions

`pickTools` can enforce safety policies before tools reach the LLM:

```ts
@Tool({ name: 'delete_database', safe: false })
class DeleteDatabaseTool { /* ... */ }

// By default, unsafe tools are excluded
const picks = await pickTools(input, allTools); // DeleteDatabaseTool not included

// Explicit opt-in required for unsafe tools
const picksWithUnsafe = await pickTools(input, allTools, { allowUnsafe: true });
```

Future enhancements:
- User/role-based permissions (filter by `allowedRoles` metadata)
- Context-based filtering (only show tools compatible with current execution mode)
- Cost/quota checks (exclude tools that would exceed budget)

### Provenance and Debugging

`PickResult` includes `reason` and optional `provenance` for audit trails:

```ts
const picks = await pickTools(input, tools, { debug: true });

picks.forEach(p => {
  console.log(`${p.tool.definition.name}: ${p.score.toFixed(2)} - ${p.reason}`);
  if (p.provenance) console.log('  Provenance:', p.provenance);
});

// Output:
// get_weather: 0.87 - matched keywords in get_weather
// get_temperature: 0.45 - matched keywords in get_temperature
```

### Edge Cases

- **Streaming tools**: `pickTools` can check `tool.definition.capabilities.streaming` and filter based on request type.
- **Expensive scorers**: Set `timeoutMs` to bound total scoring time. If scoring times out, fall back to top-K by registration order.
- **Empty results**: If no tools score above `minScore`, return empty array. Caller should handle gracefully (e.g., ask LLM to rephrase or use fallback tools).
- **Determinism**: Default scorer is deterministic. LLM/embedding scorers may vary; cache scores when possible.

### Performance Considerations

- **Default scorer**: O(tools) keyword comparisons, ~0.1ms per tool. Scales to 1000+ tools.
- **Embedding scorer**: O(tools) embedding lookups + cosine similarity. Pre-compute and cache tool embeddings; ~5-10ms per tool with cached embeddings.
- **LLM scorer**: O(tools) LLM calls. Expensive and slow; use only for critical decisions or batch score in parallel.

For large catalogs (100+ tools), prefer:
1. Default scorer for first pass (fast, eliminates 90% of irrelevant tools)
2. Semantic scorer for re-ranking top 10 candidates
3. LLM scorer only if needed for tie-breaking or compliance

### Implementation Status

- **Current**: Interface and types defined; awaiting implementation.
- **Next**: Implement default keyword scorer and `pickTools` function in `src/tools/pickTools.ts`.
- **Future**: Add embedding scorer integration, tool registry discovery, and permission-based filtering.

### Example: Complete Flow

```ts
// 1. Start with large catalog
const allTools = [WeatherTool, CalcTool, SearchTool, /* ...97 more */ ];

// 2. Pre-filter to top 3 relevant tools
const candidates = await pickTools(userInput, allTools, {
  maxCandidates: 3,
  minScore: 0.1,
  allowUnsafe: false,
  debug: true,
});

console.log('Selected tools:', candidates.map(c => `${c.tool.definition.name} (${c.score})`));

// 3. Send only top 3 to LLM
const selectedToolClasses = candidates.map(c => c.tool);
const toolInstances = await llmClient.toolCall(
  { model: 'gpt-4', messages: [{ role: 'user', content: userInput }] },
  selectedToolClasses
);

// 4. Execute chosen tools
for (const tool of toolInstances) {
  const result = await tool.run();
  console.log(result);
}
```

This approach keeps token costs low, LLM accuracy high, and provides full audit trails for tool selection and execution.

### This is critical for

- Debugging why certain tools were/weren't selected
- Explaining agent decisions to users
- Auditing compliance (which tools were visible, which were excluded)

### Edge Cases

- **Streaming tools**: `pickTools` can check `tool.definition.capabilities.streaming` and filter based on request type.
- **Expensive scorers**: Set `timeoutMs` to bound total scoring time. If scoring times out, fall back to top-K by registration order.
- **Empty results**: If no tools score above `minScore`, return empty array. Caller should handle gracefully (e.g., ask LLM to rephrase or use fallback tools).
- **Determinism**: Default scorer is deterministic. LLM/embedding scorers may vary; cache scores when possible.

### Performance Considerations

- **Default scorer**: O(tools) keyword comparisons, ~0.1ms per tool. Scales to 1000+ tools.
- **Embedding scorer**: O(tools) embedding lookups + cosine similarity. Pre-compute and cache tool embeddings; ~5-10ms per tool with cached embeddings.
- **LLM scorer**: O(tools) LLM calls. Expensive and slow; use only for critical decisions or batch score in parallel.

For large catalogs (100+ tools), prefer:
1. Default scorer for first pass (fast, eliminates 90% of irrelevant tools)
2. Semantic scorer for re-ranking top 10 candidates
3. LLM scorer only if needed for tie-breaking or compliance

### Implementation Status

- **Current**: Interface and types defined; awaiting implementation.
- **Next**: Implement default keyword scorer and `pickTools` function in `src/tools/pickTools.ts`.
- **Future**: Add embedding scorer integration, tool registry discovery, and permission-based filtering.

### Example: Complete Flow

```ts
// 1. Start with large catalog
const allTools = [WeatherTool, CalcTool, SearchTool, /* ...97 more */ ];

// 2. Pre-filter to top 3 relevant tools
const candidates = await pickTools(userInput, allTools, {
  maxCandidates: 3,
  minScore: 0.1,
  allowUnsafe: false,
  debug: true,
});

console.log('Selected tools:', candidates.map(c => `${c.tool.definition.name} (${c.score})`));

// 3. Send only top 3 to LLM
const selectedToolClasses = candidates.map(c => c.tool);
const toolInstances = await llmClient.toolCall(
  { model: 'gpt-4', messages: [{ role: 'user', content: userInput }] },
  selectedToolClasses
);

// 4. Execute chosen tools
for (const tool of toolInstances) {
  const result = await tool.run();
  console.log(result);
}
```

This approach keeps token costs low, LLM accuracy high, and provides full audit trails for tool selection and execution.
