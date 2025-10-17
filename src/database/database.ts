interface DatabaseClient {
  write(collection: string, key: string, value: any): Promise<void>;
  read(collection: string, key: string): Promise<any | null>;
  query(collection: string, q: any, opts?: any): Promise<any[]>;
  search?(text: string, opts?: { topK?: number }): Promise<any[]>;

  // optional helpers
  append?(streamKey: string, entry: unknown): Promise<{ ok: boolean; id?: string }>;
  createEmbedding?(docId: string, vector: number[]): Promise<void>;
}

export {
    DatabaseClient
};