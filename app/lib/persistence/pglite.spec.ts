import { describe, expect, it, vi, beforeEach } from 'vitest';

// mock PGlite
const mockPGliteInstance = {
  waitReady: Promise.resolve(),
  exec: vi.fn().mockResolvedValue(undefined),
  query: vi.fn().mockResolvedValue({ rows: [{ test: 1 }] }),
  close: vi.fn().mockResolvedValue(undefined),
};

vi.mock('@electric-sql/pglite', () => ({
  PGlite: vi.fn().mockImplementation(() => mockPGliteInstance),
}));

// mock logger
vi.mock('~/utils/logger', () => ({
  createScopedLogger: vi.fn(() => ({
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

describe('PGlite Wrapper', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  describe('initPGlite', () => {
    it('should initialize PGlite database', async () => {
      const { initPGlite } = await import('./pglite');

      const db = await initPGlite();

      expect(db).toBeDefined();
      expect(mockPGliteInstance.exec).toHaveBeenCalled();
    });

    it('should create schema on init', async () => {
      const { initPGlite } = await import('./pglite');

      await initPGlite();

      expect(mockPGliteInstance.exec).toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE IF NOT EXISTS chats'));
    });

    it('should record schema version', async () => {
      const { initPGlite } = await import('./pglite');

      await initPGlite();

      expect(mockPGliteInstance.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO schema_version'),
        expect.any(Array),
      );
    });

    it('should return same instance on subsequent calls', async () => {
      const { initPGlite } = await import('./pglite');

      const db1 = await initPGlite();
      const db2 = await initPGlite();

      expect(db1).toBe(db2);
    });

    it('should throw when PGlite initialization fails', async () => {
      vi.resetModules();

      const pgliteModule = await import('@electric-sql/pglite');
      (pgliteModule.PGlite as any).mockImplementationOnce(() => {
        throw new Error('WASM load failed');
      });

      const { initPGlite } = await import('./pglite');

      await expect(initPGlite()).rejects.toThrow('WASM load failed');
    });
  });

  describe('getPGlite', () => {
    it('should return PGlite instance', async () => {
      const { getPGlite, initPGlite } = await import('./pglite');

      await initPGlite();

      const db = await getPGlite();

      expect(db).toBeDefined();
    });

    it('should initialize if not already done', async () => {
      vi.resetModules();

      const { getPGlite } = await import('./pglite');

      const db = await getPGlite();

      expect(db).toBeDefined();
    });
  });

  describe('closePGlite', () => {
    it('should close the connection', async () => {
      const { initPGlite, closePGlite } = await import('./pglite');

      await initPGlite();
      await closePGlite();

      expect(mockPGliteInstance.close).toHaveBeenCalled();
    });

    it('should handle close when not initialized', async () => {
      vi.resetModules();

      const { closePGlite } = await import('./pglite');

      // should not throw
      await expect(closePGlite()).resolves.not.toThrow();
    });
  });

  describe('isPGliteAvailable', () => {
    it('should return true when PGlite works', async () => {
      const { isPGliteAvailable } = await import('./pglite');

      const available = await isPGliteAvailable();

      expect(available).toBe(true);
    });

    it('should return false when query fails', async () => {
      vi.resetModules();
      mockPGliteInstance.query.mockRejectedValueOnce(new Error('Query failed'));

      const { isPGliteAvailable } = await import('./pglite');

      const available = await isPGliteAvailable();

      expect(available).toBe(false);
    });
  });

  describe('query', () => {
    it('should execute SQL and return rows', async () => {
      const { query, initPGlite } = await import('./pglite');

      await initPGlite();
      mockPGliteInstance.query.mockResolvedValueOnce({ rows: [{ id: '1', name: 'test' }] });

      const results = await query<{ id: string; name: string }>('SELECT * FROM test');

      expect(results).toEqual([{ id: '1', name: 'test' }]);
    });

    it('should pass parameters to query', async () => {
      const { query, initPGlite } = await import('./pglite');

      await initPGlite();
      mockPGliteInstance.query.mockResolvedValueOnce({ rows: [] });

      await query('SELECT * FROM test WHERE id = $1', ['123']);

      expect(mockPGliteInstance.query).toHaveBeenCalledWith('SELECT * FROM test WHERE id = $1', ['123']);
    });
  });

  describe('queryOne', () => {
    it('should return single result', async () => {
      const { queryOne, initPGlite } = await import('./pglite');

      await initPGlite();
      mockPGliteInstance.query.mockResolvedValueOnce({ rows: [{ id: '1' }] });

      const result = await queryOne<{ id: string }>('SELECT * FROM test WHERE id = $1', ['1']);

      expect(result).toEqual({ id: '1' });
    });

    it('should return null when no results', async () => {
      const { queryOne, initPGlite } = await import('./pglite');

      await initPGlite();
      mockPGliteInstance.query.mockResolvedValueOnce({ rows: [] });

      const result = await queryOne<{ id: string }>('SELECT * FROM test WHERE id = $1', ['999']);

      expect(result).toBeNull();
    });
  });

  describe('execute', () => {
    it('should execute statement and return affected rows', async () => {
      const { execute, initPGlite } = await import('./pglite');

      await initPGlite();
      mockPGliteInstance.query.mockResolvedValueOnce({ affectedRows: 1 });

      const affected = await execute('DELETE FROM test WHERE id = $1', ['1']);

      expect(affected).toBe(1);
    });

    it('should return 0 when no rows affected', async () => {
      const { execute, initPGlite } = await import('./pglite');

      await initPGlite();
      mockPGliteInstance.query.mockResolvedValueOnce({});

      const affected = await execute('DELETE FROM test WHERE id = $1', ['999']);

      expect(affected).toBe(0);
    });
  });
});
