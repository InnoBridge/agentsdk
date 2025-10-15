## LLMClient

An `LLMClient` implements a simple synchronous or asynchronous call interface for language model providers.

Suggested surface:
- call(promptOrMessages: string | ChatMessage[], opts?: CallOptions): Promise<ModelResponse>
- // optional streaming API: async iterator of token chunks
- stream?(promptOrMessages: string | ChatMessage[], opts?: StreamOptions): AsyncIterable<TokenChunk>
- // optional metadata & lifecycle
- getModelInfo?(): Promise<{ name: string; maxTokens?: number; supportsStreaming?: boolean }>;
- close?(): Promise<void>;

Notes:
- Provide a standard `ModelResponse` shape that include raw provider response, parsed text, and token usage metadata.
- Streaming APIs should be opt-in and guarded by provider capability checks.
