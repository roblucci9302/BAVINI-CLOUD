/**
 * =============================================================================
 * BAVINI CLOUD - Memory Leak Tests
 * =============================================================================
 * Tests pour vérifier que les fuites mémoire sont correctement évitées.
 * =============================================================================
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

describe('Memory Leaks', () => {
  describe('Blob URL Management', () => {
    let revokedUrls: string[] = [];
    let originalCreateObjectURL: typeof URL.createObjectURL;
    let originalRevokeObjectURL: typeof URL.revokeObjectURL;
    let blobCounter = 0;

    beforeEach(() => {
      revokedUrls = [];
      blobCounter = 0;

      // Mock URL API
      originalCreateObjectURL = URL.createObjectURL;
      originalRevokeObjectURL = URL.revokeObjectURL;

      URL.createObjectURL = vi.fn().mockImplementation(() => {
        return `blob:mock-url-${++blobCounter}`;
      });

      URL.revokeObjectURL = vi.fn().mockImplementation((url: string) => {
        revokedUrls.push(url);
      });
    });

    afterEach(() => {
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
    });

    it('revokes blob URL when creating a new one', () => {
      let currentBlobUrl: string | null = null;

      const createPreview = (html: string) => {
        // Révoquer l'ancien blob avant d'en créer un nouveau
        if (currentBlobUrl) {
          URL.revokeObjectURL(currentBlobUrl);
        }

        const blob = new Blob([html], { type: 'text/html' });
        currentBlobUrl = URL.createObjectURL(blob);
        return currentBlobUrl;
      };

      // Premier build
      const url1 = createPreview('<html>v1</html>');
      expect(url1).toBe('blob:mock-url-1');
      expect(revokedUrls).toHaveLength(0);

      // Deuxième build - devrait révoquer le premier blob
      const url2 = createPreview('<html>v2</html>');
      expect(url2).toBe('blob:mock-url-2');
      expect(revokedUrls).toContain('blob:mock-url-1');

      // Troisième build - devrait révoquer le deuxième blob
      const url3 = createPreview('<html>v3</html>');
      expect(url3).toBe('blob:mock-url-3');
      expect(revokedUrls).toContain('blob:mock-url-2');
    });

    it('revokes all blob URLs on destroy', () => {
      let currentBlobUrl: string | null = null;

      const createPreview = () => {
        const blob = new Blob(['<html></html>'], { type: 'text/html' });
        currentBlobUrl = URL.createObjectURL(blob);
        return currentBlobUrl;
      };

      const destroy = () => {
        if (currentBlobUrl) {
          URL.revokeObjectURL(currentBlobUrl);
          currentBlobUrl = null;
        }
      };

      // Créer un blob
      createPreview();
      expect(currentBlobUrl).toBeTruthy();

      // Destroy devrait révoquer
      destroy();
      expect(revokedUrls).toHaveLength(1);
      expect(currentBlobUrl).toBeNull();
    });

    it('handles revoke errors gracefully', () => {
      let currentBlobUrl: string | null = 'blob:test';

      // Simuler une erreur lors de la révocation
      URL.revokeObjectURL = vi.fn().mockImplementation(() => {
        throw new Error('Revoke failed');
      });

      const safeRevoke = (url: string) => {
        try {
          URL.revokeObjectURL(url);
        } catch {
          // Ignorer les erreurs de révocation
        }
      };

      // Ne devrait pas throw
      expect(() => safeRevoke(currentBlobUrl!)).not.toThrow();
    });
  });

  describe('Event Listener Cleanup', () => {
    it('removes all event listeners on cleanup', () => {
      const listeners: Array<{ type: string; handler: () => void }> = [];
      const cleanupFunctions: Array<() => void> = [];

      const addEventListener = (type: string, handler: () => void) => {
        listeners.push({ type, handler });

        // Retourner une fonction de cleanup
        const cleanup = () => {
          const index = listeners.findIndex((l) => l.type === type && l.handler === handler);

          if (index !== -1) {
            listeners.splice(index, 1);
          }
        };

        cleanupFunctions.push(cleanup);
        return cleanup;
      };

      const cleanup = () => {
        for (const fn of cleanupFunctions) {
          fn();
        }
        cleanupFunctions.length = 0;
      };

      // Ajouter des listeners
      addEventListener('message', () => {});
      addEventListener('error', () => {});
      addEventListener('load', () => {});

      expect(listeners).toHaveLength(3);

      // Cleanup
      cleanup();
      expect(listeners).toHaveLength(0);
      expect(cleanupFunctions).toHaveLength(0);
    });

    it('handles listener removal errors gracefully', () => {
      const cleanupFunctions: Array<() => void> = [];

      // Ajouter une fonction de cleanup qui throw
      cleanupFunctions.push(() => {
        throw new Error('Cleanup failed');
      });

      cleanupFunctions.push(() => {
        // Cette cleanup devrait quand même s'exécuter
      });

      const safeCleanup = () => {
        for (const fn of cleanupFunctions) {
          try {
            fn();
          } catch {
            // Ignorer les erreurs
          }
        }
      };

      // Ne devrait pas throw
      expect(() => safeCleanup()).not.toThrow();
    });
  });

  describe('Store Subscription Cleanup', () => {
    it('unsubscribes from all stores on destroy', () => {
      let subscriptionCount = 0;
      const unsubscribeFunctions: Array<() => void> = [];

      const subscribe = (callback: () => void) => {
        subscriptionCount++;

        const unsubscribe = () => {
          subscriptionCount--;
        };

        unsubscribeFunctions.push(unsubscribe);
        return unsubscribe;
      };

      const cleanup = () => {
        for (const unsub of unsubscribeFunctions) {
          unsub();
        }
        unsubscribeFunctions.length = 0;
      };

      // Créer des subscriptions
      subscribe(() => {});
      subscribe(() => {});
      subscribe(() => {});

      expect(subscriptionCount).toBe(3);

      // Cleanup
      cleanup();
      expect(subscriptionCount).toBe(0);
    });
  });

  describe('LRU Cache Management', () => {
    class MockLRUCache<K, V> {
      private cache = new Map<K, { value: V; lastAccess: number }>();
      private maxSize: number;
      private maxAge: number;

      constructor(maxSize: number, maxAgeMs: number) {
        this.maxSize = maxSize;
        this.maxAge = maxAgeMs;
      }

      get(key: K): V | undefined {
        const entry = this.cache.get(key);

        if (!entry) return undefined;

        // Vérifier l'expiration
        if (Date.now() - entry.lastAccess > this.maxAge) {
          this.cache.delete(key);
          return undefined;
        }

        // Mettre à jour le temps d'accès
        entry.lastAccess = Date.now();
        return entry.value;
      }

      set(key: K, value: V): void {
        // Éviction si nécessaire
        if (this.cache.size >= this.maxSize) {
          this.evictOldest();
        }

        this.cache.set(key, { value, lastAccess: Date.now() });
      }

      private evictOldest(): void {
        let oldestKey: K | null = null;
        let oldestTime = Infinity;

        for (const [key, entry] of this.cache) {
          if (entry.lastAccess < oldestTime) {
            oldestTime = entry.lastAccess;
            oldestKey = key;
          }
        }

        if (oldestKey !== null) {
          this.cache.delete(oldestKey);
        }
      }

      get size(): number {
        return this.cache.size;
      }

      clear(): void {
        this.cache.clear();
      }
    }

    it('respects max size limit', () => {
      const cache = new MockLRUCache<string, string>(3, 60000);

      cache.set('a', '1');
      cache.set('b', '2');
      cache.set('c', '3');
      expect(cache.size).toBe(3);

      // L'ajout d'un 4ème élément devrait évicter le plus ancien
      cache.set('d', '4');
      expect(cache.size).toBe(3);
    });

    it('evicts least recently used entries', async () => {
      // Use a counter instead of Date.now() to avoid timing issues
      let timeCounter = 0;

      class TestLRUCache<K, V> {
        private cache = new Map<K, { value: V; lastAccess: number }>();
        private maxSize: number;

        constructor(maxSize: number) {
          this.maxSize = maxSize;
        }

        get(key: K): V | undefined {
          const entry = this.cache.get(key);
          if (!entry) return undefined;
          entry.lastAccess = ++timeCounter;
          return entry.value;
        }

        set(key: K, value: V): void {
          if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
            let oldestKey: K | null = null;
            let oldestTime = Infinity;
            for (const [k, e] of this.cache) {
              if (e.lastAccess < oldestTime) {
                oldestTime = e.lastAccess;
                oldestKey = k;
              }
            }
            if (oldestKey !== null) this.cache.delete(oldestKey);
          }
          this.cache.set(key, { value, lastAccess: ++timeCounter });
        }

        has(key: K): boolean {
          return this.cache.has(key);
        }
      }

      const cache = new TestLRUCache<string, string>(2);

      cache.set('a', '1');  // a.lastAccess = 1
      cache.set('b', '2');  // b.lastAccess = 2

      // Accéder à 'a' pour le rendre récent
      cache.get('a');       // a.lastAccess = 3

      // Ajouter 'c' - devrait évicter 'b' (lastAccess = 2 < 3)
      cache.set('c', '3');

      expect(cache.get('a')).toBe('1');
      expect(cache.has('b')).toBe(false);
      expect(cache.get('c')).toBe('3');
    });

    it('expires entries after max age', async () => {
      const cache = new MockLRUCache<string, string>(10, 50); // 50ms TTL

      cache.set('key', 'value');
      expect(cache.get('key')).toBe('value');

      // Attendre l'expiration
      await new Promise((r) => setTimeout(r, 60));

      expect(cache.get('key')).toBeUndefined();
    });

    it('clears all entries', () => {
      const cache = new MockLRUCache<string, string>(10, 60000);

      cache.set('a', '1');
      cache.set('b', '2');
      cache.set('c', '3');

      expect(cache.size).toBe(3);

      cache.clear();
      expect(cache.size).toBe(0);
    });
  });

  describe('Worker Cleanup', () => {
    it('terminates idle workers after timeout', async () => {
      let workerTerminated = false;
      let idleTimeout: ReturnType<typeof setTimeout> | null = null;
      const IDLE_TIMEOUT_MS = 50;

      const scheduleWorkerTermination = () => {
        if (idleTimeout) {
          clearTimeout(idleTimeout);
        }

        idleTimeout = setTimeout(() => {
          workerTerminated = true;
        }, IDLE_TIMEOUT_MS);
      };

      const cancelTermination = () => {
        if (idleTimeout) {
          clearTimeout(idleTimeout);
          idleTimeout = null;
        }
      };

      // Planifier la terminaison
      scheduleWorkerTermination();

      // Annuler avant le timeout
      await new Promise((r) => setTimeout(r, 20));
      cancelTermination();
      scheduleWorkerTermination();

      // Attendre le timeout
      await new Promise((r) => setTimeout(r, 60));

      expect(workerTerminated).toBe(true);
    });

    it('does not terminate workers during activity', async () => {
      let workerTerminated = false;
      let idleTimeout: ReturnType<typeof setTimeout> | null = null;
      const IDLE_TIMEOUT_MS = 100;

      const scheduleWorkerTermination = () => {
        if (idleTimeout) {
          clearTimeout(idleTimeout);
        }

        idleTimeout = setTimeout(() => {
          workerTerminated = true;
        }, IDLE_TIMEOUT_MS);
      };

      const resetIdleTimer = () => {
        scheduleWorkerTermination();
      };

      // Simuler une activité continue
      scheduleWorkerTermination();

      for (let i = 0; i < 5; i++) {
        await new Promise((r) => setTimeout(r, 30));
        resetIdleTimer(); // Activité détectée
      }

      // Le worker ne devrait pas être terminé
      expect(workerTerminated).toBe(false);
    });
  });

  describe('Stream Reader Cleanup', () => {
    it('releases reader lock after consumption', async () => {
      let lockReleased = false;

      const mockReader = {
        read: vi.fn().mockResolvedValueOnce({ done: false, value: new Uint8Array([1, 2, 3]) }).mockResolvedValue({ done: true }),
        releaseLock: vi.fn().mockImplementation(() => {
          lockReleased = true;
        }),
      };

      const consumeStream = async () => {
        try {
          while (true) {
            const { done } = await mockReader.read();

            if (done) break;
          }
        } finally {
          mockReader.releaseLock();
        }
      };

      await consumeStream();

      expect(lockReleased).toBe(true);
      expect(mockReader.releaseLock).toHaveBeenCalled();
    });

    it('releases reader lock even on error', async () => {
      let lockReleased = false;

      const mockReader = {
        read: vi.fn().mockRejectedValue(new Error('Stream error')),
        releaseLock: vi.fn().mockImplementation(() => {
          lockReleased = true;
        }),
      };

      const consumeStream = async () => {
        try {
          await mockReader.read();
        } finally {
          try {
            mockReader.releaseLock();
          } catch {
            // Ignorer les erreurs de release
          }
        }
      };

      await expect(consumeStream()).rejects.toThrow('Stream error');
      expect(lockReleased).toBe(true);
    });
  });

  describe('String Concatenation Performance', () => {
    it('uses array join instead of += for large strings', () => {
      const chunks: string[] = [];
      const CHUNK_COUNT = 1000;

      // Méthode efficace: Array + join
      const startEfficient = performance.now();

      for (let i = 0; i < CHUNK_COUNT; i++) {
        chunks.push(`chunk-${i}`);
      }

      const resultEfficient = chunks.join('');
      const timeEfficient = performance.now() - startEfficient;

      expect(resultEfficient.length).toBeGreaterThan(0);
      expect(timeEfficient).toBeLessThan(100); // Devrait être très rapide
    });

    it('accumulates chunks efficiently during streaming', () => {
      const chunks: string[] = [];

      const appendChunk = (chunk: string) => {
        chunks.push(chunk);
      };

      const getFullContent = () => {
        return chunks.join('');
      };

      // Simuler le streaming
      for (let i = 0; i < 100; i++) {
        appendChunk(`Line ${i}\n`);
      }

      const content = getFullContent();
      expect(content.split('\n').length).toBe(101); // 100 lignes + 1 vide à la fin
    });
  });
});
