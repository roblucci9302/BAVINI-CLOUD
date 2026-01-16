/**
 * Tests pour le gestionnaire de mode d'exécution
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ExecutionModeManager,
  createExecutionModeManager,
  getExecutionModeManager,
  resetExecutionModeManager,
  READ_ONLY_TOOLS,
  HIGH_RISK_TOOLS,
} from './execution-mode';

describe('ExecutionModeManager', () => {
  let manager: ExecutionModeManager;

  beforeEach(() => {
    manager = new ExecutionModeManager();
    resetExecutionModeManager();
  });

  /*
   * ============================================================================
   * MODE MANAGEMENT
   * ============================================================================
   */

  describe('Mode Management', () => {
    it('should default to execute mode', () => {
      expect(manager.getMode()).toBe('execute');
    });

    it('should accept initial mode in constructor', () => {
      const planManager = new ExecutionModeManager('plan');
      expect(planManager.getMode()).toBe('plan');
    });

    it('should change mode with setMode', () => {
      manager.setMode('plan');
      expect(manager.getMode()).toBe('plan');

      manager.setMode('strict');
      expect(manager.getMode()).toBe('strict');
    });

    it('should provide convenience methods for plan mode', () => {
      expect(manager.isPlanMode()).toBe(false);

      manager.enterPlanMode();
      expect(manager.isPlanMode()).toBe(true);
      expect(manager.getMode()).toBe('plan');

      manager.exitPlanMode();
      expect(manager.isPlanMode()).toBe(false);
      expect(manager.getMode()).toBe('execute');
    });

    it('should provide isStrictMode helper', () => {
      expect(manager.isStrictMode()).toBe(false);

      manager.setMode('strict');
      expect(manager.isStrictMode()).toBe(true);
    });
  });

  /*
   * ============================================================================
   * PERMISSION CHECKS - PLAN MODE
   * ============================================================================
   */

  describe('Permission Checks - Plan Mode', () => {
    beforeEach(() => {
      manager.enterPlanMode();
    });

    it('should allow read-only tools', () => {
      const result = manager.checkPermission('read_file', { path: 'test.ts' });

      expect(result.allowed).toBe(true);
      expect(result.needsApproval).toBe(false);
      expect(result.suggestedAction).toBe('proceed');
    });

    it('should block write tools', () => {
      const result = manager.checkPermission('write_file', { path: 'test.ts', content: '...' });

      expect(result.allowed).toBe(false);
      expect(result.suggestedAction).toBe('block');
      expect(result.reason).toContain('not allowed in plan mode');
    });

    it('should allow all listed read-only tools', () => {
      for (const tool of READ_ONLY_TOOLS) {
        const result = manager.checkPermission(tool, {});
        expect(result.allowed).toBe(true);
      }
    });

    it('should always allow interaction tools', () => {
      expect(manager.checkPermission('ask_user_question', {}).allowed).toBe(true);
      expect(manager.checkPermission('todo_write', {}).allowed).toBe(true);
    });
  });

  /*
   * ============================================================================
   * PERMISSION CHECKS - EXECUTE MODE
   * ============================================================================
   */

  describe('Permission Checks - Execute Mode', () => {
    it('should allow most tools without approval', () => {
      const result = manager.checkPermission('write_file', { path: 'test.ts' });

      expect(result.allowed).toBe(true);
      expect(result.needsApproval).toBe(false);
    });

    it('should require approval for high-risk tools', () => {
      const result = manager.checkPermission('delete_file', { path: 'important.ts' });

      expect(result.allowed).toBe(true);
      expect(result.needsApproval).toBe(true);
      expect(result.suggestedAction).toBe('ask_approval');
    });

    it('should flag all high-risk tools', () => {
      for (const tool of HIGH_RISK_TOOLS) {
        const result = manager.checkPermission(tool, {});
        expect(result.needsApproval).toBe(true);
      }
    });
  });

  /*
   * ============================================================================
   * PERMISSION CHECKS - STRICT MODE
   * ============================================================================
   */

  describe('Permission Checks - Strict Mode', () => {
    beforeEach(() => {
      manager.setMode('strict');
    });

    it('should allow read-only without approval', () => {
      const result = manager.checkPermission('read_file', {});

      expect(result.allowed).toBe(true);
      expect(result.needsApproval).toBe(false);
    });

    it('should require approval for all non-read tools', () => {
      const result = manager.checkPermission('write_file', {});

      expect(result.allowed).toBe(true);
      expect(result.needsApproval).toBe(true);
      expect(result.reason).toContain('strict mode');
    });
  });

  /*
   * ============================================================================
   * APPROVAL REQUESTS
   * ============================================================================
   */

  describe('Approval Requests', () => {
    it('should reject without callback', async () => {
      const approved = await manager.requestApproval('delete_file', 'Delete test.ts', { path: 'test.ts' });

      expect(approved).toBe(false);
    });

    it('should use callback when provided', async () => {
      const callback = vi.fn().mockResolvedValue(true);
      manager.setApprovalCallback(callback);

      const approved = await manager.requestApproval('delete_file', 'Delete file', { path: 'x' });

      expect(approved).toBe(true);
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          toolType: 'delete_file',
          description: 'Delete file',
        }),
      );
    });

    it('should handle callback rejection', async () => {
      const callback = vi.fn().mockResolvedValue(false);
      manager.setApprovalCallback(callback);

      const approved = await manager.requestApproval('run_command', 'Run npm', {});

      expect(approved).toBe(false);
    });

    it('should handle callback errors', async () => {
      const callback = vi.fn().mockRejectedValue(new Error('User cancelled'));
      manager.setApprovalCallback(callback);

      const approved = await manager.requestApproval('deploy', 'Deploy app', {});

      expect(approved).toBe(false);
    });

    it('should record decisions in history', async () => {
      const callback = vi.fn().mockResolvedValue(true);
      manager.setApprovalCallback(callback);

      await manager.requestApproval('delete_file', 'Test', {});

      const history = manager.getDecisionHistory();
      expect(history).toHaveLength(1);
      expect(history[0].decision).toBe('approved');
    });
  });

  /*
   * ============================================================================
   * CHECK AND EXECUTE
   * ============================================================================
   */

  describe('checkAndExecute', () => {
    it('should execute allowed actions', async () => {
      const executor = vi.fn().mockResolvedValue('result');

      const result = await manager.checkAndExecute('read_file', 'Read test', { path: 'x' }, executor);

      expect(result.allowed).toBe(true);
      expect(result.result).toBe('result');
      expect(executor).toHaveBeenCalled();
    });

    it('should block in plan mode for write actions', async () => {
      manager.enterPlanMode();
      const executor = vi.fn();

      const result = await manager.checkAndExecute('write_file', 'Write', {}, executor);

      expect(result.allowed).toBe(false);
      expect(executor).not.toHaveBeenCalled();
    });

    it('should request approval for high-risk actions', async () => {
      const callback = vi.fn().mockResolvedValue(true);
      manager.setApprovalCallback(callback);

      const executor = vi.fn().mockResolvedValue('done');

      const result = await manager.checkAndExecute('delete_file', 'Delete', { path: 'x' }, executor);

      expect(result.allowed).toBe(true);
      expect(callback).toHaveBeenCalled();
      expect(executor).toHaveBeenCalled();
    });

    it('should not execute if approval denied', async () => {
      const callback = vi.fn().mockResolvedValue(false);
      manager.setApprovalCallback(callback);

      const executor = vi.fn();

      const result = await manager.checkAndExecute('delete_file', 'Delete', {}, executor);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('did not approve');
      expect(executor).not.toHaveBeenCalled();
    });
  });

  /*
   * ============================================================================
   * STATISTICS
   * ============================================================================
   */

  describe('Statistics', () => {
    it('should track decision statistics', async () => {
      const callback = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false).mockResolvedValueOnce(true);

      manager.setApprovalCallback(callback);

      await manager.requestApproval('delete_file', 'Test 1', {});
      await manager.requestApproval('run_command', 'Test 2', {});
      await manager.requestApproval('deploy', 'Test 3', {});

      const stats = manager.getStats();

      expect(stats.totalDecisions).toBe(3);
      expect(stats.approved).toBe(2);
      expect(stats.rejected).toBe(1);
    });

    it('should report current mode', () => {
      manager.setMode('strict');
      const stats = manager.getStats();
      expect(stats.mode).toBe('strict');
    });
  });

  /*
   * ============================================================================
   * RESET
   * ============================================================================
   */

  describe('Reset', () => {
    it('should clear history and pending actions', async () => {
      const callback = vi.fn().mockResolvedValue(true);
      manager.setApprovalCallback(callback);

      await manager.requestApproval('test', 'Test', {});

      manager.reset();

      expect(manager.getDecisionHistory()).toHaveLength(0);
      expect(manager.getPendingActions()).toHaveLength(0);
    });
  });

  /*
   * ============================================================================
   * SINGLETON
   * ============================================================================
   */

  describe('Singleton', () => {
    it('should return same instance', () => {
      const m1 = getExecutionModeManager();
      const m2 = getExecutionModeManager();

      expect(m1).toBe(m2);
    });

    it('should reset singleton', () => {
      const m1 = getExecutionModeManager();
      resetExecutionModeManager();
      const m2 = getExecutionModeManager();

      expect(m1).not.toBe(m2);
    });

    it('should create new instance with factory', () => {
      const m1 = createExecutionModeManager('plan');
      const m2 = createExecutionModeManager('strict');

      expect(m1).not.toBe(m2);
      expect(m1.getMode()).toBe('plan');
      expect(m2.getMode()).toBe('strict');
    });
  });
});
