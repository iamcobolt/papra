import type { Logger } from '@crowlog/logger';
import type { BatchItem } from 'drizzle-orm/batch';
import type { Database } from '../app/database/database.types';
import type { Config } from '../config/config.types';
import type { SemanticVectorManifest, SemanticVectorStore, SemanticVectorStoreAvailability } from './semantic-vector-store.types';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { documentsTable } from '../documents/documents.table';
import { createLogger } from '../shared/logger/logger';
import { SEMANTIC_VECTOR_META_ID, SEMANTIC_VECTOR_METRIC, SEMANTIC_VECTOR_SCHEMA_VERSION } from './semantic-vector-store.constants';
import { createSemanticDocumentContentHash, generateSemanticChunkId, semanticVectorDistanceToScore, serializeEmbeddingForLibsqlVector } from './semantic-vector-store.models';
import { documentSemanticChunksTable, semanticVectorMetaTable } from './semantic.tables';

const logger = createLogger({ namespace: 'semantic-vector-store' });

export async function createSemanticVectorStore({ config, db, storeLogger = logger }: { config: Config; db: Database; storeLogger?: Logger }): Promise<SemanticVectorStore> {
  const availability = await getSemanticVectorStoreAvailability({ config, db });

  if (!availability.isAvailable) {
    if (config.semanticSearch.isEnabled) {
      storeLogger.warn({ reason: availability.reason, details: availability.details }, 'Semantic vector store disabled');
    }

    return createDisabledSemanticVectorStore({ reason: availability.reason });
  }

  let isEnabled = true;
  let disabledReason: string | undefined;

  const disable = ({ reason, details }: { reason: string; details?: Record<string, unknown> }) => {
    isEnabled = false;
    disabledReason = reason;
    storeLogger.warn({ reason, details }, 'Semantic vector store disabled');
  };

  const ensureManifestStillMatches = async () => {
    if (!isEnabled) {
      return false;
    }

    const manifestAvailability = await getSemanticVectorManifestAvailability({ config, db });

    if (!manifestAvailability.isAvailable) {
      disable({ reason: manifestAvailability.reason, details: manifestAvailability.details });
      return false;
    }

    return true;
  };

  return {
    get isEnabled() {
      return isEnabled;
    },
    get disabledReason() {
      return disabledReason;
    },

    async upsertChunks({ organizationId, documentId, documentContent, chunks, now = new Date() }) {
      if (!await ensureManifestStillMatches()) {
        return;
      }

      for (const chunk of chunks) {
        assertEmbeddingDimensions({ embedding: chunk.embedding, dimensions: config.semanticSearch.dimensions });
      }

      const contentHash = createSemanticDocumentContentHash({ content: documentContent });

      const statements = [
        db
          .delete(documentSemanticChunksTable)
          .where(and(
            eq(documentSemanticChunksTable.organizationId, organizationId),
            eq(documentSemanticChunksTable.documentId, documentId),
          )),
        ...chunks.map(chunk => db.run(sql`
          INSERT INTO document_semantic_chunks (
            id,
            created_at,
            updated_at,
            organization_id,
            document_id,
            chunk_index,
            content_hash,
            embedding
          ) VALUES (
            ${generateSemanticChunkId()},
            ${now.getTime()},
            ${now.getTime()},
            ${organizationId},
            ${documentId},
            ${chunk.chunkIndex},
            ${contentHash},
            vector32(${serializeEmbeddingForLibsqlVector({ embedding: chunk.embedding })})
          )
        `)),
        db
          .update(documentsTable)
          .set({
            semanticIndexedAt: now,
            semanticIndexContentHash: contentHash,
          })
          .where(and(
            eq(documentsTable.id, documentId),
            eq(documentsTable.organizationId, organizationId),
          )),
      ] as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]];

      await db.batch(statements);
    },

    async deleteByDocumentIds({ documentIds, organizationId }) {
      if (documentIds.length === 0 || !await ensureManifestStillMatches()) {
        return;
      }

      const chunksWhere = organizationId === undefined
        ? inArray(documentSemanticChunksTable.documentId, documentIds)
        : and(
            inArray(documentSemanticChunksTable.documentId, documentIds),
            eq(documentSemanticChunksTable.organizationId, organizationId),
          );

      const documentsWhere = organizationId === undefined
        ? inArray(documentsTable.id, documentIds)
        : and(
            inArray(documentsTable.id, documentIds),
            eq(documentsTable.organizationId, organizationId),
          );

      await db.batch([
        db.delete(documentSemanticChunksTable).where(chunksWhere),
        db
          .update(documentsTable)
          .set({
            semanticIndexedAt: null,
            semanticIndexContentHash: null,
          })
          .where(documentsWhere),
      ]);
    },

    async knnSearch({ organizationId, embedding, limit }) {
      if (limit <= 0 || !await ensureManifestStillMatches()) {
        return { hits: [] };
      }

      assertEmbeddingDimensions({ embedding, dimensions: config.semanticSearch.dimensions });

      const { rows } = await db.run(sql`
        SELECT
          rowid as row_id,
          id,
          document_id,
          chunk_index,
          content_hash,
          vector_distance_cos(embedding, vector32(${serializeEmbeddingForLibsqlVector({ embedding })})) as distance
        FROM document_semantic_chunks
        WHERE organization_id = ${organizationId}
        ORDER BY distance ASC
        LIMIT ${limit}
      `);

      return {
        hits: rows.map((row) => {
          const distance = Number(row.distance);

          return {
            id: String(row.id),
            rowId: Number(row.row_id),
            documentId: String(row.document_id),
            chunkIndex: Number(row.chunk_index),
            contentHash: String(row.content_hash),
            distance,
            score: semanticVectorDistanceToScore({ distance }),
          };
        }),
      };
    },
  };
}

export async function isSemanticSearchAvailable({ config, db }: { config: Config; db: Database }) {
  const availability = await getSemanticVectorStoreAvailability({ config, db });

  return availability.isAvailable;
}

export async function getSemanticVectorStoreAvailability({ config, db }: { config: Config; db: Database }): Promise<SemanticVectorStoreAvailability> {
  if (!config.semanticSearch.isEnabled) {
    return { isAvailable: false, reason: 'semantic_search_disabled' };
  }

  const vectorCapability = await getSemanticVectorCapability({ db });

  if (!vectorCapability.isAvailable) {
    return vectorCapability;
  }

  return getSemanticVectorManifestAvailability({ config, db });
}

export async function getSemanticVectorManifest({ db }: { db: Database }) {
  const [manifest] = await db
    .select()
    .from(semanticVectorMetaTable)
    .where(eq(semanticVectorMetaTable.id, SEMANTIC_VECTOR_META_ID));

  return { manifest };
}

export function getExpectedSemanticVectorManifest({ config, now = new Date() }: { config: Config; now?: Date }): SemanticVectorManifest {
  return {
    schemaVersion: SEMANTIC_VECTOR_SCHEMA_VERSION,
    model: config.semanticSearch.model,
    dimensions: config.semanticSearch.dimensions,
    metric: SEMANTIC_VECTOR_METRIC,
    chunkSize: config.semanticSearch.chunkSize,
    chunkOverlap: config.semanticSearch.chunkOverlap,
    createdAt: now,
    updatedAt: now,
  };
}

export function getSemanticVectorManifestMismatchDetails({ actual, expected }: { actual: SemanticVectorManifest | undefined; expected: SemanticVectorManifest }) {
  if (actual === undefined) {
    return { missing: true };
  }

  const mismatches = Object.fromEntries(
    (['schemaVersion', 'model', 'dimensions', 'metric', 'chunkSize', 'chunkOverlap'] as const)
      .flatMap((key) => {
        if (actual[key] === expected[key]) {
          return [];
        }

        return [[key, { expected: expected[key], actual: actual[key] }]];
      }),
  );

  return Object.keys(mismatches).length > 0 ? mismatches : undefined;
}

async function getSemanticVectorManifestAvailability({ config, db }: { config: Config; db: Database }): Promise<SemanticVectorStoreAvailability> {
  const { manifest } = await getSemanticVectorManifest({ db });
  const expected = getExpectedSemanticVectorManifest({ config });
  const details = getSemanticVectorManifestMismatchDetails({ actual: manifest, expected });

  if (details !== undefined) {
    return {
      isAvailable: false,
      reason: 'semantic_vector_manifest_mismatch',
      details,
    };
  }

  return { isAvailable: true };
}

async function getSemanticVectorCapability({ db }: { db: Database }): Promise<SemanticVectorStoreAvailability> {
  try {
    await db.run(sql`DROP TABLE IF EXISTS __semantic_vector_capability_check`);
    await db.run(sql`CREATE TEMP TABLE __semantic_vector_capability_check (embedding F32_BLOB(1))`);
    await db.run(sql`INSERT INTO __semantic_vector_capability_check (embedding) VALUES (vector32('[1]'))`);
    await db.run(sql`SELECT vector_distance_cos(embedding, vector32('[1]')) as distance FROM __semantic_vector_capability_check`);

    return { isAvailable: true };
  } catch (error) {
    return {
      isAvailable: false,
      reason: 'semantic_vector_capability_unavailable',
      details: { error: error instanceof Error ? error.message : String(error) },
    };
  } finally {
    await db.run(sql`DROP TABLE IF EXISTS __semantic_vector_capability_check`);
  }
}

function createDisabledSemanticVectorStore({ reason }: { reason: string }): SemanticVectorStore {
  return {
    isEnabled: false,
    disabledReason: reason,
    upsertChunks: async () => {},
    deleteByDocumentIds: async () => {},
    knnSearch: async () => ({ hits: [] }),
  };
}

function assertEmbeddingDimensions({ embedding, dimensions }: { embedding: number[]; dimensions: number }) {
  if (embedding.length !== dimensions) {
    throw new Error(`Expected semantic embedding to have ${dimensions} dimensions, got ${embedding.length}`);
  }
}
