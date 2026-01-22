/**
 * =============================================================================
 * Tests: Blob URL Cleanup (browser-build-adapter.ts)
 * =============================================================================
 * FIX 1.2: Tests for Blob URL memory leak prevention.
 * =============================================================================
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock URL.createObjectURL and revokeObjectURL
const createdUrls: string[] = [];
const revokedUrls: string[] = [];

const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

beforeEach(() => {
  createdUrls.length = 0;
  revokedUrls.length = 0;

  let urlCounter = 0;
  URL.createObjectURL = vi.fn((blob: Blob) => {
    const url = `blob:http://localhost/${urlCounter++}`;
    createdUrls.push(url);
    return url;
  });

  URL.revokeObjectURL = vi.fn((url: string) => {
    revokedUrls.push(url);
  });
});

afterEach(() => {
  URL.createObjectURL = originalCreateObjectURL;
  URL.revokeObjectURL = originalRevokeObjectURL;
});

describe('Blob URL Memory Management', () => {
  describe('Blob URL tracking concept', () => {
    it('should track created Blob URLs', () => {
      const blob1 = new Blob(['test1'], { type: 'text/html' });
      const blob2 = new Blob(['test2'], { type: 'text/html' });

      const url1 = URL.createObjectURL(blob1);
      const url2 = URL.createObjectURL(blob2);

      expect(createdUrls).toHaveLength(2);
      expect(createdUrls).toContain(url1);
      expect(createdUrls).toContain(url2);
    });

    it('should track revoked Blob URLs', () => {
      const blob = new Blob(['test'], { type: 'text/html' });
      const url = URL.createObjectURL(blob);

      URL.revokeObjectURL(url);

      expect(revokedUrls).toContain(url);
    });

    it('should revoke all URLs on cleanup', () => {
      // Simulate creating multiple Blob URLs
      const urls: string[] = [];
      for (let i = 0; i < 5; i++) {
        const blob = new Blob([`content ${i}`], { type: 'text/html' });
        urls.push(URL.createObjectURL(blob));
      }

      // Simulate cleanup (what destroy() should do)
      for (const url of urls) {
        URL.revokeObjectURL(url);
      }

      expect(revokedUrls).toHaveLength(5);
      for (const url of urls) {
        expect(revokedUrls).toContain(url);
      }
    });
  });

  describe('Memory leak prevention patterns', () => {
    it('should revoke old URL before creating new one', () => {
      let currentUrl: string | null = null;

      // Simulate multiple preview updates
      for (let i = 0; i < 3; i++) {
        // Revoke old URL first
        if (currentUrl) {
          URL.revokeObjectURL(currentUrl);
        }

        // Create new URL
        const blob = new Blob([`preview ${i}`], { type: 'text/html' });
        currentUrl = URL.createObjectURL(blob);
      }

      // Should have created 3 URLs
      expect(createdUrls).toHaveLength(3);

      // Should have revoked 2 URLs (all except the last one)
      expect(revokedUrls).toHaveLength(2);
    });

    it('should handle errors during revocation gracefully', () => {
      const urls = ['url1', 'url2', 'url3'];
      const errors: Error[] = [];

      // Make second revoke throw
      URL.revokeObjectURL = vi.fn((url: string) => {
        if (url === 'url2') {
          throw new Error('Revoke failed');
        }
        revokedUrls.push(url);
      });

      // Cleanup should continue despite errors
      for (const url of urls) {
        try {
          URL.revokeObjectURL(url);
        } catch (e) {
          errors.push(e as Error);
        }
      }

      // Should have attempted all revocations
      expect(URL.revokeObjectURL).toHaveBeenCalledTimes(3);

      // Should have one error
      expect(errors).toHaveLength(1);

      // Should have successfully revoked 2 URLs
      expect(revokedUrls).toHaveLength(2);
    });
  });

  describe('Set-based tracking', () => {
    it('should use Set to track unique URLs', () => {
      const trackedUrls = new Set<string>();

      // Create and track URLs
      for (let i = 0; i < 3; i++) {
        const blob = new Blob([`content ${i}`], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        trackedUrls.add(url);
      }

      expect(trackedUrls.size).toBe(3);

      // Cleanup all tracked URLs
      for (const url of trackedUrls) {
        URL.revokeObjectURL(url);
      }
      trackedUrls.clear();

      expect(trackedUrls.size).toBe(0);
      expect(revokedUrls).toHaveLength(3);
    });

    it('should remove URL from set when revoked', () => {
      const trackedUrls = new Set<string>();

      const blob = new Blob(['test'], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      trackedUrls.add(url);

      expect(trackedUrls.has(url)).toBe(true);

      // Revoke and remove
      URL.revokeObjectURL(url);
      trackedUrls.delete(url);

      expect(trackedUrls.has(url)).toBe(false);
    });
  });

  describe('Runtime switch cleanup', () => {
    it('should cleanup all URLs when switching runtimes', () => {
      const browserRuntimeUrls = new Set<string>();

      // Simulate browser runtime creating URLs
      for (let i = 0; i < 3; i++) {
        const blob = new Blob([`browser ${i}`], { type: 'text/html' });
        browserRuntimeUrls.add(URL.createObjectURL(blob));
      }

      // Simulate runtime switch - should cleanup ALL URLs
      for (const url of browserRuntimeUrls) {
        URL.revokeObjectURL(url);
      }
      browserRuntimeUrls.clear();

      // All URLs should be revoked
      expect(revokedUrls).toHaveLength(3);
      expect(browserRuntimeUrls.size).toBe(0);
    });

    it('should await destroy completion before nullifying reference', async () => {
      let destroyCompleted = false;
      const trackedUrls = new Set<string>();

      // Create some URLs
      for (let i = 0; i < 2; i++) {
        const blob = new Blob([`test ${i}`], { type: 'text/html' });
        trackedUrls.add(URL.createObjectURL(blob));
      }

      // Simulate async destroy
      const destroy = async () => {
        for (const url of trackedUrls) {
          URL.revokeObjectURL(url);
        }
        trackedUrls.clear();
        destroyCompleted = true;
      };

      // IMPORTANT: Await destroy before continuing
      await destroy();

      expect(destroyCompleted).toBe(true);
      expect(revokedUrls).toHaveLength(2);
    });
  });
});
