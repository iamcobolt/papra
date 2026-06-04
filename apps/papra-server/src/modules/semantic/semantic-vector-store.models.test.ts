import { describe, expect, test } from 'vitest';
import { SEMANTIC_CHUNK_ID_PREFIX } from './semantic-vector-store.constants';
import { createSemanticDocumentContentHash, generateSemanticChunkId, semanticVectorDistanceToScore, serializeEmbeddingForLibsqlVector } from './semantic-vector-store.models';

describe('semantic vector store models', () => {
  test('generates Papra-style semantic chunk ids', () => {
    expect(generateSemanticChunkId().startsWith(`${SEMANTIC_CHUNK_ID_PREFIX}_`)).to.eq(true);
  });

  test('hashes raw document content with SHA-256', () => {
    expect(createSemanticDocumentContentHash({ content: 'alpha document content' })).to.eq('4e64226a25a9236d24eb704b8683b19471ccb8f9625dc9cd6e743f000dad90e1');
  });

  test('serializes embeddings for LibSQL vector32 input', () => {
    expect(serializeEmbeddingForLibsqlVector({ embedding: [1, 0.25, -3] })).to.eq('[1,0.25,-3]');
  });

  test('converts cosine distance to a clamped public score', () => {
    expect(semanticVectorDistanceToScore({ distance: -0.25 })).to.eq(1);
    expect(semanticVectorDistanceToScore({ distance: 0 })).to.eq(1);
    expect(semanticVectorDistanceToScore({ distance: 0.25 })).to.eq(0.75);
    expect(semanticVectorDistanceToScore({ distance: 1 })).to.eq(0);
    expect(semanticVectorDistanceToScore({ distance: 2 })).to.eq(0);
  });
});
