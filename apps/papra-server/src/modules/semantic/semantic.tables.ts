import type { Buffer } from 'node:buffer';
import type { SemanticVectorMetric } from './semantic-vector-store.types';
import { customType, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { documentsTable } from '../documents/documents.table';
import { organizationsTable } from '../organizations/organizations.table';
import { createPrimaryKeyField, createTimestampColumns } from '../shared/db/columns.helpers';
import { SEMANTIC_VECTOR_DIMENSIONS } from './semantic-vector-store.constants';
import { generateSemanticChunkId } from './semantic-vector-store.models';

const f32Blob = customType<{
  data: Buffer;
  driverData: Buffer;
  config: { dimensions: number };
  configRequired: true;
}>({
  dataType: config => `F32_BLOB(${config.dimensions})`,
});

export const documentSemanticChunksTable = sqliteTable('document_semantic_chunks', {
  ...createPrimaryKeyField({ idGenerator: generateSemanticChunkId }),
  ...createTimestampColumns(),

  organizationId: text('organization_id').notNull().references(() => organizationsTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  documentId: text('document_id').notNull().references(() => documentsTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  chunkIndex: integer('chunk_index').notNull(),
  contentHash: text('content_hash').notNull(),
  embedding: f32Blob('embedding', { dimensions: SEMANTIC_VECTOR_DIMENSIONS }).notNull(),
}, table => [
  index('document_semantic_chunks_organization_document_index').on(table.organizationId, table.documentId),
  index('document_semantic_chunks_document_id_index').on(table.documentId),
  uniqueIndex('document_semantic_chunks_document_chunk_unique').on(table.documentId, table.chunkIndex),
]);

export const semanticVectorMetaTable = sqliteTable('semantic_vector_meta', {
  id: text('id').primaryKey(),
  schemaVersion: integer('schema_version').notNull(),
  model: text('model').notNull(),
  dimensions: integer('dimensions').notNull(),
  metric: text('metric').notNull().$type<SemanticVectorMetric>(),
  chunkSize: integer('chunk_size').notNull(),
  chunkOverlap: integer('chunk_overlap').notNull(),
  ...createTimestampColumns(),
});
