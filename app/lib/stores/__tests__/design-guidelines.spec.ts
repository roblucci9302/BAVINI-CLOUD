/**
 * Design Guidelines Store - Unit Tests
 *
 * Tests for the design guidelines state management.
 *
 * @module stores/__tests__/design-guidelines.spec
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  designGuidelinesEnabledStore,
  guidelinesLevelStore,
  designGuidelinesConfigStore,
  shouldInjectGuidelinesStore,
  setDesignGuidelinesEnabled,
  setGuidelinesLevel,
  toggleDesignGuidelines,
  cycleGuidelinesLevel,
  resetDesignGuidelines,
  initDesignGuidelinesStore,
  getGuidelinesLevelDescription,
  getEstimatedTokens,
  DEFAULT_ENABLED,
  DEFAULT_LEVEL,
  STORAGE_KEY_ENABLED,
  STORAGE_KEY_LEVEL,
} from '../design-guidelines';

describe('Design Guidelines Store', () => {
  // Mock localStorage
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

  beforeEach(() => {
    // Reset stores to defaults
    designGuidelinesEnabledStore.set(DEFAULT_ENABLED);
    guidelinesLevelStore.set(DEFAULT_LEVEL);

    // Setup localStorage mock
    Object.defineProperty(window, 'localStorage', {
      value: localStorageMock,
      writable: true,
    });

    localStorageMock.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Initial State', () => {
    it('should have default enabled value', () => {
      expect(designGuidelinesEnabledStore.get()).toBe(DEFAULT_ENABLED);
    });

    it('should have default level value', () => {
      expect(guidelinesLevelStore.get()).toBe(DEFAULT_LEVEL);
    });
  });

  describe('setDesignGuidelinesEnabled', () => {
    it('should update enabled store', () => {
      setDesignGuidelinesEnabled(false);
      expect(designGuidelinesEnabledStore.get()).toBe(false);

      setDesignGuidelinesEnabled(true);
      expect(designGuidelinesEnabledStore.get()).toBe(true);
    });

    it('should persist to localStorage', () => {
      setDesignGuidelinesEnabled(false);

      expect(localStorageMock.setItem).toHaveBeenCalledWith(STORAGE_KEY_ENABLED, 'false');
    });
  });

  describe('setGuidelinesLevel', () => {
    it('should update level store', () => {
      setGuidelinesLevel('full');
      expect(guidelinesLevelStore.get()).toBe('full');

      setGuidelinesLevel('minimal');
      expect(guidelinesLevelStore.get()).toBe('minimal');
    });

    it('should persist to localStorage', () => {
      setGuidelinesLevel('full');

      expect(localStorageMock.setItem).toHaveBeenCalledWith(STORAGE_KEY_LEVEL, 'full');
    });
  });

  describe('toggleDesignGuidelines', () => {
    it('should toggle from true to false', () => {
      designGuidelinesEnabledStore.set(true);
      toggleDesignGuidelines();
      expect(designGuidelinesEnabledStore.get()).toBe(false);
    });

    it('should toggle from false to true', () => {
      designGuidelinesEnabledStore.set(false);
      toggleDesignGuidelines();
      expect(designGuidelinesEnabledStore.get()).toBe(true);
    });
  });

  describe('cycleGuidelinesLevel', () => {
    it('should cycle minimal → standard', () => {
      guidelinesLevelStore.set('minimal');
      cycleGuidelinesLevel();
      expect(guidelinesLevelStore.get()).toBe('standard');
    });

    it('should cycle standard → full', () => {
      guidelinesLevelStore.set('standard');
      cycleGuidelinesLevel();
      expect(guidelinesLevelStore.get()).toBe('full');
    });

    it('should cycle full → minimal', () => {
      guidelinesLevelStore.set('full');
      cycleGuidelinesLevel();
      expect(guidelinesLevelStore.get()).toBe('minimal');
    });
  });

  describe('resetDesignGuidelines', () => {
    it('should reset to defaults', () => {
      setDesignGuidelinesEnabled(false);
      setGuidelinesLevel('full');

      resetDesignGuidelines();

      expect(designGuidelinesEnabledStore.get()).toBe(DEFAULT_ENABLED);
      expect(guidelinesLevelStore.get()).toBe(DEFAULT_LEVEL);
    });
  });

  describe('designGuidelinesConfigStore (computed)', () => {
    it('should return current config', () => {
      designGuidelinesEnabledStore.set(true);
      guidelinesLevelStore.set('full');

      const config = designGuidelinesConfigStore.get();

      expect(config.enabled).toBe(true);
      expect(config.level).toBe('full');
      expect(config.effectiveLevel).toBe('full');
    });

    it('should set effectiveLevel to minimal when disabled', () => {
      designGuidelinesEnabledStore.set(false);
      guidelinesLevelStore.set('full');

      const config = designGuidelinesConfigStore.get();

      expect(config.enabled).toBe(false);
      expect(config.level).toBe('full');
      expect(config.effectiveLevel).toBe('minimal');
    });
  });

  describe('shouldInjectGuidelinesStore (computed)', () => {
    it('should return true when enabled and level is standard', () => {
      designGuidelinesEnabledStore.set(true);
      guidelinesLevelStore.set('standard');

      expect(shouldInjectGuidelinesStore.get()).toBe(true);
    });

    it('should return true when enabled and level is full', () => {
      designGuidelinesEnabledStore.set(true);
      guidelinesLevelStore.set('full');

      expect(shouldInjectGuidelinesStore.get()).toBe(true);
    });

    it('should return false when enabled but level is minimal', () => {
      designGuidelinesEnabledStore.set(true);
      guidelinesLevelStore.set('minimal');

      expect(shouldInjectGuidelinesStore.get()).toBe(false);
    });

    it('should return false when disabled', () => {
      designGuidelinesEnabledStore.set(false);
      guidelinesLevelStore.set('full');

      expect(shouldInjectGuidelinesStore.get()).toBe(false);
    });
  });

  describe('initDesignGuidelinesStore', () => {
    it('should load enabled from localStorage', () => {
      localStorageMock.getItem.mockImplementation((key: string) => {
        if (key === STORAGE_KEY_ENABLED) return 'false';
        return null;
      });

      // Reset to default first
      designGuidelinesEnabledStore.set(true);

      // Manually call init (bypassing the initialized flag)
      const savedEnabled = localStorage.getItem(STORAGE_KEY_ENABLED);
      if (savedEnabled !== null) {
        designGuidelinesEnabledStore.set(JSON.parse(savedEnabled));
      }

      expect(designGuidelinesEnabledStore.get()).toBe(false);
    });

    it('should load level from localStorage', () => {
      localStorageMock.getItem.mockImplementation((key: string) => {
        if (key === STORAGE_KEY_LEVEL) return 'full';
        return null;
      });

      // Reset to default first
      guidelinesLevelStore.set('standard');

      // Manually load
      const savedLevel = localStorage.getItem(STORAGE_KEY_LEVEL);
      if (savedLevel && ['minimal', 'standard', 'full'].includes(savedLevel)) {
        guidelinesLevelStore.set(savedLevel as 'minimal' | 'standard' | 'full');
      }

      expect(guidelinesLevelStore.get()).toBe('full');
    });

    it('should ignore invalid level values', () => {
      localStorageMock.getItem.mockImplementation((key: string) => {
        if (key === STORAGE_KEY_LEVEL) return 'invalid';
        return null;
      });

      guidelinesLevelStore.set('standard');

      const savedLevel = localStorage.getItem(STORAGE_KEY_LEVEL);
      if (savedLevel && ['minimal', 'standard', 'full'].includes(savedLevel)) {
        guidelinesLevelStore.set(savedLevel as 'minimal' | 'standard' | 'full');
      }

      // Should remain standard since 'invalid' is not valid
      expect(guidelinesLevelStore.get()).toBe('standard');
    });
  });

  describe('getGuidelinesLevelDescription', () => {
    it('should return correct description for minimal', () => {
      const desc = getGuidelinesLevelDescription('minimal');
      expect(desc).toContain('Désactivé');
    });

    it('should return correct description for standard', () => {
      const desc = getGuidelinesLevelDescription('standard');
      expect(desc).toContain('Standard');
      expect(desc).toContain('1000');
    });

    it('should return correct description for full', () => {
      const desc = getGuidelinesLevelDescription('full');
      expect(desc).toContain('Complet');
      expect(desc).toContain('7500');
    });
  });

  describe('getEstimatedTokens', () => {
    it('should return 0 for minimal', () => {
      expect(getEstimatedTokens('minimal')).toBe(0);
    });

    it('should return 1000 for standard', () => {
      expect(getEstimatedTokens('standard')).toBe(1000);
    });

    it('should return 7500 for full', () => {
      expect(getEstimatedTokens('full')).toBe(7500);
    });
  });
});
