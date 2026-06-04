import { sql } from 'drizzle-orm';
import { describe, expect, test } from 'vitest';
import { setupDatabase } from '../../modules/app/database/database';
import { SEMANTIC_VECTOR_CHUNK_OVERLAP, SEMANTIC_VECTOR_CHUNK_SIZE, SEMANTIC_VECTOR_DIMENSIONS, SEMANTIC_VECTOR_META_ID, SEMANTIC_VECTOR_METRIC, SEMANTIC_VECTOR_MODEL, SEMANTIC_VECTOR_SCHEMA_VERSION } from '../../modules/semantic/semantic-vector-store.constants';
import { initialSchemaSetupMigration } from './0001-initial-schema-setup.migration';
import { semanticVectorStoreMigration } from './0021-semantic-vector-store.migration';

describe('0021-semantic-vector-store migration', () => {
  test('adds semantic chunk storage, document indexing columns, and the default vector manifest', async () => {
    const { db } = setupDatabase({ url: ':memory:' });

    await initialSchemaSetupMigration.up({ db });
    await semanticVectorStoreMigration.up({ db });

    const { rows: documentColumns } = await db.run(sql`PRAGMA table_info(documents)`);
    expect(documentColumns.map(row => row.name)).to.include.members(['semantic_indexed_at', 'semantic_index_content_hash']);

    const { rows: manifestRows } = await db.run(sql`SELECT * FROM semantic_vector_meta`);
    expect(manifestRows).to.have.length(1);
    expect(manifestRows[0]).to.include({
      id: SEMANTIC_VECTOR_META_ID,
      schema_version: SEMANTIC_VECTOR_SCHEMA_VERSION,
      model: SEMANTIC_VECTOR_MODEL,
      dimensions: SEMANTIC_VECTOR_DIMENSIONS,
      metric: SEMANTIC_VECTOR_METRIC,
      chunk_size: SEMANTIC_VECTOR_CHUNK_SIZE,
      chunk_overlap: SEMANTIC_VECTOR_CHUNK_OVERLAP,
    });

    const queryEmbedding = JSON.stringify(Array.from({ length: SEMANTIC_VECTOR_DIMENSIONS }, (_, index) => index === 0 ? 1 : 0));

    await db.batch([
      db.run(sql`INSERT INTO organizations(id, name, created_at, updated_at) VALUES ('org_1', 'Org', 0, 0)`),
      db.run(sql`INSERT INTO documents(id, organization_id, original_name, name, mime_type, original_storage_key, original_sha256_hash, content, created_at, updated_at)
        VALUES ('doc_1', 'org_1', 'Document', 'Document', 'text/plain', 'storage-key', 'sha', 'content', 0, 0)`),
      db.run(sql`INSERT INTO document_semantic_chunks(id, created_at, updated_at, organization_id, document_id, chunk_index, content_hash, embedding)
        VALUES ('smc_1', 0, 0, 'org_1', 'doc_1', 0, 'content-hash', vector32(${queryEmbedding}))`),
    ]);

    const { rows: vectorRows } = await db.run(sql`SELECT vector_distance_cos(embedding, vector32(${queryEmbedding})) as distance FROM document_semantic_chunks`);
    expect(vectorRows).to.eql([{ distance: 0 }]);
  });
});
