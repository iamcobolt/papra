import type { ConfigDefinition } from 'figue';
import * as v from 'valibot';
import { booleanishSchema } from '../config/config.schemas';
import { coercedPositiveIntegerSchema } from '../shared/schemas/number.schemas';
import { SEMANTIC_VECTOR_CHUNK_OVERLAP, SEMANTIC_VECTOR_CHUNK_SIZE, SEMANTIC_VECTOR_DIMENSIONS, SEMANTIC_VECTOR_METRIC, SEMANTIC_VECTOR_MODEL } from './semantic-vector-store.constants';

const OPENAI_SEMANTIC_SEARCH_PROVIDER_NAME = 'openai';
const semanticSearchProviderNames = [OPENAI_SEMANTIC_SEARCH_PROVIDER_NAME] as const;
const semanticSearchMetricNames = [SEMANTIC_VECTOR_METRIC] as const;

export const semanticSearchConfig = {
  isEnabled: {
    doc: 'Whether semantic search is enabled',
    schema: booleanishSchema,
    default: false,
    env: 'SEMANTIC_SEARCH_ENABLED',
  },
  providerName: {
    doc: `The semantic search embedding provider to use, values can be one of: ${semanticSearchProviderNames.map(x => `\`${x}\``).join(', ')}`,
    schema: v.picklist(semanticSearchProviderNames),
    default: OPENAI_SEMANTIC_SEARCH_PROVIDER_NAME,
    env: 'SEMANTIC_SEARCH_PROVIDER',
  },
  openaiApiKey: {
    doc: 'The OpenAI API key to use for semantic search embeddings',
    schema: v.optional(v.string()),
    default: undefined,
    env: 'OPENAI_API_KEY',
  },
  openaiBaseUrl: {
    doc: 'The OpenAI-compatible base URL to use for semantic search embeddings',
    schema: v.optional(v.string()),
    default: undefined,
    env: 'SEMANTIC_SEARCH_OPENAI_BASE_URL',
  },
  model: {
    doc: 'The embedding model to use for semantic search',
    schema: v.string(),
    default: SEMANTIC_VECTOR_MODEL,
    env: 'SEMANTIC_SEARCH_MODEL',
  },
  dimensions: {
    doc: 'The embedding vector dimensions for semantic search',
    schema: coercedPositiveIntegerSchema,
    default: SEMANTIC_VECTOR_DIMENSIONS,
    env: 'SEMANTIC_SEARCH_DIMENSIONS',
  },
  metric: {
    doc: 'The semantic vector distance metric',
    schema: v.picklist(semanticSearchMetricNames),
    default: SEMANTIC_VECTOR_METRIC,
  },
  chunkSize: {
    doc: 'The maximum text chunk size for semantic search indexing',
    schema: coercedPositiveIntegerSchema,
    default: SEMANTIC_VECTOR_CHUNK_SIZE,
  },
  chunkOverlap: {
    doc: 'The text chunk overlap for semantic search indexing',
    schema: coercedPositiveIntegerSchema,
    default: SEMANTIC_VECTOR_CHUNK_OVERLAP,
  },
} as const satisfies ConfigDefinition;
