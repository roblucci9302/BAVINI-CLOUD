/**
 * =============================================================================
 * BAVINI CLOUD - Runtime Adapter Reference Tests
 * =============================================================================
 * Tests de référence pour documenter le comportement attendu du RuntimeAdapter.
 * Ces tests serviront de base pour valider la compatibilité du BrowserBuildAdapter.
 * =============================================================================
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type {
  RuntimeAdapter,
  RuntimeCallbacks,
} from '../adapter';
import type {
  FileMap,
  BundleResult,
  BuildOptions,
  TransformOptions,
  PreviewInfo,
  RuntimeStatus,
  ConsoleLog,
  RuntimeError,
  Loader,
} from '../types';

/**
 * Mock RuntimeAdapter pour les tests unitaires.
 * Simule le comportement attendu de tout RuntimeAdapter.
 */
class MockRuntimeAdapter implements RuntimeAdapter {
  readonly name = 'MockAdapter';
  private _status: RuntimeStatus = 'idle';
  private _callbacks: RuntimeCallbacks = {};
  private _files: Map<string, string> = new Map();
  private _preview: PreviewInfo | null = null;

  readonly supportsTerminal = true;
  readonly supportsShell = true;
  readonly supportsNodeServer = true;
  readonly isBrowserOnly = true;
  readonly supportedFrameworks = ['react', 'vue', 'svelte', 'vanilla'];

  get status(): RuntimeStatus {
    return this._status;
  }

  async init(): Promise<void> {
    this._status = 'initializing';
    // Simulate async initialization
    await new Promise((resolve) => setTimeout(resolve, 10));
    this._status = 'ready';
    this._callbacks.onStatusChange?.('ready');
  }

  async destroy(): Promise<void> {
    this._status = 'idle';
    this._files.clear();
    this._preview = null;
    this._callbacks = {};
  }

  async writeFiles(files: FileMap): Promise<void> {
    for (const [path, content] of files) {
      this._files.set(path, content);
    }
  }

  async writeFile(path: string, content: string): Promise<void> {
    this._files.set(path, content);
  }

  async readFile(path: string): Promise<string | null> {
    return this._files.get(path) ?? null;
  }

  async deleteFile(path: string): Promise<void> {
    this._files.delete(path);
  }

  async readdir(path: string): Promise<string[]> {
    const entries: string[] = [];
    const normalizedPath = path.endsWith('/') ? path : path + '/';

    for (const filePath of this._files.keys()) {
      if (filePath.startsWith(normalizedPath)) {
        const relativePath = filePath.substring(normalizedPath.length);
        const firstPart = relativePath.split('/')[0];

        if (firstPart && !entries.includes(firstPart)) {
          entries.push(firstPart);
        }
      }
    }

    return entries;
  }

  async build(options: BuildOptions): Promise<BundleResult> {
    const startTime = performance.now();
    this._status = 'building';
    this._callbacks.onStatusChange?.('building');
    this._callbacks.onBuildProgress?.('bundling', 0);

    const entryContent = this._files.get(options.entryPoint);

    if (!entryContent) {
      this._status = 'error';

      return {
        code: '',
        css: '',
        errors: [
          {
            message: `Entry point not found: ${options.entryPoint}`,
            file: options.entryPoint,
          },
        ],
        warnings: [],
        buildTime: performance.now() - startTime,
        hash: '',
      };
    }

    this._callbacks.onBuildProgress?.('bundling', 50);

    // Simulate build
    await new Promise((resolve) => setTimeout(resolve, 10));

    this._callbacks.onBuildProgress?.('bundling', 100);
    this._status = 'ready';
    this._callbacks.onStatusChange?.('ready');

    const hash = this.simpleHash(entryContent);

    // Update preview
    this._preview = {
      url: `blob:mock-${hash}`,
      ready: true,
      updatedAt: Date.now(),
    };
    this._callbacks.onPreviewReady?.(this._preview);

    return {
      code: `// Bundled: ${options.entryPoint}\n${entryContent}`,
      css: '',
      errors: [],
      warnings: [],
      buildTime: performance.now() - startTime,
      hash,
    };
  }

  async transform(code: string, options: TransformOptions): Promise<string> {
    // Simulate transformation (just return the code for mock)
    return `// Transformed (${options.loader})\n${code}`;
  }

  getPreview(): PreviewInfo | null {
    return this._preview;
  }

  async refreshPreview(): Promise<void> {
    if (this._preview) {
      this._preview = {
        ...this._preview,
        updatedAt: Date.now(),
      };
      this._callbacks.onPreviewReady?.(this._preview);
    }
  }

  setCallbacks(callbacks: RuntimeCallbacks): void {
    this._callbacks = { ...this._callbacks, ...callbacks };
  }

  // Helper method to emit console logs for testing
  emitTestConsole(log: ConsoleLog): void {
    this._callbacks.onConsole?.(log);
  }

  // Helper method to emit errors for testing
  emitTestError(error: RuntimeError): void {
    this._callbacks.onError?.(error);
  }

  private simpleHash(str: string): string {
    let hash = 0;

    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }

    return Math.abs(hash).toString(16);
  }
}

describe('RuntimeAdapter Interface', () => {
  let adapter: MockRuntimeAdapter;

  beforeEach(() => {
    adapter = new MockRuntimeAdapter();
  });

  afterEach(async () => {
    await adapter.destroy();
  });

  // ===========================================================================
  // LIFECYCLE TESTS
  // ===========================================================================

  describe('Lifecycle', () => {
    it('should start with idle status', () => {
      expect(adapter.status).toBe('idle');
    });

    it('should transition to ready after init()', async () => {
      await adapter.init();
      expect(adapter.status).toBe('ready');
    });

    it('should call onStatusChange callback during init', async () => {
      const onStatusChange = vi.fn();
      adapter.setCallbacks({ onStatusChange });

      await adapter.init();

      expect(onStatusChange).toHaveBeenCalledWith('ready');
    });

    it('should reset to idle after destroy()', async () => {
      await adapter.init();
      expect(adapter.status).toBe('ready');

      await adapter.destroy();
      expect(adapter.status).toBe('idle');
    });

    it('should clear files after destroy()', async () => {
      await adapter.init();
      await adapter.writeFile('/test.ts', 'content');

      expect(await adapter.readFile('/test.ts')).toBe('content');

      await adapter.destroy();

      // Re-initialize to read
      await adapter.init();
      expect(await adapter.readFile('/test.ts')).toBeNull();
    });
  });

  // ===========================================================================
  // FILE SYSTEM TESTS
  // ===========================================================================

  describe('File System', () => {
    beforeEach(async () => {
      await adapter.init();
    });

    it('should write and read a single file', async () => {
      await adapter.writeFile('/src/App.tsx', 'export default () => <div>Hello</div>');

      const content = await adapter.readFile('/src/App.tsx');
      expect(content).toBe('export default () => <div>Hello</div>');
    });

    it('should write multiple files at once', async () => {
      const files: FileMap = new Map([
        ['/src/App.tsx', 'export default App'],
        ['/src/main.tsx', 'import App from "./App"'],
        ['/package.json', '{"name": "test"}'],
      ]);

      await adapter.writeFiles(files);

      expect(await adapter.readFile('/src/App.tsx')).toBe('export default App');
      expect(await adapter.readFile('/src/main.tsx')).toBe('import App from "./App"');
      expect(await adapter.readFile('/package.json')).toBe('{"name": "test"}');
    });

    it('should return null for non-existent file', async () => {
      const content = await adapter.readFile('/does-not-exist.ts');
      expect(content).toBeNull();
    });

    it('should delete a file', async () => {
      await adapter.writeFile('/test.ts', 'content');
      expect(await adapter.readFile('/test.ts')).toBe('content');

      await adapter.deleteFile('/test.ts');
      expect(await adapter.readFile('/test.ts')).toBeNull();
    });

    it('should overwrite existing file', async () => {
      await adapter.writeFile('/test.ts', 'original');
      await adapter.writeFile('/test.ts', 'updated');

      expect(await adapter.readFile('/test.ts')).toBe('updated');
    });

    it('should list directory contents', async () => {
      await adapter.writeFiles(
        new Map([
          ['/src/App.tsx', 'app'],
          ['/src/main.tsx', 'main'],
          ['/src/components/Button.tsx', 'button'],
          ['/package.json', 'pkg'],
        ]),
      );

      const rootEntries = await adapter.readdir('/');
      expect(rootEntries).toContain('src');
      expect(rootEntries).toContain('package.json');

      const srcEntries = await adapter.readdir('/src');
      expect(srcEntries).toContain('App.tsx');
      expect(srcEntries).toContain('main.tsx');
      expect(srcEntries).toContain('components');
    });
  });

  // ===========================================================================
  // BUILD TESTS
  // ===========================================================================

  describe('Build', () => {
    beforeEach(async () => {
      await adapter.init();
    });

    it('should build a simple React app', async () => {
      await adapter.writeFile('/src/main.tsx', 'import React from "react"; export default () => <div>Hello</div>');

      const result = await adapter.build({
        entryPoint: '/src/main.tsx',
        mode: 'development',
      });

      expect(result.errors).toHaveLength(0);
      expect(result.code).toContain('Hello');
      expect(result.buildTime).toBeGreaterThan(0);
      expect(result.hash).toBeTruthy();
    });

    it('should return error for missing entry point', async () => {
      const result = await adapter.build({
        entryPoint: '/missing.tsx',
        mode: 'development',
      });

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('Entry point not found');
      expect(result.code).toBe('');
    });

    it('should update status during build', async () => {
      const statusChanges: RuntimeStatus[] = [];
      adapter.setCallbacks({
        onStatusChange: (status) => statusChanges.push(status),
      });

      await adapter.writeFile('/src/main.tsx', 'export default 1');
      await adapter.build({ entryPoint: '/src/main.tsx', mode: 'development' });

      expect(statusChanges).toContain('building');
      expect(statusChanges).toContain('ready');
    });

    it('should emit build progress', async () => {
      const progressEvents: { phase: string; progress: number }[] = [];
      adapter.setCallbacks({
        onBuildProgress: (phase, progress) => progressEvents.push({ phase, progress }),
      });

      await adapter.writeFile('/src/main.tsx', 'export default 1');
      await adapter.build({ entryPoint: '/src/main.tsx', mode: 'development' });

      expect(progressEvents.length).toBeGreaterThan(0);
      expect(progressEvents[progressEvents.length - 1].progress).toBe(100);
    });

    it('should generate different hash for different content', async () => {
      await adapter.writeFile('/src/main.tsx', 'version 1');
      const result1 = await adapter.build({ entryPoint: '/src/main.tsx', mode: 'development' });

      await adapter.writeFile('/src/main.tsx', 'version 2');
      const result2 = await adapter.build({ entryPoint: '/src/main.tsx', mode: 'development' });

      expect(result1.hash).not.toBe(result2.hash);
    });
  });

  // ===========================================================================
  // TRANSFORM TESTS
  // ===========================================================================

  describe('Transform', () => {
    beforeEach(async () => {
      await adapter.init();
    });

    it('should transform TypeScript code', async () => {
      const code = 'const x: number = 1;';
      const result = await adapter.transform(code, { loader: 'ts' });

      expect(result).toContain(code);
    });

    it('should transform TSX code', async () => {
      const code = 'const App = () => <div>Hello</div>';
      const result = await adapter.transform(code, { loader: 'tsx' });

      expect(result).toContain(code);
    });

    it('should support all loader types', async () => {
      const loaders: Loader[] = ['ts', 'tsx', 'js', 'jsx', 'css', 'json', 'text'];

      for (const loader of loaders) {
        const result = await adapter.transform('test', { loader });
        expect(result).toBeTruthy();
      }
    });
  });

  // ===========================================================================
  // PREVIEW TESTS
  // ===========================================================================

  describe('Preview', () => {
    beforeEach(async () => {
      await adapter.init();
    });

    it('should return null preview before build', () => {
      expect(adapter.getPreview()).toBeNull();
    });

    it('should have preview after successful build', async () => {
      await adapter.writeFile('/src/main.tsx', 'export default 1');
      await adapter.build({ entryPoint: '/src/main.tsx', mode: 'development' });

      const preview = adapter.getPreview();
      expect(preview).not.toBeNull();
      expect(preview?.ready).toBe(true);
      expect(preview?.url).toBeTruthy();
    });

    it('should emit onPreviewReady callback', async () => {
      const onPreviewReady = vi.fn();
      adapter.setCallbacks({ onPreviewReady });

      await adapter.writeFile('/src/main.tsx', 'export default 1');
      await adapter.build({ entryPoint: '/src/main.tsx', mode: 'development' });

      expect(onPreviewReady).toHaveBeenCalled();
      expect(onPreviewReady.mock.calls[0][0].ready).toBe(true);
    });

    it('should refresh preview', async () => {
      await adapter.writeFile('/src/main.tsx', 'export default 1');
      await adapter.build({ entryPoint: '/src/main.tsx', mode: 'development' });

      const preview1 = adapter.getPreview();
      const updatedAt1 = preview1?.updatedAt;

      await new Promise((resolve) => setTimeout(resolve, 10));
      await adapter.refreshPreview();

      const preview2 = adapter.getPreview();
      expect(preview2?.updatedAt).toBeGreaterThan(updatedAt1!);
    });
  });

  // ===========================================================================
  // CALLBACK TESTS
  // ===========================================================================

  describe('Callbacks', () => {
    beforeEach(async () => {
      await adapter.init();
    });

    it('should emit console logs', () => {
      const onConsole = vi.fn();
      adapter.setCallbacks({ onConsole });

      adapter.emitTestConsole({
        type: 'log',
        args: ['Hello', 'World'],
        timestamp: Date.now(),
      });

      expect(onConsole).toHaveBeenCalled();
      expect(onConsole.mock.calls[0][0].args).toEqual(['Hello', 'World']);
    });

    it('should emit runtime errors', () => {
      const onError = vi.fn();
      adapter.setCallbacks({ onError });

      adapter.emitTestError({
        message: 'TypeError: undefined is not a function',
        filename: '/src/App.tsx',
        lineno: 10,
        colno: 5,
      });

      expect(onError).toHaveBeenCalled();
      expect(onError.mock.calls[0][0].message).toContain('TypeError');
    });

    it('should merge callbacks instead of replacing', () => {
      const onConsole = vi.fn();
      const onError = vi.fn();

      adapter.setCallbacks({ onConsole });
      adapter.setCallbacks({ onError });

      adapter.emitTestConsole({ type: 'log', args: [], timestamp: Date.now() });
      adapter.emitTestError({ message: 'Error' });

      expect(onConsole).toHaveBeenCalled();
      expect(onError).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // CAPABILITIES TESTS
  // ===========================================================================

  describe('Capabilities', () => {
    it('should expose capability flags', () => {
      expect(typeof adapter.supportsTerminal).toBe('boolean');
      expect(typeof adapter.supportsShell).toBe('boolean');
      expect(typeof adapter.supportsNodeServer).toBe('boolean');
      expect(typeof adapter.isBrowserOnly).toBe('boolean');
    });

    it('should expose supported frameworks', () => {
      expect(Array.isArray(adapter.supportedFrameworks)).toBe(true);
      expect(adapter.supportedFrameworks.length).toBeGreaterThan(0);
    });

    it('should have a name', () => {
      expect(adapter.name).toBeTruthy();
      expect(typeof adapter.name).toBe('string');
    });
  });
});

// ===========================================================================
// BUILD OPTIONS TESTS
// ===========================================================================

describe('BuildOptions', () => {
  it('should define required options', () => {
    const options: BuildOptions = {
      entryPoint: '/src/main.tsx',
      mode: 'development',
    };

    expect(options.entryPoint).toBe('/src/main.tsx');
    expect(options.mode).toBe('development');
  });

  it('should support production mode', () => {
    const options: BuildOptions = {
      entryPoint: '/src/main.tsx',
      mode: 'production',
      minify: true,
      sourcemap: false,
    };

    expect(options.mode).toBe('production');
    expect(options.minify).toBe(true);
  });

  it('should support define for env variables', () => {
    const options: BuildOptions = {
      entryPoint: '/src/main.tsx',
      mode: 'development',
      define: {
        'process.env.NODE_ENV': '"development"',
        'process.env.API_URL': '"https://api.example.com"',
      },
    };

    expect(options.define?.['process.env.NODE_ENV']).toBe('"development"');
  });
});

// ===========================================================================
// BUNDLE RESULT TESTS
// ===========================================================================

describe('BundleResult', () => {
  it('should contain all required fields', () => {
    const result: BundleResult = {
      code: 'bundled code',
      css: '.app { color: red; }',
      errors: [],
      warnings: [],
      buildTime: 150,
      hash: 'abc123',
    };

    expect(result.code).toBeTruthy();
    expect(result.buildTime).toBeGreaterThan(0);
    expect(result.hash).toBeTruthy();
    expect(Array.isArray(result.errors)).toBe(true);
    expect(Array.isArray(result.warnings)).toBe(true);
  });

  it('should include error details', () => {
    const result: BundleResult = {
      code: '',
      css: '',
      errors: [
        {
          message: 'Cannot find module "./Missing"',
          file: '/src/App.tsx',
          line: 5,
          column: 20,
          snippet: 'import Missing from "./Missing"',
        },
      ],
      warnings: [],
      buildTime: 50,
      hash: '',
    };

    expect(result.errors[0].message).toContain('Cannot find module');
    expect(result.errors[0].file).toBe('/src/App.tsx');
    expect(result.errors[0].line).toBe(5);
  });
});

// ===========================================================================
// INTEGRATION BEHAVIOR TESTS
// ===========================================================================

describe('Expected Integration Behaviors', () => {
  let adapter: MockRuntimeAdapter;

  beforeEach(async () => {
    adapter = new MockRuntimeAdapter();
    await adapter.init();
  });

  afterEach(async () => {
    await adapter.destroy();
  });

  it('should handle typical React app workflow', async () => {
    // 1. Write project files
    await adapter.writeFiles(
      new Map([
        ['/package.json', '{"name":"test","dependencies":{"react":"18"}}'],
        ['/src/main.tsx', 'import React from "react"; import App from "./App"; ReactDOM.render(<App/>, document.getElementById("root"));'],
        ['/src/App.tsx', 'export default function App() { return <div>Hello World</div>; }'],
        ['/index.html', '<!DOCTYPE html><html><body><div id="root"></div></body></html>'],
      ]),
    );

    // 2. Build
    const result = await adapter.build({
      entryPoint: '/src/main.tsx',
      mode: 'development',
    });

    // 3. Verify build success
    expect(result.errors).toHaveLength(0);
    expect(result.code).toBeTruthy();

    // 4. Get preview
    const preview = adapter.getPreview();
    expect(preview?.ready).toBe(true);
  });

  it('should handle CSS modules', async () => {
    await adapter.writeFiles(
      new Map([
        ['/src/App.module.css', '.container { padding: 20px; }'],
        ['/src/App.tsx', 'import styles from "./App.module.css"; export default () => <div className={styles.container}>Hello</div>'],
      ]),
    );

    const result = await adapter.build({
      entryPoint: '/src/App.tsx',
      mode: 'development',
    });

    expect(result.errors).toHaveLength(0);
  });

  it('should handle npm package imports', async () => {
    await adapter.writeFiles(
      new Map([
        ['/package.json', '{"dependencies":{"lodash":"4.17.21"}}'],
        ['/src/main.tsx', 'import _ from "lodash"; console.log(_.chunk([1,2,3,4], 2));'],
      ]),
    );

    const result = await adapter.build({
      entryPoint: '/src/main.tsx',
      mode: 'development',
    });

    // In a real implementation, this would resolve npm packages
    // For mock, we just verify the build completes
    expect(result.errors).toHaveLength(0);
  });

  it('should handle hot reload workflow', async () => {
    // Initial build
    await adapter.writeFile('/src/App.tsx', 'export default () => <div>Version 1</div>');
    const result1 = await adapter.build({ entryPoint: '/src/App.tsx', mode: 'development' });
    const hash1 = result1.hash;

    // Modify file
    await adapter.writeFile('/src/App.tsx', 'export default () => <div>Version 2</div>');
    const result2 = await adapter.build({ entryPoint: '/src/App.tsx', mode: 'development' });
    const hash2 = result2.hash;

    // Hash should change
    expect(hash1).not.toBe(hash2);

    // Preview should be updated
    expect(adapter.getPreview()?.ready).toBe(true);
  });
});
