import { createNoopLogger } from '@crowlog/logger';
import { eq, sql } from 'drizzle-orm';
import { describe, expect, test } from 'vitest';
import { createInMemoryDatabase } from '../app/database/database.test-utils';
import { overrideConfig } from '../config/config.test-utils';
import { documentsTable } from '../documents/documents.table';
import { createSemanticVectorStore, isSemanticSearchAvailable } from './semantic-vector-store';
import { SEMANTIC_VECTOR_DIMENSIONS, SEMANTIC_VECTOR_META_ID } from './semantic-vector-store.constants';
import { createSemanticDocumentContentHash } from './semantic-vector-store.models';
import { semanticVectorMetaTable } from './semantic.tables';

const testDate = new Date('2026-06-04T00:00:00.000Z');

function createEmbedding(activeIndex: number) {
  return Array.from({ length: SEMANTIC_VECTOR_DIMENSIONS }, (_, index) => index === activeIndex ? 1 : 0);
}

async function createSemanticTestDatabase() {
  return createInMemoryDatabase({
    organizations: [
      { id: 'org_1', name: 'Org 1', createdAt: testDate, updatedAt: testDate },
      { id: 'org_2', name: 'Org 2', createdAt: testDate, updatedAt: testDate },
    ],
    documents: [
      {
        id: 'doc_1',
        organizationId: 'org_1',
        originalName: 'Document 1',
        originalSize: 1,
        originalStorageKey: 'documents/doc_1.txt',
        originalSha256Hash: 'sha_1',
        name: 'Document 1',
        mimeType: 'text/plain',
        content: 'alpha document content',
        createdAt: testDate,
        updatedAt: testDate,
      },
      {
        id: 'doc_2',
        organizationId: 'org_1',
        originalName: 'Document 2',
        originalSize: 1,
        originalStorageKey: 'documents/doc_2.txt',
        originalSha256Hash: 'sha_2',
        name: 'Document 2',
        mimeType: 'text/plain',
        content: 'beta document content',
        createdAt: testDate,
        updatedAt: testDate,
      },
      {
        id: 'doc_3',
        organizationId: 'org_2',
        originalName: 'Document 3',
        originalSize: 1,
        originalStorageKey: 'documents/doc_3.txt',
        originalSha256Hash: 'sha_3',
        name: 'Document 3',
        mimeType: 'text/plain',
        content: 'gamma document content',
        createdAt: testDate,
        updatedAt: testDate,
      },
    ],
  });
}

describe('semantic vector store', () => {
  test('returns a disabled no-op sentinel when semantic search is disabled', async () => {
    const { db } = await createSemanticTestDatabase();
    const config = overrideConfig({ semanticSearch: { isEnabled: false } });

    const store = await createSemanticVectorStore({ config, db, storeLogger: createNoopLogger() });

    expect(store.isEnabled).to.eq(false);
    expect(store.disabledReason).to.eq('semantic_search_disabled');

    await store.upsertChunks({
      organizationId: 'org_1',
      documentId: 'doc_1',
      documentContent: 'alpha document content',
      chunks: [{ chunkIndex: 0, embedding: createEmbedding(0) }],
    });

    const { rows } = await db.run(sql`SELECT * FROM document_semantic_chunks`);
    expect(rows).to.eql([]);
  });

  test('reports semantic search availability when config, vector capability, and manifest match', async () => {
    const { db } = await createSemanticTestDatabase();
    const config = overrideConfig({ semanticSearch: { isEnabled: true } });

    expect(await isSemanticSearchAvailable({ config, db })).to.eq(true);

    const store = await createSemanticVectorStore({ config, db, storeLogger: createNoopLogger() });
    expect(store.isEnabled).to.eq(true);
  });

  test('upserts chunks with vector32, replaces previous chunks, and marks the document after success', async () => {
    const { db } = await createSemanticTestDatabase();
    const config = overrideConfig({ semanticSearch: { isEnabled: true } });
    const store = await createSemanticVectorStore({ config, db, storeLogger: createNoopLogger() });

    await store.upsertChunks({
      organizationId: 'org_1',
      documentId: 'doc_1',
      documentContent: 'alpha document content',
      chunks: [
        { chunkIndex: 0, embedding: createEmbedding(0) },
        { chunkIndex: 1, embedding: createEmbedding(1) },
      ],
      now: testDate,
    });

    await store.upsertChunks({
      organizationId: 'org_1',
      documentId: 'doc_1',
      documentContent: 'updated document content',
      chunks: [{ chunkIndex: 0, embedding: createEmbedding(2) }],
      now: testDate,
    });

    const { rows: chunkRows } = await db.run(sql`
      SELECT document_id, chunk_index, content_hash, vector_distance_cos(embedding, vector32(${JSON.stringify(createEmbedding(2))})) as distance
      FROM document_semantic_chunks
      WHERE document_id = 'doc_1'
    `);

    expect(chunkRows).to.eql([{
      document_id: 'doc_1',
      chunk_index: 0,
      content_hash: createSemanticDocumentContentHash({ content: 'updated document content' }),
      distance: 0,
    }]);

    const [document] = await db.select().from(documentsTable).where(eq(documentsTable.id, 'doc_1'));
    expect(document?.semanticIndexedAt).to.eql(testDate);
    expect(document?.semanticIndexContentHash).to.eq(createSemanticDocumentContentHash({ content: 'updated document content' }));
  });

  test('runs exact organization-scoped cosine search and returns distance-derived scores', async () => {
    const { db } = await createSemanticTestDatabase();
    const config = overrideConfig({ semanticSearch: { isEnabled: true } });
    const store = await createSemanticVectorStore({ config, db, storeLogger: createNoopLogger() });

    await store.upsertChunks({
      organizationId: 'org_1',
      documentId: 'doc_1',
      documentContent: 'alpha document content',
      chunks: [{ chunkIndex: 0, embedding: createEmbedding(0) }],
    });
    await store.upsertChunks({
      organizationId: 'org_1',
      documentId: 'doc_2',
      documentContent: 'beta document content',
      chunks: [{ chunkIndex: 0, embedding: createEmbedding(1) }],
    });
    await store.upsertChunks({
      organizationId: 'org_2',
      documentId: 'doc_3',
      documentContent: 'gamma document content',
      chunks: [{ chunkIndex: 0, embedding: createEmbedding(0) }],
    });

    const { hits } = await store.knnSearch({ organizationId: 'org_1', embedding: createEmbedding(0), limit: 5 });

    expect(hits.map(hit => hit.documentId)).to.eql(['doc_1', 'doc_2']);
    expect(hits.map(hit => hit.distance)).to.eql([0, 1]);
    expect(hits.map(hit => hit.score)).to.eql([1, 0]);
  });

  test('deletes chunks by document ids and clears semantic document markers', async () => {
    const { db } = await createSemanticTestDatabase();
    const config = overrideConfig({ semanticSearch: { isEnabled: true } });
    const store = await createSemanticVectorStore({ config, db, storeLogger: createNoopLogger() });

    await store.upsertChunks({
      organizationId: 'org_1',
      documentId: 'doc_1',
      documentContent: 'alpha document content',
      chunks: [{ chunkIndex: 0, embedding: createEmbedding(0) }],
    });
    await store.upsertChunks({
      organizationId: 'org_1',
      documentId: 'doc_2',
      documentContent: 'beta document content',
      chunks: [{ chunkIndex: 0, embedding: createEmbedding(1) }],
    });

    await store.deleteByDocumentIds({ organizationId: 'org_1', documentIds: ['doc_1'] });

    const { rows: chunkRows } = await db.run(sql`SELECT document_id FROM document_semantic_chunks ORDER BY document_id`);
    expect(chunkRows).to.eql([{ document_id: 'doc_2' }]);

    const [deletedDocument] = await db.select().from(documentsTable).where(eq(documentsTable.id, 'doc_1'));
    expect(deletedDocument?.semanticIndexedAt).to.eq(null);
    expect(deletedDocument?.semanticIndexContentHash).to.eq(null);
  });

  test('fails closed when the manifest changes after store creation', async () => {
    const { db } = await createSemanticTestDatabase();
    const config = overrideConfig({ semanticSearch: { isEnabled: true } });
    const store = await createSemanticVectorStore({ config, db, storeLogger: createNoopLogger() });

    await db
      .update(semanticVectorMetaTable)
      .set({ dimensions: 42 })
      .where(eq(semanticVectorMetaTable.id, SEMANTIC_VECTOR_META_ID));

    const { hits } = await store.knnSearch({ organizationId: 'org_1', embedding: createEmbedding(0), limit: 5 });

    expect(hits).to.eql([]);
    expect(store.isEnabled).to.eq(false);
    expect(store.disabledReason).to.eq('semantic_vector_manifest_mismatch');
  });
});
