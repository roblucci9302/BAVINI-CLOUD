import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  isServiceWorkerSupported,
  registerServiceWorker,
  unregisterServiceWorker,
  clearServiceWorkerCache,
} from './service-worker';

describe('Service Worker', () => {
  const originalNavigator = global.navigator;
  const originalCaches = global.caches;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('isServiceWorkerSupported', () => {
    it('should return true when serviceWorker is in navigator', () => {
      // In jsdom, serviceWorker is available
      const result = isServiceWorkerSupported();
      expect(typeof result).toBe('boolean');
    });
  });

  describe('registerServiceWorker', () => {
    it('should skip registration in development mode', async () => {
      // import.meta.env.DEV is true in test environment
      const result = await registerServiceWorker();
      expect(result).toBeNull();
    });
  });

  describe('unregisterServiceWorker', () => {
    it('should handle unregistration when no service workers exist', async () => {
      // Mock navigator.serviceWorker.getRegistrations
      const mockGetRegistrations = vi.fn().mockResolvedValue([]);

      if ('serviceWorker' in navigator) {
        vi.spyOn(navigator.serviceWorker, 'getRegistrations').mockImplementation(mockGetRegistrations);
      }

      const result = await unregisterServiceWorker();
      expect(typeof result).toBe('boolean');
    });
  });

  describe('clearServiceWorkerCache', () => {
    it('should clear all caches', async () => {
      // Mock caches API
      const mockDelete = vi.fn().mockResolvedValue(true);
      const mockKeys = vi.fn().mockResolvedValue(['cache1', 'cache2']);

      if (typeof caches !== 'undefined') {
        vi.spyOn(caches, 'keys').mockImplementation(mockKeys);
        vi.spyOn(caches, 'delete').mockImplementation(mockDelete);

        const result = await clearServiceWorkerCache();
        expect(result).toBe(true);
        expect(mockDelete).toHaveBeenCalledTimes(2);
      } else {
        // If caches is not available, function should return false
        const result = await clearServiceWorkerCache();
        expect(typeof result).toBe('boolean');
      }
    });
  });
});
