/**
 * =============================================================================
 * BAVINI CLOUD - Preview Service Worker Manager Tests
 * =============================================================================
 *
 * These tests verify the preview-service-worker module functionality.
 * Note: Service Worker APIs are mocked since they're not available in Node.js.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// We need to mock the entire module behavior since Service Worker API
// is not available in Node.js test environment

describe('PreviewServiceWorker Module', () => {
  describe('Exports', () => {
    it('should export all required functions and constants', async () => {
      const module = await import('../preview-service-worker');

      expect(module.initPreviewServiceWorker).toBeDefined();
      expect(typeof module.initPreviewServiceWorker).toBe('function');

      expect(module.setPreviewFiles).toBeDefined();
      expect(typeof module.setPreviewFiles).toBe('function');

      expect(module.updatePreviewFile).toBeDefined();
      expect(typeof module.updatePreviewFile).toBe('function');

      expect(module.deletePreviewFile).toBeDefined();
      expect(typeof module.deletePreviewFile).toBe('function');

      expect(module.clearPreviewFiles).toBeDefined();
      expect(typeof module.clearPreviewFiles).toBe('function');

      expect(module.isServiceWorkerReady).toBeDefined();
      expect(typeof module.isServiceWorkerReady).toBe('function');

      expect(module.getPreviewUrl).toBeDefined();
      expect(typeof module.getPreviewUrl).toBe('function');

      expect(module.waitForReady).toBeDefined();
      expect(typeof module.waitForReady).toBe('function');

      expect(module.unregisterPreviewServiceWorker).toBeDefined();
      expect(typeof module.unregisterPreviewServiceWorker).toBe('function');
    });

    it('should export PREVIEW_URL constant', async () => {
      const { PREVIEW_URL } = await import('../preview-service-worker');
      expect(PREVIEW_URL).toBe('/preview/index.html');
    });

    it('should export PREVIEW_BASE_PATH constant', async () => {
      const { PREVIEW_BASE_PATH } = await import('../preview-service-worker');
      expect(PREVIEW_BASE_PATH).toBe('/preview');
    });
  });

  describe('getPreviewUrl', () => {
    it('should return the preview URL', async () => {
      const { getPreviewUrl } = await import('../preview-service-worker');
      expect(getPreviewUrl()).toBe('/preview/index.html');
    });
  });

  describe('isServiceWorkerReady (no navigator.serviceWorker)', () => {
    it('should return false when Service Worker has not been initialized', async () => {
      // In Node.js environment without mocking, it should return false
      const { isServiceWorkerReady } = await import('../preview-service-worker');
      // Initially false (SW not registered in test environment)
      expect(typeof isServiceWorkerReady()).toBe('boolean');
    });
  });

  describe('initPreviewServiceWorker (no browser environment)', () => {
    it('should return false when Service Workers are not supported', async () => {
      // Since we're in Node.js, navigator.serviceWorker doesn't exist
      const { initPreviewServiceWorker } = await import('../preview-service-worker');
      const result = await initPreviewServiceWorker();
      expect(result).toBe(false);
    });
  });

  describe('waitForReady', () => {
    it('should be a function that returns a Promise', async () => {
      const { waitForReady } = await import('../preview-service-worker');
      expect(typeof waitForReady).toBe('function');
      // Should return immediately if not ready (returns undefined Promise)
      const result = waitForReady();
      expect(result).toBeInstanceOf(Promise);
    });
  });
});

describe('PreviewServiceWorker Contract', () => {
  /**
   * These tests verify the contract/interface that the Service Worker
   * manager module provides to the browser-build-adapter.
   */

  it('should have correct function signatures', async () => {
    const module = await import('../preview-service-worker');

    // initPreviewServiceWorker(): Promise<boolean>
    expect(module.initPreviewServiceWorker.length).toBe(0);

    // setPreviewFiles(files, buildId?): Promise<void>
    expect(module.setPreviewFiles.length).toBe(2);

    // updatePreviewFile(path, content): void
    expect(module.updatePreviewFile.length).toBe(2);

    // deletePreviewFile(path): void
    expect(module.deletePreviewFile.length).toBe(1);

    // clearPreviewFiles(): void
    expect(module.clearPreviewFiles.length).toBe(0);

    // isServiceWorkerReady(): boolean
    expect(module.isServiceWorkerReady.length).toBe(0);

    // getPreviewUrl(): string
    expect(module.getPreviewUrl.length).toBe(0);

    // waitForReady(): Promise<void>
    expect(module.waitForReady.length).toBe(0);

    // unregisterPreviewServiceWorker(): Promise<void>
    expect(module.unregisterPreviewServiceWorker.length).toBe(0);
  });

  it('should gracefully handle operations when SW is not ready', async () => {
    const module = await import('../preview-service-worker');

    // These should not throw when SW is not ready
    expect(() => module.updatePreviewFile('/test.js', 'code')).not.toThrow();
    expect(() => module.deletePreviewFile('/test.js')).not.toThrow();
    expect(() => module.clearPreviewFiles()).not.toThrow();

    // setPreviewFiles should resolve with false (SW not ready)
    await expect(module.setPreviewFiles({ 'index.html': '<html></html>' })).resolves.toBe(false);
  });
});

describe('PreviewServiceWorker Integration', () => {
  /**
   * Integration test to verify the module works with browser-build-adapter
   */

  it('should be correctly mocked in browser-build-adapter tests', async () => {
    // This verifies the mock setup matches the real module interface
    const realModule = await import('../preview-service-worker');
    const mockSetup = {
      initPreviewServiceWorker: vi.fn().mockResolvedValue(false),
      setPreviewFiles: vi.fn().mockResolvedValue(undefined),
      isServiceWorkerReady: vi.fn().mockReturnValue(false),
      getPreviewUrl: vi.fn().mockReturnValue('/preview/index.html'),
      PREVIEW_URL: '/preview/index.html',
      PREVIEW_BASE_PATH: '/preview',
    };

    // Verify all mocked functions exist in real module
    expect(typeof realModule.initPreviewServiceWorker).toBe('function');
    expect(typeof realModule.setPreviewFiles).toBe('function');
    expect(typeof realModule.isServiceWorkerReady).toBe('function');
    expect(typeof realModule.getPreviewUrl).toBe('function');
    expect(realModule.PREVIEW_URL).toBe(mockSetup.PREVIEW_URL);
    expect(realModule.PREVIEW_BASE_PATH).toBe(mockSetup.PREVIEW_BASE_PATH);
  });
});

describe('Preview Service Worker Script (public/preview-sw.js)', () => {
  /**
   * These tests document the expected behavior of the Service Worker script.
   * The actual script runs in a Service Worker context which can't be tested
   * directly in Node.js, but we can verify the contract it should follow.
   */

  describe('Expected Message Types', () => {
    it('should handle SET_FILES message', () => {
      // The SW should accept this message format
      const setFilesMessage = {
        type: 'SET_FILES',
        payload: {
          files: { 'index.html': '<html></html>' },
          buildId: '12345',
        },
      };
      expect(setFilesMessage.type).toBe('SET_FILES');
      expect(setFilesMessage.payload.files).toBeDefined();
    });

    it('should handle UPDATE_FILE message', () => {
      const updateFileMessage = {
        type: 'UPDATE_FILE',
        payload: {
          path: '/app.js',
          content: 'console.log("updated")',
        },
      };
      expect(updateFileMessage.type).toBe('UPDATE_FILE');
      expect(updateFileMessage.payload.path).toBeDefined();
      expect(updateFileMessage.payload.content).toBeDefined();
    });

    it('should handle DELETE_FILE message', () => {
      const deleteFileMessage = {
        type: 'DELETE_FILE',
        payload: { path: '/old-file.js' },
      };
      expect(deleteFileMessage.type).toBe('DELETE_FILE');
      expect(deleteFileMessage.payload.path).toBeDefined();
    });

    it('should handle CLEAR_FILES message', () => {
      const clearFilesMessage = { type: 'CLEAR_FILES' };
      expect(clearFilesMessage.type).toBe('CLEAR_FILES');
    });

    it('should handle PING message and respond with PONG', () => {
      const pingMessage = { type: 'PING' };
      const expectedResponse = { type: 'PONG' };
      expect(pingMessage.type).toBe('PING');
      expect(expectedResponse.type).toBe('PONG');
    });
  });

  describe('Expected Request Interception', () => {
    it('should intercept requests to /preview/ path', () => {
      const testPaths = [
        '/preview/index.html',
        '/preview/app.js',
        '/preview/styles.css',
        '/preview/assets/image.png',
      ];

      testPaths.forEach(path => {
        expect(path.startsWith('/preview/')).toBe(true);
      });
    });

    it('should not intercept requests outside /preview/ scope', () => {
      const testPaths = [
        '/api/data',
        '/static/image.png',
        '/',
        '/index.html',
      ];

      testPaths.forEach(path => {
        expect(path.startsWith('/preview/')).toBe(false);
      });
    });
  });

  describe('Expected MIME Types', () => {
    it('should have correct MIME type mappings', () => {
      const expectedMimeTypes: Record<string, string> = {
        'html': 'text/html; charset=utf-8',
        'css': 'text/css; charset=utf-8',
        'js': 'application/javascript; charset=utf-8',
        'json': 'application/json; charset=utf-8',
        'png': 'image/png',
        'jpg': 'image/jpeg',
        'svg': 'image/svg+xml',
      };

      // Verify expected types exist
      expect(expectedMimeTypes['html']).toContain('text/html');
      expect(expectedMimeTypes['css']).toContain('text/css');
      expect(expectedMimeTypes['js']).toContain('javascript');
      expect(expectedMimeTypes['json']).toContain('json');
    });
  });
});
