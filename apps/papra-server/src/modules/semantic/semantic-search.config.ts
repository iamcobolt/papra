import type { ConfigDefinition } from 'figue';
import * as v from 'valibot';
import { booleanishSchema, urlSchema } from '../config/config.schemas';
import { coercedPositiveIntegerSchema } from '../shared/schemas/number.schemas';

const OPENAI_SEMANTIC_SEARCH_PROVIDER_NAME = 'openai';
const semanticSearchProviderNames = [OPENAI_SEMANTIC_SEARCH_PROVIDER_NAME] as const;

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
    default: 'text-embedding-3-small',
    env: 'SEMANTIC_SEARCH_MODEL',
  },
  dimensions: {
    doc: 'The embedding vector dimensions for semantic search',
    schema: coercedPositiveIntegerSchema,
    default: 1536,
    env: 'SEMANTIC_SEARCH_DIMENSIONS',
  },
  database: {
    url: {
      doc: 'The LibSQL/Turso database URL for semantic search vectors',
      schema: urlSchema,
      default: 'file:./app-data/db/semantic-vectors.sqlite',
      env: 'SEMANTIC_SEARCH_DATABASE_URL',
    },
    authToken: {
      doc: 'The auth token for the semantic search LibSQL/Turso database',
      schema: v.optional(v.string()),
      default: undefined,
      env: 'SEMANTIC_SEARCH_DATABASE_AUTH_TOKEN',
    },
  },
  chunkSize: {
    doc: 'The maximum text chunk size for semantic search indexing',
    schema: coercedPositiveIntegerSchema,
    default: 4000,
  },
  chunkOverlap: {
    doc: 'The text chunk overlap for semantic search indexing',
    schema: coercedPositiveIntegerSchema,
    default: 400,
  },
} as const satisfies ConfigDefinition;
