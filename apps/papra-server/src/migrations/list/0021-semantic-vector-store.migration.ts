import type { BatchItem } from 'drizzle-orm/batch';
import type { Migration } from '../migrations.types';
import { sql } from 'drizzle-orm';
import { SEMANTIC_VECTOR_CHUNK_OVERLAP, SEMANTIC_VECTOR_CHUNK_SIZE, SEMANTIC_VECTOR_DIMENSIONS, SEMANTIC_VECTOR_META_ID, SEMANTIC_VECTOR_METRIC, SEMANTIC_VECTOR_MODEL, SEMANTIC_VECTOR_SCHEMA_VERSION } from '../../modules/semantic/semantic-vector-store.constants';

export const semanticVectorStoreMigration = {
  name: 'semantic-vector-store',

  up: async ({ db }) => {
    const tableInfo = await db.run(sql`PRAGMA table_info(documents)`);
    const existingColumns = tableInfo.rows.map(row => row.name);
    const hasColumn = (columnName: string) => existingColumns.includes(columnName);
    const now = Date.now();

    const statements = [
      ...(!hasColumn('semantic_indexed_at') ? [sql`ALTER TABLE documents ADD COLUMN semantic_indexed_at INTEGER`] : []),
      ...(!hasColumn('semantic_index_content_hash') ? [sql`ALTER TABLE documents ADD COLUMN semantic_index_content_hash TEXT`] : []),
      sql`
        CREATE TABLE IF NOT EXISTS document_semantic_chunks (
          id text PRIMARY KEY NOT NULL,
          created_at integer NOT NULL,
          updated_at integer NOT NULL,
          organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE ON UPDATE CASCADE,
          document_id text NOT NULL REFERENCES documents(id) ON DELETE CASCADE ON UPDATE CASCADE,
          chunk_index integer NOT NULL,
          content_hash text NOT NULL,
          embedding F32_BLOB(1536) NOT NULL
        )
      `,
      sql`
        CREATE INDEX IF NOT EXISTS document_semantic_chunks_organization_document_index
        ON document_semantic_chunks (organization_id, document_id)
      `,
      sql`
        CREATE INDEX IF NOT EXISTS document_semantic_chunks_document_id_index
        ON document_semantic_chunks (document_id)
      `,
      sql`
        CREATE UNIQUE INDEX IF NOT EXISTS document_semantic_chunks_document_chunk_unique
        ON document_semantic_chunks (document_id, chunk_index)
      `,
      sql`
        CREATE TABLE IF NOT EXISTS semantic_vector_meta (
          id text PRIMARY KEY NOT NULL,
          schema_version integer NOT NULL,
          model text NOT NULL,
          dimensions integer NOT NULL,
          metric text NOT NULL,
          chunk_size integer NOT NULL,
          chunk_overlap integer NOT NULL,
          created_at integer NOT NULL,
          updated_at integer NOT NULL
        )
      `,
      sql`
        INSERT OR IGNORE INTO semantic_vector_meta (
          id,
          schema_version,
          model,
          dimensions,
          metric,
          chunk_size,
          chunk_overlap,
          created_at,
          updated_at
        ) VALUES (
          ${SEMANTIC_VECTOR_META_ID},
          ${SEMANTIC_VECTOR_SCHEMA_VERSION},
          ${SEMANTIC_VECTOR_MODEL},
          ${SEMANTIC_VECTOR_DIMENSIONS},
          ${SEMANTIC_VECTOR_METRIC},
          ${SEMANTIC_VECTOR_CHUNK_SIZE},
          ${SEMANTIC_VECTOR_CHUNK_OVERLAP},
          ${now},
          ${now}
        )
      `,
    ];

    await db.batch(statements.map(statement => db.run(statement) as BatchItem<'sqlite'>) as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]]);
  },

  down: async ({ db }) => {
    await db.batch([
      db.run(sql`DROP TABLE IF EXISTS semantic_vector_meta`),
      db.run(sql`DROP INDEX IF EXISTS document_semantic_chunks_document_chunk_unique`),
      db.run(sql`DROP INDEX IF EXISTS document_semantic_chunks_document_id_index`),
      db.run(sql`DROP INDEX IF EXISTS document_semantic_chunks_organization_document_index`),
      db.run(sql`DROP TABLE IF EXISTS document_semantic_chunks`),
      db.run(sql`ALTER TABLE documents DROP COLUMN semantic_indexed_at`),
      db.run(sql`ALTER TABLE documents DROP COLUMN semantic_index_content_hash`),
    ]);
  },
} satisfies Migration;
