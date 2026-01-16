import { describe, expect, it, vi, beforeEach } from 'vitest';

// mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
})();

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

// mock indexedDB
const mockIndexedDB = {
  open: vi.fn(),
};

Object.defineProperty(globalThis, 'indexedDB', {
  value: mockIndexedDB,
  writable: true,
});

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

describe('Migration', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    localStorageMock.clear();
  });

  describe('isMigrationComplete', () => {
    it('should return false when not migrated', async () => {
      const { isMigrationComplete } = await import('./migration');

      expect(isMigrationComplete()).toBe(false);
    });

    it('should return true when migrated', async () => {
      localStorageMock.setItem('bavini_pglite_migrated', 'true');

      const { isMigrationComplete } = await import('./migration');

      expect(isMigrationComplete()).toBe(true);
    });
  });

  describe('markMigrationComplete', () => {
    it('should set migration flag in localStorage', async () => {
      const { markMigrationComplete } = await import('./migration');

      markMigrationComplete();

      expect(localStorageMock.setItem).toHaveBeenCalledWith('bavini_pglite_migrated', 'true');
    });
  });

  describe('migrateFromIndexedDB', () => {
    it('should skip if already migrated', async () => {
      localStorageMock.setItem('bavini_pglite_migrated', 'true');

      const { migrateFromIndexedDB } = await import('./migration');

      const mockPGlite = {
        query: vi.fn(),
      };

      const stats = await migrateFromIndexedDB(mockPGlite as any);

      expect(stats.migrated).toBe(0);
      expect(stats.errors).toBe(0);
      expect(mockPGlite.query).not.toHaveBeenCalled();
    });

    it('should handle no legacy database', async () => {
      const { migrateFromIndexedDB } = await import('./migration');

      // mock indexedDB.open to fail
      mockIndexedDB.open.mockImplementation(() => {
        const request = {
          onerror: null as any,
          onsuccess: null as any,
          onupgradeneeded: null as any,
        };

        setTimeout(() => {
          if (request.onerror) {
            request.onerror({ target: { error: new Error('No database') } });
          }
        }, 0);

        return request;
      });

      const mockPGlite = {
        query: vi.fn(),
      };

      const stats = await migrateFromIndexedDB(mockPGlite as any);

      expect(stats.migrated).toBe(0);
    });

    it('should migrate chats from legacy database', async () => {
      const { migrateFromIndexedDB } = await import('./migration');

      const mockChats = [
        {
          id: '1',
          urlId: 'chat-1',
          description: 'Test chat',
          messages: [{ role: 'user', content: 'Hello' }],
          timestamp: '2024-01-01T00:00:00Z',
        },
      ];

      // mock IndexedDB
      const mockStore = {
        getAll: vi.fn().mockReturnValue({
          onsuccess: null as any,
          onerror: null as any,
          result: mockChats,
        }),
      };

      const mockTransaction = {
        objectStore: vi.fn().mockReturnValue(mockStore),
      };

      const mockDb = {
        objectStoreNames: { contains: vi.fn().mockReturnValue(true) },
        transaction: vi.fn().mockReturnValue(mockTransaction),
        close: vi.fn(),
      };

      mockIndexedDB.open.mockImplementation(() => {
        const request = {
          onerror: null as any,
          onsuccess: null as any,
          onupgradeneeded: null as any,
          result: mockDb,
        };

        setTimeout(() => {
          if (request.onsuccess) {
            request.onsuccess({ target: request });
          }
        }, 0);

        return request;
      });

      // setup getAll to trigger onsuccess
      mockStore.getAll.mockImplementation(() => {
        const req = {
          onsuccess: null as any,
          onerror: null as any,
          result: mockChats,
        };

        setTimeout(() => {
          if (req.onsuccess) {
            req.onsuccess();
          }
        }, 0);

        return req;
      });

      const mockPGlite = {
        query: vi.fn().mockResolvedValue({ rows: [] }),
      };

      const stats = await migrateFromIndexedDB(mockPGlite as any);

      expect(stats.migrated).toBe(1);
      expect(mockPGlite.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO chats'),
        expect.arrayContaining(['1', 'chat-1', 'Test chat']),
      );
    });

    it('should mark migration complete when successful', async () => {
      const { migrateFromIndexedDB, isMigrationComplete } = await import('./migration');

      // mock no legacy database
      mockIndexedDB.open.mockImplementation(() => {
        const request = {
          onerror: null as any,
          onsuccess: null as any,
          onupgradeneeded: null as any,
        };

        setTimeout(() => {
          if (request.onerror) {
            request.onerror({ target: { error: new Error('No database') } });
          }
        }, 0);

        return request;
      });

      const mockPGlite = { query: vi.fn() };

      await migrateFromIndexedDB(mockPGlite as any);

      expect(isMigrationComplete()).toBe(true);
    });
  });

  describe('hasLegacyData', () => {
    it('should return false if already migrated', async () => {
      localStorageMock.setItem('bavini_pglite_migrated', 'true');

      const { hasLegacyData } = await import('./migration');

      const result = await hasLegacyData();

      expect(result).toBe(false);
    });

    it('should return false if no legacy database', async () => {
      const { hasLegacyData } = await import('./migration');

      mockIndexedDB.open.mockImplementation(() => {
        const request = {
          onerror: null as any,
          onsuccess: null as any,
          onupgradeneeded: null as any,
        };

        setTimeout(() => {
          if (request.onerror) {
            request.onerror({ target: { error: new Error('No database') } });
          }
        }, 0);

        return request;
      });

      const result = await hasLegacyData();

      expect(result).toBe(false);
    });

    it('should return true when legacy data exists', async () => {
      const { hasLegacyData } = await import('./migration');

      const mockChats = [{ id: '1', messages: [] }];

      const mockStore = {
        getAll: vi.fn(),
      };

      const mockDb = {
        objectStoreNames: { contains: vi.fn().mockReturnValue(true) },
        transaction: vi.fn().mockReturnValue({ objectStore: vi.fn().mockReturnValue(mockStore) }),
        close: vi.fn(),
      };

      mockIndexedDB.open.mockImplementation(() => {
        const request = {
          onerror: null as any,
          onsuccess: null as any,
          onupgradeneeded: null as any,
          result: mockDb,
        };

        setTimeout(() => {
          if (request.onsuccess) {
            request.onsuccess({ target: request });
          }
        }, 0);

        return request;
      });

      mockStore.getAll.mockImplementation(() => {
        const req = { onsuccess: null as any, onerror: null as any, result: mockChats };

        setTimeout(() => {
          if (req.onsuccess) {
            req.onsuccess();
          }
        }, 0);

        return req;
      });

      const result = await hasLegacyData();

      expect(result).toBe(true);
    });
  });

  describe('migration error handling', () => {
    it('should not mark complete when migration has errors', async () => {
      const { migrateFromIndexedDB, isMigrationComplete } = await import('./migration');

      const mockChats = [{ id: '1', messages: [] }];

      const mockStore = { getAll: vi.fn() };
      const mockDb = {
        objectStoreNames: { contains: vi.fn().mockReturnValue(true) },
        transaction: vi.fn().mockReturnValue({ objectStore: vi.fn().mockReturnValue(mockStore) }),
        close: vi.fn(),
      };

      mockIndexedDB.open.mockImplementation(() => {
        const request = { onerror: null as any, onsuccess: null as any, onupgradeneeded: null as any, result: mockDb };

        setTimeout(() => {
          if (request.onsuccess) {
            request.onsuccess({ target: request });
          }
        }, 0);

        return request;
      });

      mockStore.getAll.mockImplementation(() => {
        const req = { onsuccess: null as any, onerror: null as any, result: mockChats };

        setTimeout(() => {
          if (req.onsuccess) {
            req.onsuccess();
          }
        }, 0);

        return req;
      });

      const mockPGlite = {
        query: vi.fn().mockRejectedValue(new Error('Insert failed')),
      };

      const stats = await migrateFromIndexedDB(mockPGlite as any);

      expect(stats.errors).toBe(1);
      expect(stats.migrated).toBe(0);
      expect(isMigrationComplete()).toBe(false);
    });
  });
});
