import { describe, expect, test } from 'vitest';
import { loadDryConfig, parseConfig } from '../config/config';
import { semanticSearchConfig } from './semantic-search.config';
import { SEMANTIC_VECTOR_CHUNK_OVERLAP, SEMANTIC_VECTOR_CHUNK_SIZE, SEMANTIC_VECTOR_DIMENSIONS, SEMANTIC_VECTOR_METRIC, SEMANTIC_VECTOR_MODEL } from './semantic-vector-store.constants';

describe('semantic search config', () => {
  test('uses existing-DB vector store defaults', () => {
    const { config } = loadDryConfig();

    expect(config.semanticSearch).to.eql({
      isEnabled: false,
      providerName: 'openai',
      openaiApiKey: undefined,
      openaiBaseUrl: undefined,
      model: SEMANTIC_VECTOR_MODEL,
      dimensions: SEMANTIC_VECTOR_DIMENSIONS,
      metric: SEMANTIC_VECTOR_METRIC,
      chunkSize: SEMANTIC_VECTOR_CHUNK_SIZE,
      chunkOverlap: SEMANTIC_VECTOR_CHUNK_OVERLAP,
    });
  });

  test('parses semantic search env overrides without a separate semantic database config', async () => {
    const { config } = await parseConfig({
      env: {
        NODE_ENV: 'test',
        SEMANTIC_SEARCH_ENABLED: 'true',
        SEMANTIC_SEARCH_PROVIDER: 'openai',
        OPENAI_API_KEY: 'test-openai-key',
        SEMANTIC_SEARCH_OPENAI_BASE_URL: 'http://127.0.0.1:11434/v1',
        SEMANTIC_SEARCH_MODEL: 'custom-embedding-model',
        SEMANTIC_SEARCH_DIMENSIONS: '42',
      },
    });

    expect(config.semanticSearch).to.eql({
      isEnabled: true,
      providerName: 'openai',
      openaiApiKey: 'test-openai-key',
      openaiBaseUrl: 'http://127.0.0.1:11434/v1',
      model: 'custom-embedding-model',
      dimensions: 42,
      metric: SEMANTIC_VECTOR_METRIC,
      chunkSize: SEMANTIC_VECTOR_CHUNK_SIZE,
      chunkOverlap: SEMANTIC_VECTOR_CHUNK_OVERLAP,
    });
  });

  test('does not expose a separate semantic database configuration surface', () => {
    const semanticConfigKeys = Object.keys(semanticSearchConfig);

    expect(semanticConfigKeys).not.to.include('database');
    expect(semanticConfigKeys).not.to.include('databaseUrl');
    expect(semanticConfigKeys).not.to.include('databaseAuthToken');
  });
});
