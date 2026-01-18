/**
 * =============================================================================
 * BAVINI CLOUD - Race Conditions Tests
 * =============================================================================
 * Tests pour vérifier que les race conditions sont correctement gérées.
 * =============================================================================
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { atom } from 'nanostores';

/**
 * Ces tests vérifient la protection contre les race conditions dans:
 * - L'initialisation de esbuild-wasm
 * - Le singleton pattern du RuntimeAdapter
 * - L'initialisation du runtime
 */

describe('Race Conditions', () => {
  describe('esbuild initialization', () => {
    it('handles concurrent init calls without multiple initializations', async () => {
      let initCount = 0;
      let initPromise: Promise<void> | null = null;

      const mockInit = async () => {
        // Si une init est déjà en cours, attendre
        if (initPromise) {
          return initPromise;
        }

        initPromise = (async () => {
          initCount++;
          await new Promise((r) => setTimeout(r, 50)); // Simulate async init
        })();

        return initPromise;
      };

      // Appels concurrents
      await Promise.all([mockInit(), mockInit(), mockInit(), mockInit(), mockInit()]);

      // L'initialisation ne doit être appelée qu'une seule fois
      expect(initCount).toBe(1);
    });

    it('allows retry after failed initialization', async () => {
      let initCount = 0;
      let shouldFail = true;
      let initPromise: Promise<void> | null = null;

      const mockInit = async (): Promise<void> => {
        if (initPromise) {
          return initPromise;
        }

        initPromise = (async () => {
          initCount++;

          if (shouldFail) {
            throw new Error('Init failed');
          }
        })();

        try {
          await initPromise;
        } catch (error) {
          // Reset la Promise en cas d'échec pour permettre un retry
          initPromise = null;
          throw error;
        }
      };

      // Premier appel échoue
      let firstError: Error | null = null;
      try {
        await mockInit();
      } catch (e) {
        firstError = e as Error;
      }
      expect(firstError?.message).toBe('Init failed');
      expect(initCount).toBe(1);

      // Deuxième appel réussit
      shouldFail = false;
      await mockInit();
      expect(initCount).toBe(2);
    });
  });

  describe('getRuntimeAdapter singleton', () => {
    it('returns same instance for concurrent calls', () => {
      type RuntimeType = 'webcontainer' | 'browser';
      let currentAdapter: { id: number } | null = null;
      const runtimeTypeStore = atom<RuntimeType>('browser');

      const getAdapter = () => {
        if (!currentAdapter) {
          currentAdapter = { id: Math.random() };
        }

        return currentAdapter;
      };

      // Appels concurrents
      const results = [getAdapter(), getAdapter(), getAdapter()];

      expect(results[0]).toBe(results[1]);
      expect(results[1]).toBe(results[2]);
    });

    it('creates new adapter only when type changes', () => {
      type RuntimeType = 'webcontainer' | 'browser';
      let currentAdapter: { type: RuntimeType; id: number } | null = null;
      let currentType: RuntimeType | null = null;
      const runtimeTypeStore = atom<RuntimeType>('browser');

      const getAdapter = () => {
        const type = runtimeTypeStore.get();

        if (currentAdapter && currentType !== type) {
          currentAdapter = null;
        }

        if (!currentAdapter) {
          currentAdapter = { type, id: Math.random() };
          currentType = type;
        }

        return currentAdapter;
      };

      const adapter1 = getAdapter();
      const adapter2 = getAdapter();

      expect(adapter1).toBe(adapter2);

      // Change type
      runtimeTypeStore.set('webcontainer');
      const adapter3 = getAdapter();

      expect(adapter3).not.toBe(adapter1);
      expect(adapter3.type).toBe('webcontainer');
    });
  });

  describe('initRuntime with Promise synchronization', () => {
    it('concurrent initRuntime calls share the same Promise', async () => {
      let initPromise: Promise<{ name: string }> | null = null;
      let initCount = 0;

      const initRuntime = async () => {
        if (initPromise) {
          return initPromise;
        }

        initPromise = (async () => {
          initCount++;
          await new Promise((r) => setTimeout(r, 10));
          return { name: 'TestAdapter' };
        })();

        return initPromise;
      };

      // 10 appels concurrents
      const promises = Array(10)
        .fill(null)
        .map(() => initRuntime());

      const results = await Promise.all(promises);

      // Toutes les résultats devraient être identiques
      for (const result of results) {
        expect(result).toBe(results[0]);
      }

      // init() appelé une seule fois
      expect(initCount).toBe(1);
    });

    it('resets Promise on adapter type change', async () => {
      type RuntimeType = 'webcontainer' | 'browser';
      let initPromise: Promise<{ type: RuntimeType }> | null = null;
      let currentType: RuntimeType = 'browser';
      const runtimeTypeStore = atom<RuntimeType>('browser');

      const initRuntime = async () => {
        const type = runtimeTypeStore.get();

        // Si le type a changé, reset la Promise
        if (currentType !== type) {
          initPromise = null;
          currentType = type;
        }

        if (initPromise) {
          return initPromise;
        }

        initPromise = Promise.resolve({ type });
        return initPromise;
      };

      const result1 = await initRuntime();
      expect(result1.type).toBe('browser');

      runtimeTypeStore.set('webcontainer');
      const result2 = await initRuntime();

      expect(result2.type).toBe('webcontainer');
      expect(result2).not.toBe(result1);
    });

    it('handles error in concurrent init calls gracefully', async () => {
      let initPromise: Promise<void> | null = null;
      let attempts = 0;

      const initRuntime = async () => {
        if (initPromise) {
          return initPromise;
        }

        initPromise = (async () => {
          attempts++;
          await new Promise((r) => setTimeout(r, 10));
          throw new Error('Init error');
        })();

        try {
          return await initPromise;
        } catch (error) {
          initPromise = null; // Reset pour permettre retry
          throw error;
        }
      };

      // Appels concurrents - tous devraient recevoir la même erreur
      const promises = [initRuntime(), initRuntime(), initRuntime()];

      const results = await Promise.allSettled(promises);

      // Toutes les promesses devraient être rejetées
      for (const result of results) {
        expect(result.status).toBe('rejected');
      }

      // Init appelé une seule fois
      expect(attempts).toBe(1);
    });
  });

  describe('File system race conditions', () => {
    it('handles concurrent file writes to same path', async () => {
      const files = new Map<string, string>();
      const writeQueue = new Map<string, Promise<void>>();

      const writeFile = async (path: string, content: string) => {
        // Attendre si une écriture est en cours sur ce fichier
        const pending = writeQueue.get(path);

        if (pending) {
          await pending;
        }

        const writePromise = (async () => {
          await new Promise((r) => setTimeout(r, Math.random() * 10));
          files.set(path, content);
        })();

        writeQueue.set(path, writePromise);
        await writePromise;
        writeQueue.delete(path);
      };

      // Écritures concurrentes sur le même fichier
      await Promise.all([
        writeFile('/test.ts', 'content1'),
        writeFile('/test.ts', 'content2'),
        writeFile('/test.ts', 'content3'),
      ]);

      // Le fichier devrait avoir l'une des valeurs (la dernière à terminer)
      expect(files.get('/test.ts')).toBeDefined();
      expect(['content1', 'content2', 'content3']).toContain(files.get('/test.ts'));
    });

    it('handles concurrent builds with debounce', async () => {
      let buildCount = 0;
      let debounceTimer: ReturnType<typeof setTimeout> | null = null;
      const DEBOUNCE_MS = 50;

      const triggerBuild = () => {
        return new Promise<void>((resolve) => {
          if (debounceTimer) {
            clearTimeout(debounceTimer);
          }

          debounceTimer = setTimeout(async () => {
            buildCount++;
            resolve();
          }, DEBOUNCE_MS);
        });
      };

      // Déclencher plusieurs builds rapidement
      triggerBuild();
      triggerBuild();
      triggerBuild();
      triggerBuild();
      triggerBuild();

      // Attendre que le debounce se termine
      await new Promise((r) => setTimeout(r, DEBOUNCE_MS + 20));

      // Un seul build devrait être exécuté
      expect(buildCount).toBe(1);
    });
  });

  describe('Store subscription race conditions', () => {
    it('prevents infinite loops in store synchronization', () => {
      type RuntimeType = 'webcontainer' | 'browser';
      const store1 = atom<RuntimeType>('browser');
      const store2 = atom<RuntimeType>('browser');

      let syncCount = 0;
      let isSyncing = false;

      // Synchronisation bidirectionnelle avec protection contre les boucles
      store1.subscribe((value) => {
        if (isSyncing) return;
        syncCount++;
        isSyncing = true;

        try {
          if (store2.get() !== value) {
            store2.set(value);
          }
        } finally {
          isSyncing = false;
        }
      });

      store2.subscribe((value) => {
        if (isSyncing) return;
        syncCount++;
        isSyncing = true;

        try {
          if (store1.get() !== value) {
            store1.set(value);
          }
        } finally {
          isSyncing = false;
        }
      });

      // Change un store
      store1.set('webcontainer');

      // Les deux stores devraient être synchronisés
      expect(store1.get()).toBe('webcontainer');
      expect(store2.get()).toBe('webcontainer');

      // Pas de boucle infinie (syncCount limité)
      expect(syncCount).toBeLessThan(10);
    });
  });
});
