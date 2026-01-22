/**
 * =============================================================================
 * BAVINI Performance - Startup Optimizer Tests
 * =============================================================================
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  StartupOptimizer,
  getStartupOptimizer,
  createStartupOptimizer,
} from '../startup-optimizer';

// Mock fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Mock document.createElement for script/style loading
const mockCreateElement = vi.fn();
const mockAppendChild = vi.fn();

vi.stubGlobal('document', {
  createElement: mockCreateElement,
  head: {
    appendChild: mockAppendChild,
  },
});

// Mock URL.createObjectURL
const mockCreateObjectURL = vi.fn(() => 'blob:mock-url');
const mockRevokeObjectURL = vi.fn();

vi.stubGlobal('URL', {
  createObjectURL: mockCreateObjectURL,
  revokeObjectURL: mockRevokeObjectURL,
});

// Mock WebAssembly.compile
vi.stubGlobal('WebAssembly', {
  compile: vi.fn().mockResolvedValue({ exports: {} }),
});

describe('StartupOptimizer', () => {
  let optimizer: StartupOptimizer;

  beforeEach(() => {
    optimizer = new StartupOptimizer();
    vi.clearAllMocks();

    // Default fetch mock
    mockFetch.mockResolvedValue({
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
      blob: () => Promise.resolve(new Blob(['test'])),
      json: () => Promise.resolve({ test: true }),
      text: () => Promise.resolve('test'),
    });

    // Mock script/style elements
    mockCreateElement.mockImplementation((tag: string) => {
      const element: Record<string, unknown> = {
        onload: null,
        onerror: null,
      };

      // Auto-trigger onload after a tick
      setTimeout(() => {
        if (element.onload) {
          (element.onload as () => void)();
        }
      }, 0);

      return element;
    });
  });

  afterEach(() => {
    optimizer.clearResources();
  });

  describe('resource registration', () => {
    it('should register a single resource', () => {
      optimizer.registerResource({
        id: 'test-resource',
        type: 'data',
        url: '/api/data.json',
        priority: 'high',
      });

      expect(optimizer.isResourceLoaded('test-resource')).toBe(false);
    });

    it('should register multiple resources', () => {
      optimizer.registerResources([
        { id: 'res1', type: 'data', url: '/data1.json', priority: 'high' },
        { id: 'res2', type: 'data', url: '/data2.json', priority: 'medium' },
      ]);

      expect(optimizer.isResourceLoaded('res1')).toBe(false);
      expect(optimizer.isResourceLoaded('res2')).toBe(false);
    });

    it('should preload resource if marked', () => {
      optimizer.registerResource({
        id: 'preload-resource',
        type: 'data',
        url: '/preload.json',
        priority: 'high',
        preload: true,
      });

      // Fetch should have been called
      expect(mockFetch).toHaveBeenCalled();
    });
  });

  describe('resource loading', () => {
    it('should load a data resource', async () => {
      optimizer.registerResource({
        id: 'json-data',
        type: 'data',
        url: '/data.json',
        priority: 'high',
      });

      const data = await optimizer.loadResource<{ test: boolean }>('json-data');

      expect(data).toEqual({ test: true });
      expect(optimizer.isResourceLoaded('json-data')).toBe(true);
    });

    it('should load a WASM resource', async () => {
      optimizer.registerResource({
        id: 'wasm-module',
        type: 'wasm',
        url: '/module.wasm',
        priority: 'critical',
      });

      await optimizer.loadResource('wasm-module');

      expect(WebAssembly.compile).toHaveBeenCalled();
      expect(optimizer.isResourceLoaded('wasm-module')).toBe(true);
    });

    it('should load a worker resource', async () => {
      optimizer.registerResource({
        id: 'worker',
        type: 'worker',
        url: '/worker.js',
        priority: 'high',
      });

      const url = await optimizer.loadResource<string>('worker');

      expect(url).toBe('blob:mock-url');
      expect(optimizer.isResourceLoaded('worker')).toBe(true);
    });

    it('should load a script resource', async () => {
      optimizer.registerResource({
        id: 'script',
        type: 'script',
        url: '/script.js',
        priority: 'medium',
      });

      await optimizer.loadResource('script');

      expect(mockCreateElement).toHaveBeenCalledWith('script');
      expect(mockAppendChild).toHaveBeenCalled();
    });

    it('should load a style resource', async () => {
      optimizer.registerResource({
        id: 'style',
        type: 'style',
        url: '/style.css',
        priority: 'medium',
      });

      await optimizer.loadResource('style');

      expect(mockCreateElement).toHaveBeenCalledWith('link');
      expect(mockAppendChild).toHaveBeenCalled();
    });

    it('should return cached resource on subsequent loads', async () => {
      optimizer.registerResource({
        id: 'cached',
        type: 'data',
        url: '/cached.json',
        priority: 'high',
      });

      await optimizer.loadResource('cached');
      await optimizer.loadResource('cached');

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should throw for unknown resource', async () => {
      await expect(optimizer.loadResource('unknown')).rejects.toThrow(
        'Unknown resource: unknown'
      );
    });

    it('should load dependencies first', async () => {
      const loadOrder: string[] = [];

      mockFetch.mockImplementation((url: string) => {
        loadOrder.push(url);
        return Promise.resolve({
          json: () => Promise.resolve({}),
        });
      });

      optimizer.registerResources([
        { id: 'dep', type: 'data', url: '/dep.json', priority: 'high' },
        {
          id: 'main',
          type: 'data',
          url: '/main.json',
          priority: 'high',
          dependencies: ['dep'],
        },
      ]);

      await optimizer.loadResource('main');

      expect(loadOrder).toEqual(['/dep.json', '/main.json']);
    });

    it('should deduplicate concurrent loads', async () => {
      optimizer.registerResource({
        id: 'concurrent',
        type: 'data',
        url: '/concurrent.json',
        priority: 'high',
      });

      // Start two loads concurrently
      const [result1, result2] = await Promise.all([
        optimizer.loadResource('concurrent'),
        optimizer.loadResource('concurrent'),
      ]);

      expect(result1).toBe(result2);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('preload', () => {
    it('should preload resource in background', () => {
      optimizer.registerResource({
        id: 'preload-bg',
        type: 'data',
        url: '/preload.json',
        priority: 'low',
      });

      optimizer.preloadResource('preload-bg');

      expect(mockFetch).toHaveBeenCalled();
    });

    it('should not preload already loaded resource', async () => {
      optimizer.registerResource({
        id: 'already-loaded',
        type: 'data',
        url: '/data.json',
        priority: 'high',
      });

      await optimizer.loadResource('already-loaded');
      mockFetch.mockClear();

      optimizer.preloadResource('already-loaded');

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should not preload unknown resource', () => {
      optimizer.preloadResource('unknown-resource');
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('startup phases', () => {
    it('should register and run a phase', async () => {
      const executed: string[] = [];

      optimizer.registerPhase({
        name: 'init',
        dependencies: [],
        execute: async () => {
          executed.push('init');
        },
      });

      await optimizer.runStartup();

      expect(executed).toContain('init');
    });

    it('should run phases in dependency order', async () => {
      const executed: string[] = [];

      optimizer.registerPhase({
        name: 'phase3',
        dependencies: ['phase2'],
        execute: async () => {
          executed.push('phase3');
        },
      });

      optimizer.registerPhase({
        name: 'phase1',
        dependencies: [],
        execute: async () => {
          executed.push('phase1');
        },
      });

      optimizer.registerPhase({
        name: 'phase2',
        dependencies: ['phase1'],
        execute: async () => {
          executed.push('phase2');
        },
      });

      await optimizer.runStartup();

      expect(executed).toEqual(['phase1', 'phase2', 'phase3']);
    });

    it('should detect circular dependencies', async () => {
      optimizer.registerPhase({
        name: 'a',
        dependencies: ['b'],
        execute: async () => {},
      });

      optimizer.registerPhase({
        name: 'b',
        dependencies: ['a'],
        execute: async () => {},
      });

      await expect(optimizer.runStartup()).rejects.toThrow(
        'Circular dependency detected'
      );
    });

    it('should handle phase errors', async () => {
      optimizer.registerPhase({
        name: 'failing',
        dependencies: [],
        execute: async () => {
          throw new Error('Phase failed');
        },
      });

      await expect(optimizer.runStartup()).rejects.toThrow('Phase failed');
    });
  });

  describe('critical resources', () => {
    it('should load all critical resources in parallel', async () => {
      optimizer.registerResources([
        { id: 'critical1', type: 'data', url: '/c1.json', priority: 'critical' },
        { id: 'critical2', type: 'data', url: '/c2.json', priority: 'critical' },
        { id: 'noncritical', type: 'data', url: '/nc.json', priority: 'low' },
      ]);

      await optimizer.loadCriticalResources();

      expect(optimizer.isResourceLoaded('critical1')).toBe(true);
      expect(optimizer.isResourceLoaded('critical2')).toBe(true);
      expect(optimizer.isResourceLoaded('noncritical')).toBe(false);
    });
  });

  describe('timing', () => {
    it('should record timing for phases', () => {
      optimizer.recordTiming('wasmLoad', 100);
      optimizer.recordTiming('workerInit', 50);

      const timing = optimizer.getTiming();

      expect(timing.wasmLoad).toBe(100);
      expect(timing.workerInit).toBe(50);
    });

    it('should return startup timing after run', async () => {
      optimizer.registerPhase({
        name: 'test',
        dependencies: [],
        execute: async () => {},
      });

      const timing = await optimizer.runStartup();

      expect(timing.total).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getLoadedResource', () => {
    it('should return loaded resource data', async () => {
      optimizer.registerResource({
        id: 'get-test',
        type: 'data',
        url: '/data.json',
        priority: 'high',
      });

      await optimizer.loadResource('get-test');

      const data = optimizer.getLoadedResource<{ test: boolean }>('get-test');
      expect(data).toEqual({ test: true });
    });

    it('should return undefined for unloaded resource', () => {
      const data = optimizer.getLoadedResource('unloaded');
      expect(data).toBeUndefined();
    });
  });

  describe('clearResources', () => {
    it('should clear all loaded resources', async () => {
      optimizer.registerResource({
        id: 'to-clear',
        type: 'data',
        url: '/data.json',
        priority: 'high',
      });

      await optimizer.loadResource('to-clear');
      optimizer.clearResources();

      expect(optimizer.isResourceLoaded('to-clear')).toBe(false);
    });

    it('should revoke blob URLs for workers', async () => {
      optimizer.registerResource({
        id: 'worker-clear',
        type: 'worker',
        url: '/worker.js',
        priority: 'high',
      });

      await optimizer.loadResource('worker-clear');
      optimizer.clearResources();

      expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
    });
  });

  describe('getLoadStats', () => {
    it('should return load statistics', async () => {
      optimizer.registerResources([
        { id: 'data1', type: 'data', url: '/d1.json', priority: 'high' },
        { id: 'data2', type: 'data', url: '/d2.json', priority: 'high' },
      ]);

      await optimizer.loadResource('data1');
      await optimizer.loadResource('data2');

      const stats = optimizer.getLoadStats();

      expect(stats.total).toBe(2);
      expect(stats.byType.data).toBe(2);
    });
  });

  describe('global instance', () => {
    it('should return same global instance', () => {
      const instance1 = getStartupOptimizer();
      const instance2 = getStartupOptimizer();

      expect(instance1).toBe(instance2);
    });

    it('should create new instance with factory', () => {
      const custom = createStartupOptimizer();
      const global = getStartupOptimizer();

      expect(custom).not.toBe(global);
    });
  });
});
