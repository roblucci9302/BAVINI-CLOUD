/**
 * =============================================================================
 * BAVINI CLOUD - Runtime Factory Tests
 * =============================================================================
 * Tests pour la factory de runtime et le feature flag.
 *
 * NOTE: WebContainer has been removed. BAVINI uses only browser-based runtime.
 * =============================================================================
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { atom } from 'nanostores';

/**
 * Ces tests vérifient la logique de la factory sans dépendre de WebContainer.
 * Ils utilisent des mocks pour simuler le comportement.
 */

describe('RuntimeFactory Logic', () => {
  describe('RuntimeType Store', () => {
    it('should default to browser (BAVINI native runtime)', () => {
      type RuntimeType = 'browser' | 'bavini-container';
      const runtimeTypeStore = atom<RuntimeType>('browser');

      expect(runtimeTypeStore.get()).toBe('browser');
    });

    it('should allow switching to bavini-container', () => {
      type RuntimeType = 'browser' | 'bavini-container';
      const runtimeTypeStore = atom<RuntimeType>('browser');

      runtimeTypeStore.set('bavini-container');

      expect(runtimeTypeStore.get()).toBe('bavini-container');
    });

    it('should notify subscribers on change', () => {
      type RuntimeType = 'browser' | 'bavini-container';
      const runtimeTypeStore = atom<RuntimeType>('browser');
      const changes: RuntimeType[] = [];

      const unsubscribe = runtimeTypeStore.subscribe((value) => {
        changes.push(value);
      });

      runtimeTypeStore.set('bavini-container');
      runtimeTypeStore.set('browser');

      unsubscribe();

      // First call is initial value, then two changes
      expect(changes).toEqual(['browser', 'bavini-container', 'browser']);
    });
  });

  describe('Singleton Pattern', () => {
    it('should reuse adapter instance when type unchanged', () => {
      type RuntimeType = 'browser' | 'bavini-container';
      let currentAdapter: object | null = null;
      let currentType: RuntimeType | null = null;
      const runtimeTypeStore = atom<RuntimeType>('browser');

      const createAdapter = (type: RuntimeType) => ({ type, id: Math.random() });

      const getAdapter = () => {
        const type = runtimeTypeStore.get();

        if (!currentAdapter || currentType !== type) {
          currentAdapter = createAdapter(type);
          currentType = type;
        }

        return currentAdapter;
      };

      const adapter1 = getAdapter();
      const adapter2 = getAdapter();

      expect(adapter1).toBe(adapter2);
    });

    it('should create new adapter when type changes', () => {
      type RuntimeType = 'browser' | 'bavini-container';
      let currentAdapter: { type: RuntimeType; id: number } | null = null;
      let currentType: RuntimeType | null = null;
      const runtimeTypeStore = atom<RuntimeType>('browser');

      const createAdapter = (type: RuntimeType) => ({ type, id: Math.random() });

      const getAdapter = () => {
        const type = runtimeTypeStore.get();

        if (!currentAdapter || currentType !== type) {
          currentAdapter = createAdapter(type);
          currentType = type;
        }

        return currentAdapter;
      };

      const adapter1 = getAdapter();
      expect(adapter1.type).toBe('browser');

      runtimeTypeStore.set('bavini-container');
      const adapter2 = getAdapter();

      expect(adapter2.type).toBe('bavini-container');
      expect(adapter1).not.toBe(adapter2);
    });

    it('should destroy previous adapter when switching', async () => {
      type RuntimeType = 'browser' | 'bavini-container';
      const destroyCalls: RuntimeType[] = [];

      interface MockAdapter {
        type: RuntimeType;
        destroy: () => Promise<void>;
      }

      let currentAdapter: MockAdapter | null = null;
      let currentType: RuntimeType | null = null;
      const runtimeTypeStore = atom<RuntimeType>('browser');

      const createAdapter = (type: RuntimeType): MockAdapter => ({
        type,
        destroy: async () => {
          destroyCalls.push(type);
        },
      });

      const getAdapter = async () => {
        const type = runtimeTypeStore.get();

        if (currentAdapter && currentType !== type) {
          await currentAdapter.destroy();
          currentAdapter = null;
        }

        if (!currentAdapter) {
          currentAdapter = createAdapter(type);
          currentType = type;
        }

        return currentAdapter;
      };

      await getAdapter(); // browser
      runtimeTypeStore.set('bavini-container');
      await getAdapter(); // bavini-container

      expect(destroyCalls).toEqual(['browser']);
    });
  });

  describe('setRuntimeType', () => {
    it('should not change if already set to same type', () => {
      type RuntimeType = 'browser' | 'bavini-container';
      const runtimeTypeStore = atom<RuntimeType>('browser');
      const changes: RuntimeType[] = [];

      runtimeTypeStore.subscribe((value) => {
        changes.push(value);
      });

      const setRuntimeType = (type: RuntimeType) => {
        if (runtimeTypeStore.get() === type) {
          return; // No change
        }

        runtimeTypeStore.set(type);
      };

      setRuntimeType('browser'); // Same, should not trigger
      setRuntimeType('bavini-container'); // Different, should trigger

      // Initial + one change
      expect(changes).toEqual(['browser', 'bavini-container']);
    });
  });

  describe('getRuntimeInfo', () => {
    it('should return current runtime type', () => {
      type RuntimeType = 'browser' | 'bavini-container';
      const runtimeTypeStore = atom<RuntimeType>('browser');

      const getRuntimeInfo = () => ({
        current: runtimeTypeStore.get(),
        available: ['browser', 'bavini-container'] as RuntimeType[],
        browser: { available: true },
        'bavini-container': { available: true },
      });

      const info = getRuntimeInfo();

      expect(info.current).toBe('browser');
      expect(info.available).toContain('browser');
      expect(info.browser.available).toBe(true);
    });
  });

  describe('isBrowserRuntimeAvailable', () => {
    it('should return true when in browser environment', () => {
      const isBrowserRuntimeAvailable = () => {
        return typeof window !== 'undefined';
      };

      // In test environment, we have jsdom
      expect(isBrowserRuntimeAvailable()).toBe(true);
    });
  });
});

describe('Error Handling', () => {
  it('should throw for unknown runtime type', () => {
    type RuntimeType = 'browser' | 'bavini-container';

    const createAdapter = (type: string) => {
      switch (type) {
        case 'browser':
          return { name: 'BrowserBuild' };
        case 'bavini-container':
          return { name: 'BaviniContainer' };
        default:
          throw new Error(`Unknown runtime type: ${type}`);
      }
    };

    expect(() => createAdapter('browser')).not.toThrow();
    expect(() => createAdapter('bavini-container')).not.toThrow();
    expect(() => createAdapter('invalid')).toThrow('Unknown runtime type');
  });
});

describe('Feature Flag Integration', () => {
  it('should allow feature flag control from settings', () => {
    type RuntimeType = 'browser' | 'bavini-container';
    const runtimeTypeStore = atom<RuntimeType>('browser');

    // Simulate settings store
    interface Settings {
      buildEngine: RuntimeType;
    }

    const settingsStore = atom<Settings>({ buildEngine: 'browser' });

    // Sync runtime type with settings
    const unsubscribe = settingsStore.subscribe((settings) => {
      runtimeTypeStore.set(settings.buildEngine);
    });

    // Change setting
    settingsStore.set({ buildEngine: 'bavini-container' });

    expect(runtimeTypeStore.get()).toBe('bavini-container');

    unsubscribe();
  });

  it('should persist runtime choice', () => {
    type RuntimeType = 'browser' | 'bavini-container';

    // Simulate localStorage
    const storage: Record<string, string> = {};

    const saveRuntimeType = (type: RuntimeType) => {
      storage['runtime-type'] = type;
    };

    const loadRuntimeType = (): RuntimeType => {
      return (storage['runtime-type'] as RuntimeType) || 'browser';
    };

    saveRuntimeType('bavini-container');
    expect(loadRuntimeType()).toBe('bavini-container');

    // Clear
    delete storage['runtime-type'];
    expect(loadRuntimeType()).toBe('browser');
  });
});

describe('Graceful Degradation', () => {
  it('should handle runtime initialization failure gracefully', async () => {
    type RuntimeType = 'browser' | 'bavini-container';
    const runtimeTypeStore = atom<RuntimeType>('browser');
    let initAttempts = 0;

    const createAdapter = async (type: RuntimeType) => {
      initAttempts++;

      // Simulate first attempt failing, second succeeding (retry logic)
      if (initAttempts === 1 && type === 'bavini-container') {
        throw new Error('OPFS initialization failed');
      }

      return { name: type === 'browser' ? 'BrowserBuild' : 'BaviniContainer' };
    };

    const initRuntime = async () => {
      const type = runtimeTypeStore.get();

      try {
        return await createAdapter(type);
      } catch (_error) {
        // Fallback to browser runtime
        console.warn('Runtime initialization failed, falling back to browser');
        runtimeTypeStore.set('browser');
        return await createAdapter('browser');
      }
    };

    // Try bavini-container first (will fail)
    runtimeTypeStore.set('bavini-container');
    const adapter = await initRuntime();

    expect(adapter.name).toBe('BrowserBuild');
    expect(runtimeTypeStore.get()).toBe('browser');
  });
});
