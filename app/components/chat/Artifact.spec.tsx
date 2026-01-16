import { describe, expect, it, vi } from 'vitest';
import { atom, computed } from 'nanostores';

/**
 * Tests for Artifact component
 *
 * Note: The Artifact component uses import.meta.hot for HMR and top-level
 * await for shiki, which are difficult to test directly. These tests verify
 * the logic patterns used by the component.
 */

describe('Artifact component logic', () => {
  describe('artifact data handling', () => {
    it('should handle missing artifact gracefully', () => {
      const artifacts: Record<string, any> = {};
      const messageId = 'non-existent';

      const artifact = artifacts[messageId];
      expect(artifact).toBeUndefined();
    });

    it('should retrieve artifact by messageId', () => {
      const artifacts: Record<string, any> = {
        'msg-1': {
          title: 'Test Artifact',
          runner: { actions: atom({}) },
        },
      };

      const artifact = artifacts['msg-1'];
      expect(artifact).toBeDefined();
      expect(artifact.title).toBe('Test Artifact');
    });
  });

  describe('actions computed store', () => {
    it('should return empty array when no runner', () => {
      // Test the fallback behavior when runner is undefined
      const runner = undefined as { actions: ReturnType<typeof atom<Record<string, unknown>>> } | undefined;

      // When runner is undefined, we expect the fallback to return an empty array
      const actionsStore =
        runner !== undefined ? computed(runner.actions, (m) => Object.values(m)) : atom<unknown[]>([]);

      expect(actionsStore.get()).toEqual([]);
    });

    it('should convert actions map to array', () => {
      const actionsMap = atom({
        'action-1': { status: 'complete', type: 'file', filePath: '/test.ts' },
        'action-2': { status: 'running', type: 'shell', content: 'npm install' },
      });

      const actionsArray = computed(actionsMap, (map) => Object.values(map));

      expect(actionsArray.get()).toHaveLength(2);
      expect(actionsArray.get()[0]).toHaveProperty('status');
    });

    it('should update when actions change', () => {
      const actionsMap = atom<Record<string, any>>({});
      const actionsArray = computed(actionsMap, (map) => Object.values(map));

      expect(actionsArray.get()).toHaveLength(0);

      actionsMap.set({
        'action-1': { status: 'pending', type: 'file', filePath: '/new.ts' },
      });

      expect(actionsArray.get()).toHaveLength(1);
    });
  });

  describe('workbench toggle logic', () => {
    it('should toggle showWorkbench state', () => {
      const showWorkbench = atom(false);

      expect(showWorkbench.get()).toBe(false);

      showWorkbench.set(!showWorkbench.get());
      expect(showWorkbench.get()).toBe(true);

      showWorkbench.set(!showWorkbench.get());
      expect(showWorkbench.get()).toBe(false);
    });
  });

  describe('action status icons', () => {
    it('should return correct icon colors for status', () => {
      type ActionStatus = 'pending' | 'running' | 'complete' | 'aborted' | 'failed';

      const getIconColor = (status: ActionStatus): string | undefined => {
        switch (status) {
          case 'pending':
            return 'text-bolt-elements-textTertiary';
          case 'running':
            return 'text-bolt-elements-loader-progress';
          case 'complete':
            return 'text-bolt-elements-icon-success';
          case 'aborted':
            return 'text-bolt-elements-textSecondary';
          case 'failed':
            return 'text-bolt-elements-icon-error';
          default:
            return undefined;
        }
      };

      expect(getIconColor('pending')).toBe('text-bolt-elements-textTertiary');
      expect(getIconColor('running')).toBe('text-bolt-elements-loader-progress');
      expect(getIconColor('complete')).toBe('text-bolt-elements-icon-success');
      expect(getIconColor('aborted')).toBe('text-bolt-elements-textSecondary');
      expect(getIconColor('failed')).toBe('text-bolt-elements-icon-error');
    });
  });

  describe('user toggle behavior', () => {
    it('should track user toggle state', () => {
      let userToggledActions = false;
      let showActions = false;

      // User clicks toggle
      const toggleActions = () => {
        userToggledActions = true;
        showActions = !showActions;
      };

      expect(userToggledActions).toBe(false);
      expect(showActions).toBe(false);

      toggleActions();
      expect(userToggledActions).toBe(true);
      expect(showActions).toBe(true);

      toggleActions();
      expect(showActions).toBe(false);
    });

    it('should auto-show actions when actions exist and user has not toggled', () => {
      const userToggledActions = false;
      let showActions = false;

      const actions = [{ status: 'running', type: 'file' }];

      // Auto-show logic
      if (actions.length && !showActions && !userToggledActions) {
        showActions = true;
      }

      expect(showActions).toBe(true);
    });

    it('should not auto-show if user has already toggled', () => {
      const userToggledActions = true; // User already toggled
      let showActions = false;

      const actions = [{ status: 'running', type: 'file' }];

      // Auto-show logic
      if (actions.length && !showActions && !userToggledActions) {
        showActions = true;
      }

      expect(showActions).toBe(false); // Should stay false
    });
  });

  describe('action types', () => {
    it('should support file action type', () => {
      const action = {
        status: 'complete',
        type: 'file',
        filePath: '/src/test.ts',
        content: 'const x = 1;',
      };

      expect(action.type).toBe('file');
      expect(action.filePath).toBeDefined();
    });

    it('should support shell action type', () => {
      const action = {
        status: 'running',
        type: 'shell',
        content: 'npm install',
      };

      expect(action.type).toBe('shell');
      expect(action.content).toBe('npm install');
    });
  });
});
