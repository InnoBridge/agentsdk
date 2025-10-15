interface MemoryClient {
  append(streamKey: string, entry: unknown): Promise<void>;
  read(streamKey: string, opts?: any): Promise<any[]>;
  search?(query: any, opts?: any): Promise<any[]>;
  clear?(streamKey: string): Promise<void>;
}

export {
    MemoryClient
};