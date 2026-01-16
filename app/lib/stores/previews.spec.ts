import { describe, expect, it, beforeEach, vi } from 'vitest';
import { atom } from 'nanostores';

// Mock the webcontainer module before importing
vi.mock('~/lib/webcontainer', () => ({
  webcontainer: Promise.resolve({
    on: vi.fn(),
  }),
}));

// Mock devices module
vi.mock('~/utils/devices', () => ({
  DEFAULT_DEVICE_ID: 'desktop',
  DEVICE_PRESETS: [
    { id: 'desktop', name: 'Desktop', type: 'desktop', width: 1280, height: 800 },
    { id: 'ipad', name: 'iPad', type: 'tablet', width: 768, height: 1024 },
    { id: 'iphone', name: 'iPhone', type: 'mobile', width: 375, height: 812 },
  ],
}));

describe('previews store', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  describe('PreviewsStore class', () => {
    it('should initialize with empty previews', async () => {
      const mockWebContainer = {
        on: vi.fn(),
      };

      const { PreviewsStore } = await import('./previews');
      const store = new PreviewsStore(Promise.resolve(mockWebContainer as any));

      expect(store.previews.get()).toEqual([]);
    });

    it('should register port listener on init', async () => {
      const onMock = vi.fn();
      const mockWebContainer = {
        on: onMock,
      };

      const { PreviewsStore } = await import('./previews');
      const store = new PreviewsStore(Promise.resolve(mockWebContainer as any));

      // Explicitly call init() to trigger lazy initialization
      store.init();

      // Wait for async init
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(onMock).toHaveBeenCalledWith('port', expect.any(Function));
    });
  });

  describe('device preview atoms', () => {
    it('should have default device as desktop', async () => {
      const { selectedDeviceId } = await import('./previews');

      expect(selectedDeviceId.get()).toBe('desktop');
    });

    it('should have default orientation as portrait', async () => {
      const { deviceOrientation } = await import('./previews');

      expect(deviceOrientation.get()).toBe('portrait');
    });

    it('should allow changing selected device', async () => {
      const { selectedDeviceId } = await import('./previews');

      selectedDeviceId.set('iphone');

      expect(selectedDeviceId.get()).toBe('iphone');
    });

    it('should allow changing orientation', async () => {
      const { deviceOrientation } = await import('./previews');

      deviceOrientation.set('landscape');

      expect(deviceOrientation.get()).toBe('landscape');
    });

    it('should toggle orientation', async () => {
      const { deviceOrientation } = await import('./previews');

      const initial = deviceOrientation.get();
      deviceOrientation.set(initial === 'portrait' ? 'landscape' : 'portrait');

      expect(deviceOrientation.get()).not.toBe(initial);
    });
  });

  describe('PreviewInfo type', () => {
    it('should handle preview info structure', async () => {
      const previewInfo = {
        port: 3000,
        ready: true,
        baseUrl: 'http://localhost:3000',
      };

      expect(previewInfo.port).toBe(3000);
      expect(previewInfo.ready).toBe(true);
      expect(previewInfo.baseUrl).toBe('http://localhost:3000');
    });
  });

  describe('port event handling', () => {
    it('should add preview on port open event', async () => {
      let portCallback: ((port: number, type: string, url: string) => void) | undefined;

      const mockWebContainer = {
        on: vi.fn((event: string, callback: any) => {
          if (event === 'port') {
            portCallback = callback;
          }
        }),
      };

      const { PreviewsStore } = await import('./previews');
      const store = new PreviewsStore(Promise.resolve(mockWebContainer as any));

      // Explicitly call init() to trigger lazy initialization
      store.init();

      // Wait for async init
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Simulate port open
      portCallback?.(3000, 'open', 'http://localhost:3000');

      const previews = store.previews.get();

      expect(previews).toHaveLength(1);
      expect(previews[0].port).toBe(3000);
      expect(previews[0].ready).toBe(true);
      expect(previews[0].baseUrl).toBe('http://localhost:3000');
    });

    it('should remove preview on port close event', async () => {
      let portCallback: ((port: number, type: string, url: string) => void) | undefined;

      const mockWebContainer = {
        on: vi.fn((event: string, callback: any) => {
          if (event === 'port') {
            portCallback = callback;
          }
        }),
      };

      const { PreviewsStore } = await import('./previews');
      const store = new PreviewsStore(Promise.resolve(mockWebContainer as any));

      // Explicitly call init() to trigger lazy initialization
      store.init();

      // Wait for async init
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Add preview
      portCallback?.(3000, 'open', 'http://localhost:3000');

      expect(store.previews.get()).toHaveLength(1);

      // Remove preview
      portCallback?.(3000, 'close', '');

      expect(store.previews.get()).toHaveLength(0);
    });

    it('should update existing preview on subsequent open', async () => {
      let portCallback: ((port: number, type: string, url: string) => void) | undefined;

      const mockWebContainer = {
        on: vi.fn((event: string, callback: any) => {
          if (event === 'port') {
            portCallback = callback;
          }
        }),
      };

      const { PreviewsStore } = await import('./previews');
      const store = new PreviewsStore(Promise.resolve(mockWebContainer as any));

      // Explicitly call init() to trigger lazy initialization
      store.init();

      // Wait for async init
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Add preview
      portCallback?.(3000, 'open', 'http://localhost:3000');

      // Update with new URL
      portCallback?.(3000, 'open', 'http://localhost:3000/new-path');

      const previews = store.previews.get();

      expect(previews).toHaveLength(1);
      expect(previews[0].baseUrl).toBe('http://localhost:3000/new-path');
    });

    it('should handle multiple ports', async () => {
      let portCallback: ((port: number, type: string, url: string) => void) | undefined;

      const mockWebContainer = {
        on: vi.fn((event: string, callback: any) => {
          if (event === 'port') {
            portCallback = callback;
          }
        }),
      };

      const { PreviewsStore } = await import('./previews');
      const store = new PreviewsStore(Promise.resolve(mockWebContainer as any));

      // Explicitly call init() to trigger lazy initialization
      store.init();

      // Wait for async init
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Add multiple ports
      portCallback?.(3000, 'open', 'http://localhost:3000');
      portCallback?.(3001, 'open', 'http://localhost:3001');
      portCallback?.(5173, 'open', 'http://localhost:5173');

      const previews = store.previews.get();

      expect(previews).toHaveLength(3);
      expect(previews.map((p) => p.port)).toContain(3000);
      expect(previews.map((p) => p.port)).toContain(3001);
      expect(previews.map((p) => p.port)).toContain(5173);
    });
  });
});
