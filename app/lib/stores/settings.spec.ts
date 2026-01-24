import { describe, it, expect, beforeEach, vi } from 'vitest';
import { atom } from 'nanostores';

// mock workbenchStore to avoid indexedDB dependency
vi.mock('./workbench', () => ({
  workbenchStore: {
    toggleTerminal: vi.fn(),
  },
}));

// mock runtime module to avoid WebContainer dependency
vi.mock('~/lib/runtime', () => ({
  runtimeTypeStore: atom('webcontainer'),
}));

// import after mocking
import { shortcutsStore, settingsStore, buildSettingsStore, setBuildEngine, getBuildEngine, type Shortcut } from './settings';

describe('settings store', () => {
  describe('shortcutsStore', () => {
    it('should have toggleTerminal shortcut by default', () => {
      const shortcuts = shortcutsStore.get();

      expect(shortcuts.toggleTerminal).toBeDefined();
      expect(shortcuts.toggleTerminal.key).toBe('j');
      expect(shortcuts.toggleTerminal.ctrlOrMetaKey).toBe(true);
    });

    it('should have action function for toggleTerminal', () => {
      const shortcuts = shortcutsStore.get();

      expect(typeof shortcuts.toggleTerminal.action).toBe('function');
    });
  });

  describe('settingsStore', () => {
    it('should contain shortcuts from shortcutsStore', () => {
      const settings = settingsStore.get();

      expect(settings.shortcuts).toBeDefined();
      expect(settings.shortcuts.toggleTerminal).toBeDefined();
    });

    it('should sync with shortcutsStore updates', () => {
      const newShortcut: Shortcut = {
        key: 'k',
        ctrlOrMetaKey: true,
        action: vi.fn(),
      };

      shortcutsStore.setKey('toggleTerminal', newShortcut);

      const settings = settingsStore.get();

      expect(settings.shortcuts.toggleTerminal.key).toBe('k');
    });
  });

  describe('Shortcut interface', () => {
    it('should support optional modifier keys', () => {
      const shortcut: Shortcut = {
        key: 'a',
        action: vi.fn(),
      };

      expect(shortcut.ctrlKey).toBeUndefined();
      expect(shortcut.shiftKey).toBeUndefined();
      expect(shortcut.altKey).toBeUndefined();
      expect(shortcut.metaKey).toBeUndefined();
      expect(shortcut.ctrlOrMetaKey).toBeUndefined();
    });

    it('should support all modifier keys', () => {
      const shortcut: Shortcut = {
        key: 's',
        ctrlKey: true,
        shiftKey: true,
        altKey: true,
        metaKey: true,
        ctrlOrMetaKey: false,
        action: vi.fn(),
      };

      expect(shortcut.ctrlKey).toBe(true);
      expect(shortcut.shiftKey).toBe(true);
      expect(shortcut.altKey).toBe(true);
      expect(shortcut.metaKey).toBe(true);
      expect(shortcut.ctrlOrMetaKey).toBe(false);
    });
  });

  describe('buildSettingsStore', () => {
    it('should default to browser engine', () => {
      const buildSettings = buildSettingsStore.get();

      // BAVINI defaults to browser engine (not webcontainer)
      expect(buildSettings.engine).toBe('browser');
    });

    it('should update engine via setBuildEngine', () => {
      setBuildEngine('browser');

      expect(buildSettingsStore.get().engine).toBe('browser');

      // Reset to default
      setBuildEngine('webcontainer');
    });

    it('should return current engine via getBuildEngine', () => {
      expect(getBuildEngine()).toBe('webcontainer');
    });

    it('should sync with settingsStore', () => {
      setBuildEngine('browser');

      const settings = settingsStore.get();

      expect(settings.build.engine).toBe('browser');

      // Reset to default
      setBuildEngine('webcontainer');
    });
  });
});
