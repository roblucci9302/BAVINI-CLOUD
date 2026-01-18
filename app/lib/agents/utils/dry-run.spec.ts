/**
 * Tests for dry-run mode
 * @module agents/utils/dry-run.spec
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  DryRunManager,
  DryRunBlockedError,
  dryRunManager,
  enableDryRun,
  disableDryRun,
  isDryRunEnabled,
  simulateIfDryRun,
  getDryRunSummary,
  formatDryRunSummary,
  clearDryRunOperations,
  withDryRun,
  type OperationCategory,
  type DryRunOperation,
} from './dry-run';

describe('DryRunManager', () => {
  let manager: DryRunManager;

  beforeEach(() => {
    manager = new DryRunManager();
  });

  describe('enable/disable', () => {
    it('should be enabled by default in development mode', () => {
      // P0.4: dry-run is enabled by default in development mode for safety
      // In production, it would be disabled by default
      expect(manager.isEnabled()).toBe(true);
    });

    it('should be disabled when explicitly configured', () => {
      manager.configure({ enabled: false });
      expect(manager.isEnabled()).toBe(false);
    });

    it('should enable dry-run mode', () => {
      manager.enable();
      expect(manager.isEnabled()).toBe(true);
    });

    it('should disable dry-run mode', () => {
      manager.enable();
      manager.disable();
      expect(manager.isEnabled()).toBe(false);
    });

    it('should clear operations when enabled', () => {
      manager.enable();
      manager.simulate('file_write', 'write_file', { path: '/test' });

      expect(manager.getOperations()).toHaveLength(1);

      manager.enable(); // Re-enable should clear
      expect(manager.getOperations()).toHaveLength(0);
    });
  });

  describe('configure', () => {
    it('should configure verbose mode', () => {
      manager.configure({ enabled: true, verbose: true });
      expect(manager.isEnabled()).toBe(true);
    });

    it('should configure specific categories', () => {
      manager.configure({
        enabled: true,
        categories: ['file_write', 'file_delete'],
      });

      expect(manager.shouldSimulate('file_write')).toBe(true);
      expect(manager.shouldSimulate('file_delete')).toBe(true);
      expect(manager.shouldSimulate('shell_command')).toBe(false);
    });

    it('should simulate all categories when none specified', () => {
      manager.configure({ enabled: true });

      const categories: OperationCategory[] = ['file_write', 'file_delete', 'shell_command', 'git_operation'];

      for (const cat of categories) {
        expect(manager.shouldSimulate(cat)).toBe(true);
      }
    });
  });

  describe('simulate', () => {
    beforeEach(() => {
      manager.enable();
    });

    it('should return null when disabled', () => {
      manager.disable();

      const result = manager.simulate('file_write', 'write_file', { path: '/test' });

      expect(result).toBeNull();
    });

    it('should return simulated result when enabled', () => {
      const result = manager.simulate('file_write', 'write_file', {
        path: '/test/file.ts',
        content: 'const x = 1;',
      });

      expect(result).not.toBeNull();
      expect(result?.success).toBe(true);
      expect(result?.output).toContain('DRY-RUN');
    });

    it('should record operation', () => {
      manager.simulate('file_write', 'write_file', { path: '/test' });

      const operations = manager.getOperations();
      expect(operations).toHaveLength(1);
      expect(operations[0].category).toBe('file_write');
      expect(operations[0].tool).toBe('write_file');
    });

    it('should include warnings in operation', () => {
      manager.simulate(
        'file_delete',
        'delete_file',
        { path: '/important' },
        {
          warnings: ['This file is important!', 'Consider backup first'],
        },
      );

      const operations = manager.getOperations();
      expect(operations[0].warnings).toHaveLength(2);
      expect(operations[0].warnings).toContain('This file is important!');
    });

    it('should track reversibility', () => {
      // Disable blocking for this test to allow tracking irreversible operations
      manager.configure({ blockIrreversible: false });

      manager.simulate(
        'file_write',
        'write_file',
        { path: '/test' },
        {
          reversible: true,
        },
      );

      manager.simulate(
        'file_delete',
        'delete_file',
        { path: '/test' },
        {
          reversible: false,
        },
      );

      const operations = manager.getOperations();
      expect(operations[0].reversible).toBe(true);
      expect(operations[1].reversible).toBe(false);
    });

    it('should block irreversible operations when configured', () => {
      manager.configure({ enabled: true, blockIrreversible: true });

      expect(() => {
        manager.simulate(
          'file_delete',
          'delete_file',
          { path: '/' },
          {
            reversible: false,
          },
        );
      }).toThrow(DryRunBlockedError);
    });

    it('should call onOperation callback', () => {
      const callback = vi.fn();
      manager.configure({ enabled: true, onOperation: callback });

      manager.simulate('file_write', 'write_file', { path: '/test' });

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'file_write',
          tool: 'write_file',
        }),
      );
    });
  });

  describe('getSummary', () => {
    beforeEach(() => {
      manager.enable();
    });

    it('should return empty summary when no operations', () => {
      const summary = manager.getSummary();

      expect(summary.totalOperations).toBe(0);
      expect(summary.totalWarnings).toBe(0);
      expect(summary.filesToCreate).toHaveLength(0);
      expect(summary.filesToDelete).toHaveLength(0);
    });

    it('should count operations by category', () => {
      manager.simulate('file_write', 'write_file', { path: '/a' });
      manager.simulate('file_write', 'write_file', { path: '/b' });
      manager.simulate('file_delete', 'delete_file', { path: '/c' });
      manager.simulate('shell_command', 'shell', { command: 'ls' });

      const summary = manager.getSummary();

      expect(summary.totalOperations).toBe(4);
      expect(summary.byCategory.file_write).toBe(2);
      expect(summary.byCategory.file_delete).toBe(1);
      expect(summary.byCategory.shell_command).toBe(1);
    });

    it('should track files to create/delete', () => {
      manager.simulate('file_write', 'write_file', { path: '/new/file.ts' });
      manager.simulate('file_delete', 'delete_file', { path: '/old/file.ts' });

      const summary = manager.getSummary();

      expect(summary.filesToCreate).toContain('/new/file.ts');
      expect(summary.filesToDelete).toContain('/old/file.ts');
    });

    it('should track commands to execute', () => {
      manager.simulate('shell_command', 'shell', { command: 'npm install' });
      manager.simulate('shell_command', 'shell', { command: 'npm run build' });

      const summary = manager.getSummary();

      expect(summary.commandsToExecute).toContain('npm install');
      expect(summary.commandsToExecute).toContain('npm run build');
    });

    it('should count irreversible operations', () => {
      // Disable blocking for this test to allow tracking irreversible operations
      manager.configure({ blockIrreversible: false });

      manager.simulate('file_write', 'write', { path: '/a' }, { reversible: true });
      manager.simulate('file_delete', 'delete', { path: '/b' }, { reversible: false });
      manager.simulate('file_delete', 'delete', { path: '/c' }, { reversible: false });

      const summary = manager.getSummary();

      expect(summary.irreversibleCount).toBe(2);
    });
  });

  describe('formatSummary', () => {
    beforeEach(() => {
      manager.enable();
    });

    it('should return formatted string', () => {
      manager.simulate('file_write', 'write_file', { path: '/test.ts' });
      manager.simulate('shell_command', 'shell', { command: 'npm test' });

      const formatted = manager.formatSummary();

      expect(formatted).toContain('DRY-RUN SUMMARY');
      expect(formatted).toContain('Total Operations: 2');
      expect(formatted).toContain('file_write: 1');
      expect(formatted).toContain('shell_command: 1');
      expect(formatted).toContain('/test.ts');
      expect(formatted).toContain('npm test');
    });
  });

  describe('clear', () => {
    beforeEach(() => {
      manager.enable();
    });

    it('should clear all operations', () => {
      manager.simulate('file_write', 'write', { path: '/a' });
      manager.simulate('file_write', 'write', { path: '/b' });

      expect(manager.getOperations()).toHaveLength(2);

      manager.clear();

      expect(manager.getOperations()).toHaveLength(0);
    });
  });
});

describe('Global dry-run functions', () => {
  beforeEach(() => {
    // Reset global manager completely
    dryRunManager.configure({
      enabled: false,
      verbose: false,
      blockIrreversible: false,
      categories: undefined,
      onOperation: undefined,
    });
    clearDryRunOperations();
  });

  afterEach(() => {
    // Reset global manager completely
    dryRunManager.configure({
      enabled: false,
      verbose: false,
      blockIrreversible: false,
      categories: undefined,
      onOperation: undefined,
    });
    clearDryRunOperations();
  });

  describe('enableDryRun / disableDryRun', () => {
    it('should enable globally', () => {
      expect(isDryRunEnabled()).toBe(false);

      enableDryRun();

      expect(isDryRunEnabled()).toBe(true);
    });

    it('should disable globally', () => {
      enableDryRun();
      disableDryRun();

      expect(isDryRunEnabled()).toBe(false);
    });

    it('should accept configuration', () => {
      enableDryRun({ verbose: true, blockIrreversible: true });

      expect(isDryRunEnabled()).toBe(true);
    });
  });

  describe('simulateIfDryRun', () => {
    it('should return null when disabled', () => {
      const result = simulateIfDryRun('file_write', 'write', { path: '/test' });

      expect(result).toBeNull();
    });

    it('should return result when enabled', () => {
      enableDryRun();

      const result = simulateIfDryRun('file_write', 'write', { path: '/test' });

      expect(result).not.toBeNull();
      expect(result?.success).toBe(true);
    });
  });

  describe('getDryRunSummary', () => {
    it('should return global summary', () => {
      enableDryRun();
      simulateIfDryRun('file_write', 'write', { path: '/a' });
      simulateIfDryRun('file_write', 'write', { path: '/b' });

      const summary = getDryRunSummary();

      expect(summary.totalOperations).toBe(2);
    });
  });

  describe('formatDryRunSummary', () => {
    it('should return formatted global summary', () => {
      enableDryRun();
      simulateIfDryRun('file_write', 'write', { path: '/test' });

      const formatted = formatDryRunSummary();

      expect(formatted).toContain('DRY-RUN SUMMARY');
    });
  });
});

describe('withDryRun wrapper', () => {
  beforeEach(() => {
    // Reset global manager completely
    dryRunManager.configure({
      enabled: false,
      verbose: false,
      blockIrreversible: false,
      categories: undefined,
      onOperation: undefined,
    });
    clearDryRunOperations();
  });

  afterEach(() => {
    // Reset global manager completely
    dryRunManager.configure({
      enabled: false,
      verbose: false,
      blockIrreversible: false,
      categories: undefined,
      onOperation: undefined,
    });
    clearDryRunOperations();
  });

  it('should execute real handler when dry-run is disabled', async () => {
    const realHandler = vi.fn().mockResolvedValue({ success: true, output: 'Real result' });
    const wrapped = withDryRun('file_write', realHandler);

    const result = await wrapped({ path: '/test' });

    expect(realHandler).toHaveBeenCalled();
    expect(result.output).toBe('Real result');
  });

  it('should return simulated result when dry-run is enabled', async () => {
    enableDryRun();

    const realHandler = vi.fn().mockResolvedValue({ success: true, output: 'Real result' });
    const wrapped = withDryRun('file_write', realHandler);

    const result = await wrapped({ path: '/test' });

    expect(realHandler).not.toHaveBeenCalled();
    expect(result.output).toContain('DRY-RUN');
  });

  it('should use custom description', async () => {
    enableDryRun();

    const wrapped = withDryRun('file_write', async () => ({ success: true, output: 'ok' }), {
      getDescription: (input) => `Writing to ${input.path}`,
    });

    await wrapped({ path: '/custom/path.ts' });

    const summary = getDryRunSummary();
    expect(summary.operations[0].description).toBe('Writing to /custom/path.ts');
  });

  it('should evaluate reversibility per input', async () => {
    enableDryRun();

    const wrapped = withDryRun('file_delete', async () => ({ success: true, output: 'ok' }), {
      reversible: (input) => !(input.path as string).includes('important'),
    });

    await wrapped({ path: '/normal/file.ts' });
    await wrapped({ path: '/important/file.ts' });

    const summary = getDryRunSummary();
    expect(summary.operations[0].reversible).toBe(true);
    expect(summary.operations[1].reversible).toBe(false);
  });

  it('should include warnings from getter', async () => {
    enableDryRun();

    const wrapped = withDryRun('file_delete', async () => ({ success: true, output: 'ok' }), {
      getWarnings: (input) => {
        const warnings: string[] = [];
        if ((input.path as string).includes('config')) {
          warnings.push('Deleting config file!');
        }
        return warnings;
      },
    });

    await wrapped({ path: '/config/settings.json' });

    const summary = getDryRunSummary();
    expect(summary.operations[0].warnings).toContain('Deleting config file!');
    expect(summary.totalWarnings).toBe(1);
  });
});

describe('DryRunBlockedError', () => {
  it('should have correct properties', () => {
    const error = new DryRunBlockedError('Test error', 'file_delete', 'delete_file');

    expect(error.name).toBe('DryRunBlockedError');
    expect(error.message).toBe('Test error');
    expect(error.category).toBe('file_delete');
    expect(error.tool).toBe('delete_file');
  });

  it('should be catchable as Error', () => {
    const error = new DryRunBlockedError('Test', 'file_delete', 'delete');

    expect(error instanceof Error).toBe(true);
    expect(error instanceof DryRunBlockedError).toBe(true);
  });
});

describe('Simulated output generation', () => {
  beforeEach(() => {
    // Reset global manager completely then enable
    dryRunManager.configure({
      enabled: false,
      verbose: false,
      blockIrreversible: false,
      categories: undefined,
      onOperation: undefined,
    });
    clearDryRunOperations();
    enableDryRun();
  });

  afterEach(() => {
    // Reset global manager completely
    dryRunManager.configure({
      enabled: false,
      verbose: false,
      blockIrreversible: false,
      categories: undefined,
      onOperation: undefined,
    });
    clearDryRunOperations();
  });

  it('should generate appropriate output for file_write', () => {
    const result = simulateIfDryRun('file_write', 'write_file', {
      path: '/test.ts',
      content: 'const x = 1;',
    });

    expect(result?.output).toContain('Would write');
    expect(result?.output).toContain('bytes');
    expect(result?.output).toContain('/test.ts');
  });

  it('should generate appropriate output for file_delete', () => {
    const result = simulateIfDryRun('file_delete', 'delete_file', {
      path: '/old/file.ts',
    });

    expect(result?.output).toContain('Would delete');
    expect(result?.output).toContain('/old/file.ts');
  });

  it('should generate appropriate output for shell_command', () => {
    const result = simulateIfDryRun('shell_command', 'shell', {
      command: 'npm run build',
    });

    expect(result?.output).toContain('Would execute');
    expect(result?.output).toContain('npm run build');
  });

  it('should generate appropriate output for git_operation', () => {
    const result = simulateIfDryRun('git_operation', 'git_commit', {
      message: 'Test commit',
    });

    expect(result?.output).toContain('Would run git');
    expect(result?.output).toContain('commit');
  });

  it('should generate appropriate output for package_install', () => {
    const result = simulateIfDryRun('package_install', 'install', {
      packages: ['react', 'react-dom'],
    });

    expect(result?.output).toContain('Would install');
    expect(result?.output).toContain('react');
  });

  it('should generate appropriate output for server operations', () => {
    const startResult = simulateIfDryRun('server_start', 'start', { port: 3000 });
    const stopResult = simulateIfDryRun('server_stop', 'stop', { processId: 'abc123' });

    expect(startResult?.output).toContain('Would start server');
    expect(startResult?.output).toContain('3000');

    expect(stopResult?.output).toContain('Would stop server');
    expect(stopResult?.output).toContain('abc123');
  });
});
