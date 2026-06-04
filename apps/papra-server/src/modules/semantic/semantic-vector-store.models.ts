import { createHash } from 'node:crypto';
import { generateId } from '../shared/random/ids';
import { SEMANTIC_CHUNK_ID_PREFIX } from './semantic-vector-store.constants';

export function generateSemanticChunkId() {
  return generateId({ prefix: SEMANTIC_CHUNK_ID_PREFIX });
}

export function createSemanticDocumentContentHash({ content }: { content: string }) {
  return createHash('sha256').update(content).digest('hex');
}

export function serializeEmbeddingForLibsqlVector({ embedding }: { embedding: number[] }) {
  return JSON.stringify(embedding);
}

export function semanticVectorDistanceToScore({ distance }: { distance: number }) {
  return Math.max(0, Math.min(1, 1 - distance));
}
