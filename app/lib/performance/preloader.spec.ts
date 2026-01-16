import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  schedulePreload,
  isPreloaded,
  resetPreloading,
  initPreloading,
  preloadOnFirstMessage,
  preloadOnWorkbenchInteraction,
  preloadOnTypingStart,
} from './preloader';

describe('Preloader', () => {
  beforeEach(() => {
    // Reset preloading state before each test
    resetPreloading();

    // Clear any pending callbacks
    vi.clearAllTimers();
  });

  describe('schedulePreload', () => {
    it('should mark a group as preloaded after scheduling', () => {
      expect(isPreloaded('afterIdle')).toBe(false);

      schedulePreload('afterIdle');

      expect(isPreloaded('afterIdle')).toBe(true);
    });

    it('should not preload the same group twice', () => {
      schedulePreload('afterIdle');

      const firstCallPreloaded = isPreloaded('afterIdle');

      schedulePreload('afterIdle');

      const secondCallPreloaded = isPreloaded('afterIdle');

      expect(firstCallPreloaded).toBe(true);
      expect(secondCallPreloaded).toBe(true);
    });

    it('should preload different groups independently', () => {
      schedulePreload('afterIdle');
      schedulePreload('onFirstMessage');

      expect(isPreloaded('afterIdle')).toBe(true);
      expect(isPreloaded('onFirstMessage')).toBe(true);
      expect(isPreloaded('onWorkbenchHover')).toBe(false);
    });
  });

  describe('resetPreloading', () => {
    it('should reset all preloaded groups', () => {
      schedulePreload('afterIdle');
      schedulePreload('onFirstMessage');

      expect(isPreloaded('afterIdle')).toBe(true);
      expect(isPreloaded('onFirstMessage')).toBe(true);

      resetPreloading();

      expect(isPreloaded('afterIdle')).toBe(false);
      expect(isPreloaded('onFirstMessage')).toBe(false);
    });
  });

  describe('convenience functions', () => {
    it('initPreloading should schedule afterIdle preload', () => {
      initPreloading();

      expect(isPreloaded('afterIdle')).toBe(true);
    });

    it('preloadOnFirstMessage should schedule onFirstMessage preload', () => {
      preloadOnFirstMessage();

      expect(isPreloaded('onFirstMessage')).toBe(true);
    });

    it('preloadOnWorkbenchInteraction should schedule onWorkbenchHover preload', () => {
      preloadOnWorkbenchInteraction();

      expect(isPreloaded('onWorkbenchHover')).toBe(true);
    });

    it('preloadOnTypingStart should schedule onTypingStart preload', () => {
      preloadOnTypingStart();

      expect(isPreloaded('onTypingStart')).toBe(true);
    });
  });

  describe('isPreloaded', () => {
    it('should return false for non-preloaded groups', () => {
      expect(isPreloaded('afterIdle')).toBe(false);
      expect(isPreloaded('onFirstMessage')).toBe(false);
      expect(isPreloaded('onWorkbenchHover')).toBe(false);
      expect(isPreloaded('onTypingStart')).toBe(false);
    });

    it('should return true only for preloaded groups', () => {
      schedulePreload('afterIdle');

      expect(isPreloaded('afterIdle')).toBe(true);
      expect(isPreloaded('onFirstMessage')).toBe(false);
    });
  });
});
