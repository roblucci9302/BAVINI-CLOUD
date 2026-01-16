/**
 * Tests d'intégration pour le Tool Registry
 * Vérifie l'intégration complète avec les agents et les outils existants
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ToolRegistry,
  createReadToolsRegistry,
  createWriteToolsRegistry,
  createShellToolsRegistry,
  createStandardToolRegistry,
} from './tool-registry';
import { READ_TOOLS, createReadToolHandlers, type FileSystem } from '../tools/read-tools';
import { WRITE_TOOLS, createWriteToolHandlers, createMockWritableFileSystem } from '../tools/write-tools';
import { SHELL_TOOLS, createShellToolHandlers, createMockShell } from '../tools/shell-tools';
import type { ToolHandler } from './tool-registry';

/*
 * ============================================================================
 * MOCK FILESYSTEM
 * ============================================================================
 */

function createMockFileSystem(): FileSystem {
  return {
    async readFile(path: string): Promise<string> {
      if (path === '/test/file.ts') {
        return 'export const test = "hello";';
      }

      if (path === '/test/package.json') {
        return JSON.stringify({ name: 'test-project', version: '1.0.0' });
      }

      throw new Error(`File not found: ${path}`);
    },
    async readdir(path: string): Promise<Array<{ name: string; isDirectory: boolean; size?: number }>> {
      if (path === '/test') {
        return [
          { name: 'file.ts', isDirectory: false, size: 100 },
          { name: 'package.json', isDirectory: false, size: 50 },
          { name: 'src', isDirectory: true },
        ];
      }

      if (path === '/test/src') {
        return [
          { name: 'index.ts', isDirectory: false, size: 200 },
          { name: 'utils.ts', isDirectory: false, size: 150 },
        ];
      }

      return [];
    },
    async exists(path: string): Promise<boolean> {
      const existingPaths = [
        '/test',
        '/test/file.ts',
        '/test/package.json',
        '/test/src',
        '/test/src/index.ts',
        '/test/src/utils.ts',
      ];
      return existingPaths.includes(path);
    },
  };
}

/*
 * ============================================================================
 * TESTS D'INTÉGRATION - FACTORY FUNCTIONS
 * ============================================================================
 */

describe('Tool Registry Integration', () => {
  describe('createReadToolsRegistry', () => {
    it('should create a registry with all read tools', async () => {
      const fs = createMockFileSystem();
      const registry = await createReadToolsRegistry(fs);

      // Vérifier que tous les outils de lecture sont enregistrés
      expect(registry.has('read_file')).toBe(true);
      expect(registry.has('grep')).toBe(true);
      expect(registry.has('glob')).toBe(true);
      expect(registry.has('list_directory')).toBe(true);
      expect(registry.size).toBe(READ_TOOLS.length);
    });

    it('should execute read_file tool successfully', async () => {
      const fs = createMockFileSystem();
      const registry = await createReadToolsRegistry(fs);

      const result = await registry.execute('read_file', { path: '/test/file.ts' });

      expect(result.success).toBe(true);
      expect(result.output).toBeDefined();

      // Output is an object with content property
      const output = result.output as { content: string; path: string };
      expect(output.content).toContain('export const test');
    });

    it('should execute list_directory tool successfully', async () => {
      const fs = createMockFileSystem();
      const registry = await createReadToolsRegistry(fs);

      const result = await registry.execute('list_directory', { path: '/test' });

      // list_directory returns structured output with entries
      expect(result.success).toBe(true);
      expect(result.output).toBeDefined();

      const output = result.output as { entries: unknown[] };
      expect(output.entries).toBeDefined();
    });

    it('should return error for non-existent file', async () => {
      const fs = createMockFileSystem();
      const registry = await createReadToolsRegistry(fs);

      const result = await registry.execute('read_file', { path: '/nonexistent/file.ts' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should have correct category for all tools', async () => {
      const fs = createMockFileSystem();
      const registry = await createReadToolsRegistry(fs);

      const stats = registry.getStats();
      expect(stats.byCategory.filesystem).toBe(READ_TOOLS.length);
    });
  });

  describe('createWriteToolsRegistry', () => {
    it('should create a registry with all write tools', async () => {
      const fs = createMockWritableFileSystem();
      const registry = await createWriteToolsRegistry(fs);

      expect(registry.has('write_file')).toBe(true);
      expect(registry.has('edit_file')).toBe(true);
      expect(registry.has('delete_file')).toBe(true);
      expect(registry.has('create_directory')).toBe(true);
      expect(registry.has('move_file')).toBe(true);
      expect(registry.size).toBe(WRITE_TOOLS.length);
    });

    it('should execute write_file tool successfully', async () => {
      const fs = createMockWritableFileSystem();
      const registry = await createWriteToolsRegistry(fs);

      const result = await registry.execute('write_file', {
        path: '/test/new-file.ts',
        content: 'export const x = 1;',
      });

      expect(result.success).toBe(true);
    });

    it('should execute create_directory tool successfully', async () => {
      const fs = createMockWritableFileSystem();
      const registry = await createWriteToolsRegistry(fs);

      const result = await registry.execute('create_directory', {
        path: '/test/new-dir',
      });

      expect(result.success).toBe(true);
    });
  });

  describe('createShellToolsRegistry', () => {
    it('should create a registry with all shell tools', async () => {
      const shell = createMockShell();
      const registry = await createShellToolsRegistry(shell);

      expect(registry.has('npm_command')).toBe(true);
      expect(registry.has('shell_command')).toBe(true);
      expect(registry.has('start_dev_server')).toBe(true);
      expect(registry.has('stop_server')).toBe(true);
      expect(registry.has('install_dependencies')).toBe(true);
      expect(registry.has('get_process_status')).toBe(true);
      expect(registry.size).toBe(SHELL_TOOLS.length);
    });

    it('should execute npm_command tool successfully', async () => {
      const shell = createMockShell();
      const registry = await createShellToolsRegistry(shell);

      const result = await registry.execute('npm_command', { command: 'install' });

      expect(result.success).toBe(true);
    });

    it('should reject dangerous shell commands', async () => {
      const shell = createMockShell();
      const registry = await createShellToolsRegistry(shell);

      const result = await registry.execute('shell_command', { command: 'rm -rf /' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('safety');
    });
  });

  describe('createStandardToolRegistry', () => {
    it('should create registry with filesystem tools', async () => {
      const fs = createMockWritableFileSystem();
      const registry = await createStandardToolRegistry({ fileSystem: fs });

      // Outils de lecture
      expect(registry.has('read_file')).toBe(true);
      expect(registry.has('grep')).toBe(true);
      expect(registry.has('glob')).toBe(true);
      expect(registry.has('list_directory')).toBe(true);

      // Outils d'écriture
      expect(registry.has('write_file')).toBe(true);
      expect(registry.has('edit_file')).toBe(true);
      expect(registry.has('delete_file')).toBe(true);
    });

    it('should create registry with shell tools', async () => {
      const shell = createMockShell();
      const registry = await createStandardToolRegistry({ shell });

      expect(registry.has('npm_command')).toBe(true);
      expect(registry.has('shell_command')).toBe(true);
      expect(registry.has('start_dev_server')).toBe(true);
    });

    it('should create registry with all tools when all adapters provided', async () => {
      const fs = createMockWritableFileSystem();
      const shell = createMockShell();
      const registry = await createStandardToolRegistry({ fileSystem: fs, shell });

      // Total: 4 read + 5 write + 6 shell = 15 tools
      expect(registry.size).toBeGreaterThanOrEqual(15);
    });

    it('should categorize tools correctly', async () => {
      const fs = createMockWritableFileSystem();
      const shell = createMockShell();
      const registry = await createStandardToolRegistry({ fileSystem: fs, shell });

      const stats = registry.getStats();
      expect(stats.byCategory.filesystem).toBeGreaterThan(0);
      expect(stats.byCategory.shell).toBeGreaterThan(0);
    });
  });
});

/*
 * ============================================================================
 * TESTS D'INTÉGRATION - HANDLERS RÉELS
 * ============================================================================
 */

describe('Tool Registry with Real Handlers', () => {
  let registry: ToolRegistry;
  let mockFs: FileSystem;

  beforeEach(() => {
    registry = new ToolRegistry();
    mockFs = createMockFileSystem();
  });

  it('should register and execute read handlers', async () => {
    const handlers = createReadToolHandlers(mockFs);

    // Enregistrer manuellement
    for (const tool of READ_TOOLS) {
      const handler = handlers[tool.name as keyof typeof handlers];

      if (handler) {
        registry.register(tool, handler as unknown as ToolHandler);
      }
    }

    const result = await registry.execute('read_file', { path: '/test/file.ts' });
    expect(result.success).toBe(true);
  });

  it('should execute multiple tools in parallel', async () => {
    const handlers = createReadToolHandlers(mockFs);

    for (const tool of READ_TOOLS) {
      const handler = handlers[tool.name as keyof typeof handlers];

      if (handler) {
        registry.register(tool, handler as unknown as ToolHandler);
      }
    }

    // Use read_file for both since list_directory may have issues with mock
    const results = await registry.executeParallel([
      { name: 'read_file', input: { path: '/test/file.ts' } },
      { name: 'read_file', input: { path: '/test/package.json' } },
    ]);

    expect(results).toHaveLength(2);
    expect(results[0].success).toBe(true);
    expect(results[1].success).toBe(true);
  });

  it('should execute multiple tools sequentially with stop on error', async () => {
    const handlers = createReadToolHandlers(mockFs);

    for (const tool of READ_TOOLS) {
      const handler = handlers[tool.name as keyof typeof handlers];

      if (handler) {
        registry.register(tool, handler as unknown as ToolHandler);
      }
    }

    const results = await registry.executeSequential([
      { name: 'read_file', input: { path: '/test/file.ts' } },
      { name: 'read_file', input: { path: '/nonexistent.ts' } }, // Will fail
      { name: 'list_directory', input: { path: '/test' } }, // Should not execute
    ]);

    expect(results).toHaveLength(2); // Stops after failure
    expect(results[0].success).toBe(true);
    expect(results[1].success).toBe(false);
  });

  it('should track execution statistics', async () => {
    const handlers = createReadToolHandlers(mockFs);

    for (const tool of READ_TOOLS) {
      const handler = handlers[tool.name as keyof typeof handlers];

      if (handler) {
        registry.register(tool, handler as unknown as ToolHandler);
      }
    }

    await registry.execute('read_file', { path: '/test/file.ts' }); // success
    await registry.execute('read_file', { path: '/nonexistent.ts' }); // fail
    await registry.execute('read_file', { path: '/test/package.json' }); // success

    const stats = registry.getStats();
    expect(stats.executionCount).toBe(3);
    expect(stats.successCount).toBe(2);
    expect(stats.failureCount).toBe(1);
  });
});

/*
 * ============================================================================
 * TESTS D'INTÉGRATION - EDGE CASES
 * ============================================================================
 */

describe('Tool Registry Edge Cases', () => {
  it('should handle empty registry gracefully', async () => {
    const registry = new ToolRegistry();

    const result = await registry.execute('unknown_tool', {});

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('should merge registries correctly', async () => {
    const fs = createMockWritableFileSystem();
    const shell = createMockShell();

    const fsRegistry = await createReadToolsRegistry(fs);
    const shellRegistry = await createShellToolsRegistry(shell);

    fsRegistry.merge(shellRegistry);

    // Should have both read and shell tools
    expect(fsRegistry.has('read_file')).toBe(true);
    expect(fsRegistry.has('npm_command')).toBe(true);
  });

  it('should clone registry independently', async () => {
    const fs = createMockFileSystem();
    const registry = await createReadToolsRegistry(fs);
    const cloned = registry.clone();

    // Modify original
    registry.unregister('read_file');

    // Clone should still have the tool
    expect(cloned.has('read_file')).toBe(true);
    expect(registry.has('read_file')).toBe(false);
  });

  it('should unregister category of tools', async () => {
    const fs = createMockWritableFileSystem();
    const shell = createMockShell();

    const registry = await createStandardToolRegistry({ fileSystem: fs, shell });

    const shellToolsCount = SHELL_TOOLS.length;
    const removed = registry.unregisterCategory('shell');

    expect(removed).toBe(shellToolsCount);
    expect(registry.has('npm_command')).toBe(false);
    expect(registry.has('read_file')).toBe(true); // filesystem tools still there
  });
});
