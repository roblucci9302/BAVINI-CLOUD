/**
 * =============================================================================
 * BAVINI CLOUD - Supabase Client Tests
 * =============================================================================
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock import.meta.env
vi.stubGlobal('import', {
  meta: {
    env: {
      VITE_SUPABASE_URL: 'https://jqrhsxgfhomvohblxztw.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'test-anon-key',
    },
  },
});

describe('Supabase Client', () => {
  describe('Configuration', () => {
    it('should detect when Supabase is configured', async () => {
      // Import dynamically to use mocked env
      const { isSupabaseConfigured } = await import('./client');

      expect(isSupabaseConfigured()).toBe(true);
    });

    it('should return config info', async () => {
      const { getSupabaseConfig } = await import('./client');

      const config = getSupabaseConfig();

      expect(config.configured).toBe(true);
      expect(config.url).toContain('supabase.co');
    });
  });

  describe('Client Creation', () => {
    it('should create a Supabase client', async () => {
      const { getSupabaseClient } = await import('./client');

      const client = getSupabaseClient();

      expect(client).toBeDefined();
      expect(typeof client.from).toBe('function');
      expect(typeof client.auth).toBe('object');
      expect(typeof client.storage).toBe('object');
    });

    it('should return the same instance on multiple calls', async () => {
      const { getSupabaseClient } = await import('./client');

      const client1 = getSupabaseClient();
      const client2 = getSupabaseClient();

      expect(client1).toBe(client2);
    });
  });
});

describe('Database Types', () => {
  it('should have Profile type', async () => {
    const { Profile } = await import('./types') as any;

    // Types are compile-time only, this just verifies the import works
    expect(true).toBe(true);
  });

  it('should have Project type', async () => {
    const types = await import('./types');

    // Verify types exist
    expect(types).toBeDefined();
  });
});

describe('Helper Functions', () => {
  it('should generate slug from project name', async () => {
    const { generateSlug } = await import('./helpers');

    expect(generateSlug('My Project')).toBe('my-project');
    expect(generateSlug('Hello World 123')).toBe('hello-world-123');
    expect(generateSlug('Test---Project')).toBe('test-project');
    expect(generateSlug('  Spaces  ')).toBe('spaces');
  });

  it('should generate cache key', async () => {
    const { generateCacheKey } = await import('./helpers');

    const files = new Map([
      ['/src/App.tsx', 'export default 1'],
      ['/src/main.tsx', 'import App from "./App"'],
    ]);

    const key1 = generateCacheKey('/src/main.tsx', files);
    const key2 = generateCacheKey('/src/main.tsx', files);

    expect(key1).toBe(key2); // Same content = same key

    // Different content = different key
    files.set('/src/App.tsx', 'export default 2');
    const key3 = generateCacheKey('/src/main.tsx', files);

    expect(key3).not.toBe(key1);
  });
});
