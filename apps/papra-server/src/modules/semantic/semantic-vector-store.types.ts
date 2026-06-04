export type SemanticVectorMetric = 'cosine';

export type SemanticVectorManifest = {
  schemaVersion: number;
  model: string;
  dimensions: number;
  metric: SemanticVectorMetric;
  chunkSize: number;
  chunkOverlap: number;
  createdAt: Date;
  updatedAt: Date;
};

export type SemanticVectorChunkInput = {
  chunkIndex: number;
  embedding: number[];
};

export type SemanticVectorStoreHit = {
  id: string;
  rowId: number;
  documentId: string;
  chunkIndex: number;
  contentHash: string;
  distance: number;
  score: number;
};

export type SemanticVectorStore = {
  readonly isEnabled: boolean;
  readonly disabledReason?: string;

  upsertChunks: (args: {
    organizationId: string;
    documentId: string;
    documentContent: string;
    chunks: SemanticVectorChunkInput[];
    now?: Date;
  }) => Promise<void>;

  deleteByDocumentIds: (args: {
    documentIds: string[];
    organizationId?: string;
  }) => Promise<void>;

  knnSearch: (args: {
    organizationId: string;
    embedding: number[];
    limit: number;
  }) => Promise<{ hits: SemanticVectorStoreHit[] }>;
};

export type SemanticVectorStoreAvailability
  = | { isAvailable: true }
    | { isAvailable: false; reason: string; details?: Record<string, unknown> };
