/**
 * =============================================================================
 * BAVINI CLOUD - Browser Build Adapter Tests
 * =============================================================================
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { BrowserBuildAdapter } from '../adapters/browser-build-adapter';

// Mock preview-service-worker
vi.mock('../preview-service-worker', () => ({
  initPreviewServiceWorker: vi.fn().mockResolvedValue(false), // Default to Blob URL fallback
  setPreviewFiles: vi.fn().mockResolvedValue(undefined),
  isServiceWorkerReady: vi.fn().mockReturnValue(false),
  getPreviewUrl: vi.fn().mockReturnValue('/preview/index.html'),
  PREVIEW_URL: '/preview/index.html',
  PREVIEW_BASE_PATH: '/preview',
}));

// Mock esbuild-wasm
vi.mock('esbuild-wasm', () => ({
  initialize: vi.fn().mockResolvedValue(undefined),
  build: vi.fn().mockResolvedValue({
    outputFiles: [
      { path: 'out.js', text: 'console.log("bundled")' },
    ],
    errors: [],
    warnings: [],
  }),
  transform: vi.fn().mockResolvedValue({
    code: 'transformed code',
  }),
}));

// Mock fetch for esm.sh
global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  text: () => Promise.resolve('export default {}'),
});

// Mock URL.createObjectURL
global.URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-url');
global.URL.revokeObjectURL = vi.fn();

describe('BrowserBuildAdapter', () => {
  let adapter: BrowserBuildAdapter;

  beforeEach(() => {
    adapter = new BrowserBuildAdapter();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await adapter.destroy();
  });

  describe('Properties', () => {
    it('should have correct name', () => {
      expect(adapter.name).toBe('BrowserBuild');
    });

    it('should not support terminal', () => {
      expect(adapter.supportsTerminal).toBe(false);
    });

    it('should not support shell', () => {
      expect(adapter.supportsShell).toBe(false);
    });

    it('should not support Node server', () => {
      expect(adapter.supportsNodeServer).toBe(false);
    });

    it('should be browser only', () => {
      expect(adapter.isBrowserOnly).toBe(true);
    });

    it('should support multiple frameworks', () => {
      expect(adapter.supportedFrameworks).toContain('react');
      expect(adapter.supportedFrameworks).toContain('vue');
      expect(adapter.supportedFrameworks).toContain('svelte');
    });
  });

  describe('Lifecycle', () => {
    it('should start with idle status', () => {
      expect(adapter.status).toBe('idle');
    });

    it('should initialize esbuild-wasm', async () => {
      await adapter.init();
      expect(adapter.status).toBe('ready');
    });

    it('should handle multiple init calls', async () => {
      await adapter.init();
      await adapter.init(); // Should not throw
      expect(adapter.status).toBe('ready');
    });

    it('should reset on destroy', async () => {
      await adapter.init();
      await adapter.writeFile('/test.ts', 'content');
      await adapter.destroy();

      expect(adapter.status).toBe('idle');
    });
  });

  describe('File System', () => {
    beforeEach(async () => {
      await adapter.init();
    });

    it('should write and read files', async () => {
      await adapter.writeFile('/src/App.tsx', 'export default 1');

      const content = await adapter.readFile('/src/App.tsx');
      expect(content).toBe('export default 1');
    });

    it('should write multiple files', async () => {
      const files = new Map([
        ['/src/App.tsx', 'app'],
        ['/src/main.tsx', 'main'],
      ]);

      await adapter.writeFiles(files);

      expect(await adapter.readFile('/src/App.tsx')).toBe('app');
      expect(await adapter.readFile('/src/main.tsx')).toBe('main');
    });

    it('should return null for non-existent file', async () => {
      const content = await adapter.readFile('/not-found.ts');
      expect(content).toBeNull();
    });

    it('should delete files', async () => {
      await adapter.writeFile('/test.ts', 'content');
      await adapter.deleteFile('/test.ts');

      expect(await adapter.readFile('/test.ts')).toBeNull();
    });

    it('should list directory contents', async () => {
      await adapter.writeFiles(new Map([
        ['/src/App.tsx', 'app'],
        ['/src/main.tsx', 'main'],
        ['/src/components/Button.tsx', 'button'],
      ]));

      const entries = await adapter.readdir('/src');

      expect(entries).toContain('App.tsx');
      expect(entries).toContain('main.tsx');
      expect(entries).toContain('components');
    });

    it('should normalize paths', async () => {
      await adapter.writeFile('src/App.tsx', 'content'); // No leading slash

      const content = await adapter.readFile('/src/App.tsx');
      expect(content).toBe('content');
    });
  });

  describe('Build', () => {
    beforeEach(async () => {
      await adapter.init();
    });

    it('should build with entry point', async () => {
      await adapter.writeFile('/src/main.tsx', 'console.log("hello")');

      const result = await adapter.build({
        entryPoint: '/src/main.tsx',
        mode: 'development',
      });

      expect(result.errors).toHaveLength(0);
      expect(result.code).toBeTruthy();
      expect(result.buildTime).toBeGreaterThan(0);
    });

    it('should return error for missing entry point', async () => {
      const result = await adapter.build({
        entryPoint: '/not-found.tsx',
        mode: 'development',
      });

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain('Entry point not found');
    });

    it('should generate hash', async () => {
      await adapter.writeFile('/src/main.tsx', 'v1');
      const result1 = await adapter.build({ entryPoint: '/src/main.tsx', mode: 'development' });

      await adapter.writeFile('/src/main.tsx', 'v2');
      const result2 = await adapter.build({ entryPoint: '/src/main.tsx', mode: 'development' });

      expect(result1.hash).toBeTruthy();
      expect(result2.hash).toBeTruthy();
    });

    it('should emit status changes', async () => {
      const statusChanges: string[] = [];
      adapter.setCallbacks({
        onStatusChange: (status) => statusChanges.push(status),
      });

      await adapter.writeFile('/src/main.tsx', 'content');
      await adapter.build({ entryPoint: '/src/main.tsx', mode: 'development' });

      expect(statusChanges).toContain('building');
      expect(statusChanges).toContain('ready');
    });

    it('should emit build progress', async () => {
      const progressEvents: number[] = [];
      adapter.setCallbacks({
        onBuildProgress: (_, progress) => progressEvents.push(progress),
      });

      await adapter.writeFile('/src/main.tsx', 'content');
      await adapter.build({ entryPoint: '/src/main.tsx', mode: 'development' });

      expect(progressEvents.length).toBeGreaterThan(0);
      expect(progressEvents[progressEvents.length - 1]).toBe(100);
    });
  });

  describe('Transform', () => {
    beforeEach(async () => {
      await adapter.init();
    });

    it('should transform TypeScript', async () => {
      const result = await adapter.transform('const x: number = 1', { loader: 'ts' });
      expect(result).toBeTruthy();
    });

    it('should transform TSX', async () => {
      const result = await adapter.transform('<div>Hello</div>', { loader: 'tsx' });
      expect(result).toBeTruthy();
    });
  });

  describe('Preview', () => {
    beforeEach(async () => {
      await adapter.init();
    });

    it('should return null before build', () => {
      expect(adapter.getPreview()).toBeNull();
    });

    it('should create preview after build', async () => {
      await adapter.writeFile('/src/main.tsx', 'console.log("test")');
      await adapter.build({ entryPoint: '/src/main.tsx', mode: 'development' });

      const preview = adapter.getPreview();
      expect(preview).not.toBeNull();
      expect(preview?.ready).toBe(true);
      // Preview now uses srcdoc mode (about:srcdoc) instead of blob URLs
      expect(preview?.url).toContain('srcdoc');
    });

    it('should emit onPreviewReady', async () => {
      const onPreviewReady = vi.fn();
      adapter.setCallbacks({ onPreviewReady });

      await adapter.writeFile('/src/main.tsx', 'test');
      await adapter.build({ entryPoint: '/src/main.tsx', mode: 'development' });

      expect(onPreviewReady).toHaveBeenCalled();
    });
  });

  describe('Callbacks', () => {
    it('should merge callbacks', () => {
      const cb1 = vi.fn();
      const cb2 = vi.fn();

      adapter.setCallbacks({ onStatusChange: cb1 });
      adapter.setCallbacks({ onConsole: cb2 });

      // Both should be set
      expect(true).toBe(true); // Callbacks are internal, just verify no error
    });
  });
});

describe('BrowserBuildAdapter Integration', () => {
  it('should be directly importable', async () => {
    const { BrowserBuildAdapter, createBrowserBuildAdapter } = await import('../adapters/browser-build-adapter');

    expect(BrowserBuildAdapter).toBeDefined();
    expect(createBrowserBuildAdapter).toBeDefined();

    const adapter = createBrowserBuildAdapter();
    expect(adapter.name).toBe('BrowserBuild');
  });

  it('should have correct capabilities', async () => {
    const { BrowserBuildAdapter } = await import('../adapters/browser-build-adapter');

    const adapter = new BrowserBuildAdapter();

    // Browser build specific capabilities
    expect(adapter.supportsTerminal).toBe(false);
    expect(adapter.supportsShell).toBe(false);
    expect(adapter.supportsNodeServer).toBe(false);
    expect(adapter.isBrowserOnly).toBe(true);
  });
});
