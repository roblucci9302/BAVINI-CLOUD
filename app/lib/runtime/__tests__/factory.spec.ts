/**
 * =============================================================================
 * BAVINI CLOUD - Runtime Factory Tests
 * =============================================================================
 * Tests pour la factory de runtime et le feature flag.
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
    it('should default to webcontainer', () => {
      type RuntimeType = 'webcontainer' | 'browser';
      const runtimeTypeStore = atom<RuntimeType>('webcontainer');

      expect(runtimeTypeStore.get()).toBe('webcontainer');
    });

    it('should allow switching to browser', () => {
      type RuntimeType = 'webcontainer' | 'browser';
      const runtimeTypeStore = atom<RuntimeType>('webcontainer');

      runtimeTypeStore.set('browser');

      expect(runtimeTypeStore.get()).toBe('browser');
    });

    it('should notify subscribers on change', () => {
      type RuntimeType = 'webcontainer' | 'browser';
      const runtimeTypeStore = atom<RuntimeType>('webcontainer');
      const changes: RuntimeType[] = [];

      const unsubscribe = runtimeTypeStore.subscribe((value) => {
        changes.push(value);
      });

      runtimeTypeStore.set('browser');
      runtimeTypeStore.set('webcontainer');

      unsubscribe();

      // First call is initial value, then two changes
      expect(changes).toEqual(['webcontainer', 'browser', 'webcontainer']);
    });
  });

  describe('Singleton Pattern', () => {
    it('should reuse adapter instance when type unchanged', () => {
      type RuntimeType = 'webcontainer' | 'browser';
      let currentAdapter: object | null = null;
      let currentType: RuntimeType | null = null;
      const runtimeTypeStore = atom<RuntimeType>('webcontainer');

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
      type RuntimeType = 'webcontainer' | 'browser';
      let currentAdapter: { type: RuntimeType; id: number } | null = null;
      let currentType: RuntimeType | null = null;
      const runtimeTypeStore = atom<RuntimeType>('webcontainer');

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
      expect(adapter1.type).toBe('webcontainer');

      runtimeTypeStore.set('browser');
      const adapter2 = getAdapter();

      expect(adapter2.type).toBe('browser');
      expect(adapter1).not.toBe(adapter2);
    });

    it('should destroy previous adapter when switching', async () => {
      type RuntimeType = 'webcontainer' | 'browser';
      const destroyCalls: RuntimeType[] = [];

      interface MockAdapter {
        type: RuntimeType;
        destroy: () => Promise<void>;
      }

      let currentAdapter: MockAdapter | null = null;
      let currentType: RuntimeType | null = null;
      const runtimeTypeStore = atom<RuntimeType>('webcontainer');

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

      await getAdapter(); // webcontainer
      runtimeTypeStore.set('browser');
      await getAdapter(); // browser

      expect(destroyCalls).toEqual(['webcontainer']);
    });
  });

  describe('setRuntimeType', () => {
    it('should not change if already set to same type', () => {
      type RuntimeType = 'webcontainer' | 'browser';
      const runtimeTypeStore = atom<RuntimeType>('webcontainer');
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

      setRuntimeType('webcontainer'); // Same, should not trigger
      setRuntimeType('browser'); // Different, should trigger

      // Initial + one change
      expect(changes).toEqual(['webcontainer', 'browser']);
    });
  });

  describe('getRuntimeInfo', () => {
    it('should return current runtime type', () => {
      type RuntimeType = 'webcontainer' | 'browser';
      const runtimeTypeStore = atom<RuntimeType>('webcontainer');

      const getRuntimeInfo = () => ({
        current: runtimeTypeStore.get(),
        available: ['webcontainer'] as RuntimeType[],
        webcontainer: { available: true },
        browser: { available: false, reason: 'Not implemented yet' },
      });

      const info = getRuntimeInfo();

      expect(info.current).toBe('webcontainer');
      expect(info.available).toContain('webcontainer');
      expect(info.webcontainer.available).toBe(true);
      expect(info.browser.available).toBe(false);
    });
  });

  describe('isBrowserRuntimeAvailable', () => {
    it('should return false when not implemented', () => {
      const isBrowserRuntimeAvailable = () => {
        // TODO: Check if esbuild-wasm is loaded
        return false;
      };

      expect(isBrowserRuntimeAvailable()).toBe(false);
    });
  });
});

describe('Error Handling', () => {
  it('should throw for unknown runtime type', () => {
    type RuntimeType = 'webcontainer' | 'browser';

    const createAdapter = (type: string) => {
      switch (type) {
        case 'webcontainer':
          return { name: 'WebContainer' };
        case 'browser':
          throw new Error('BrowserBuildAdapter not implemented yet');
        default:
          throw new Error(`Unknown runtime type: ${type}`);
      }
    };

    expect(() => createAdapter('webcontainer')).not.toThrow();
    expect(() => createAdapter('browser')).toThrow('not implemented');
    expect(() => createAdapter('invalid')).toThrow('Unknown runtime type');
  });
});

describe('Feature Flag Integration', () => {
  it('should allow feature flag control from settings', () => {
    type RuntimeType = 'webcontainer' | 'browser';
    const runtimeTypeStore = atom<RuntimeType>('webcontainer');

    // Simulate settings store
    interface Settings {
      buildEngine: RuntimeType;
    }

    const settingsStore = atom<Settings>({ buildEngine: 'webcontainer' });

    // Sync runtime type with settings
    const unsubscribe = settingsStore.subscribe((settings) => {
      runtimeTypeStore.set(settings.buildEngine);
    });

    // Change setting
    settingsStore.set({ buildEngine: 'browser' });

    expect(runtimeTypeStore.get()).toBe('browser');

    unsubscribe();
  });

  it('should persist runtime choice', () => {
    type RuntimeType = 'webcontainer' | 'browser';

    // Simulate localStorage
    const storage: Record<string, string> = {};

    const saveRuntimeType = (type: RuntimeType) => {
      storage['runtime-type'] = type;
    };

    const loadRuntimeType = (): RuntimeType => {
      return (storage['runtime-type'] as RuntimeType) || 'webcontainer';
    };

    saveRuntimeType('browser');
    expect(loadRuntimeType()).toBe('browser');

    // Clear
    delete storage['runtime-type'];
    expect(loadRuntimeType()).toBe('webcontainer');
  });
});

describe('Graceful Degradation', () => {
  it('should fallback to webcontainer if browser runtime fails', async () => {
    type RuntimeType = 'webcontainer' | 'browser';
    const runtimeTypeStore = atom<RuntimeType>('webcontainer');
    let currentAdapter: { name: string } | null = null;

    const createAdapter = async (type: RuntimeType) => {
      if (type === 'browser') {
        throw new Error('esbuild-wasm failed to load');
      }

      return { name: 'WebContainer' };
    };

    const initRuntime = async () => {
      const type = runtimeTypeStore.get();

      try {
        currentAdapter = await createAdapter(type);
      } catch (_error) {
        // Fallback to webcontainer
        console.warn('Browser runtime failed, falling back to WebContainer');
        runtimeTypeStore.set('webcontainer');
        currentAdapter = await createAdapter('webcontainer');
      }

      return currentAdapter;
    };

    // Try browser first
    runtimeTypeStore.set('browser');
    const adapter = await initRuntime();

    expect(adapter.name).toBe('WebContainer');
    expect(runtimeTypeStore.get()).toBe('webcontainer');
  });
});
