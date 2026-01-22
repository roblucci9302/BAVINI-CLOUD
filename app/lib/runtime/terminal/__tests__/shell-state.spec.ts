/**
 * Tests for shell state utilities
 */

import { describe, it, expect } from 'vitest';
import {
  createShellState,
  updateCwd,
  setEnvVar,
  unsetEnvVar,
  addToHistory,
  updateExitCode,
  applyStateUpdates,
  expandEnvVars,
  getPromptString,
  serializeState,
  deserializeState,
} from '../shell-state';

describe('shell-state', () => {
  describe('createShellState', () => {
    it('should create default state', () => {
      const state = createShellState();
      expect(state.cwd).toBe('/home');
      expect(state.env.HOME).toBe('/home');
      expect(state.history).toEqual([]);
      expect(state.lastExitCode).toBe(0);
    });

    it('should apply overrides', () => {
      const state = createShellState({ cwd: '/custom', env: { CUSTOM: 'value' } });
      expect(state.cwd).toBe('/custom');
      expect(state.env.CUSTOM).toBe('value');
    });
  });

  describe('updateCwd', () => {
    it('should update cwd and PWD', () => {
      const state = createShellState({ cwd: '/old' });
      const newState = updateCwd(state, '/new');

      expect(newState.cwd).toBe('/new');
      expect(newState.env.PWD).toBe('/new');
      expect(newState.env.OLDPWD).toBe('/old');
    });
  });

  describe('setEnvVar', () => {
    it('should set environment variable', () => {
      const state = createShellState();
      const newState = setEnvVar(state, 'FOO', 'bar');

      expect(newState.env.FOO).toBe('bar');
    });
  });

  describe('unsetEnvVar', () => {
    it('should remove environment variable', () => {
      const state = createShellState();
      const withVar = setEnvVar(state, 'FOO', 'bar');
      const newState = unsetEnvVar(withVar, 'FOO');

      expect(newState.env.FOO).toBeUndefined();
    });
  });

  describe('addToHistory', () => {
    it('should add command to history', () => {
      const state = createShellState();
      const newState = addToHistory(state, 'ls -la');

      expect(newState.history).toContain('ls -la');
    });

    it('should not add empty commands', () => {
      const state = createShellState();
      const newState = addToHistory(state, '   ');

      expect(newState.history).toHaveLength(0);
    });

    it('should not add duplicate of last command', () => {
      let state = createShellState();
      state = addToHistory(state, 'ls');
      state = addToHistory(state, 'ls');

      expect(state.history).toHaveLength(1);
    });
  });

  describe('updateExitCode', () => {
    it('should update exit code', () => {
      const state = createShellState();
      const newState = updateExitCode(state, 1);

      expect(newState.lastExitCode).toBe(1);
    });
  });

  describe('applyStateUpdates', () => {
    it('should apply multiple updates', () => {
      const state = createShellState();
      const newState = applyStateUpdates(state, {
        cwd: '/new',
        lastExitCode: 42,
      });

      expect(newState.cwd).toBe('/new');
      expect(newState.lastExitCode).toBe(42);
    });
  });

  describe('expandEnvVars', () => {
    it('should expand $VAR syntax', () => {
      const env = { HOME: '/home/user', USER: 'testuser' };
      expect(expandEnvVars('$HOME', env)).toBe('/home/user');
      expect(expandEnvVars('Hello $USER', env)).toBe('Hello testuser');
    });

    it('should expand ${VAR} syntax', () => {
      const env = { HOME: '/home/user' };
      expect(expandEnvVars('${HOME}/docs', env)).toBe('/home/user/docs');
    });

    it('should expand ~ to HOME', () => {
      const env = { HOME: '/home/user' };
      expect(expandEnvVars('~/docs', env)).toBe('/home/user/docs');
      expect(expandEnvVars('~', env)).toBe('/home/user');
    });

    it('should handle undefined variables', () => {
      const env = {};
      expect(expandEnvVars('$UNDEFINED', env)).toBe('');
    });
  });

  describe('getPromptString', () => {
    it('should generate prompt string', () => {
      const state = createShellState({ cwd: '/home' });
      const prompt = getPromptString(state);

      expect(prompt).toContain('user');
      expect(prompt).toContain('bavini');
      expect(prompt).toContain('~');
      expect(prompt).toContain('$');
    });

    it('should show full path when not in home', () => {
      const state = createShellState({ cwd: '/tmp' });
      const prompt = getPromptString(state);

      expect(prompt).toContain('/tmp');
    });
  });

  describe('serializeState and deserializeState', () => {
    it('should round-trip state', () => {
      const state = createShellState({ cwd: '/custom' });
      const serialized = serializeState(state);
      const deserialized = deserializeState(serialized);

      expect(deserialized?.cwd).toBe('/custom');
    });

    it('should handle invalid JSON', () => {
      expect(deserializeState('invalid')).toBeNull();
    });
  });
});
