import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// mock workbenchStore before importing settings
vi.mock('~/lib/stores/workbench', () => ({
  workbenchStore: {
    toggleTerminal: vi.fn(),
  },
}));

// mock runtime to avoid esbuild-wasm import in test environment
vi.mock('~/lib/runtime', () => {
  const { atom } = require('nanostores');
  return {
    runtimeTypeStore: atom('browser'),
  };
});

// import after mocking
import { useShortcuts, shortcutEventEmitter } from './useShortcuts';
import { shortcutsStore } from '~/lib/stores/settings';

describe('useShortcuts', () => {
  let originalShortcuts: ReturnType<typeof shortcutsStore.get>;

  beforeEach(() => {
    originalShortcuts = shortcutsStore.get();
  });

  afterEach(() => {
    shortcutsStore.set(originalShortcuts);
  });

  describe('keyboard event handling', () => {
    it('should call action when shortcut key is pressed', () => {
      const action = vi.fn();
      shortcutsStore.setKey('toggleTerminal', {
        key: 'j',
        ctrlOrMetaKey: true,
        action,
      });

      renderHook(() => useShortcuts());

      act(() => {
        const event = new KeyboardEvent('keydown', {
          key: 'j',
          ctrlKey: true,
        });
        window.dispatchEvent(event);
      });

      expect(action).toHaveBeenCalled();
    });

    it('should work with metaKey when ctrlOrMetaKey is true', () => {
      const action = vi.fn();
      shortcutsStore.setKey('toggleTerminal', {
        key: 'j',
        ctrlOrMetaKey: true,
        action,
      });

      renderHook(() => useShortcuts());

      act(() => {
        const event = new KeyboardEvent('keydown', {
          key: 'j',
          metaKey: true,
        });
        window.dispatchEvent(event);
      });

      expect(action).toHaveBeenCalled();
    });

    it('should not call action when wrong key is pressed', () => {
      const action = vi.fn();
      shortcutsStore.setKey('toggleTerminal', {
        key: 'j',
        ctrlOrMetaKey: true,
        action,
      });

      renderHook(() => useShortcuts());

      act(() => {
        const event = new KeyboardEvent('keydown', {
          key: 'k',
          ctrlKey: true,
        });
        window.dispatchEvent(event);
      });

      expect(action).not.toHaveBeenCalled();
    });

    it('should not call action without modifier key', () => {
      const action = vi.fn();
      shortcutsStore.setKey('toggleTerminal', {
        key: 'j',
        ctrlOrMetaKey: true,
        action,
      });

      renderHook(() => useShortcuts());

      act(() => {
        const event = new KeyboardEvent('keydown', {
          key: 'j',
        });
        window.dispatchEvent(event);
      });

      expect(action).not.toHaveBeenCalled();
    });

    it('should be case insensitive', () => {
      const action = vi.fn();
      shortcutsStore.setKey('toggleTerminal', {
        key: 'j',
        ctrlOrMetaKey: true,
        action,
      });

      renderHook(() => useShortcuts());

      act(() => {
        const event = new KeyboardEvent('keydown', {
          key: 'J',
          ctrlKey: true,
        });
        window.dispatchEvent(event);
      });

      expect(action).toHaveBeenCalled();
    });

    it('should cleanup event listener on unmount', () => {
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');

      const { unmount } = renderHook(() => useShortcuts());

      unmount();

      expect(removeEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
    });
  });

  describe('ShortcutEventEmitter', () => {
    it('should dispatch events', () => {
      const callback = vi.fn();
      const unsubscribe = shortcutEventEmitter.on('toggleTerminal', callback);

      shortcutEventEmitter.dispatch('toggleTerminal');

      expect(callback).toHaveBeenCalled();

      unsubscribe();
    });

    it('should remove listener on unsubscribe', () => {
      const callback = vi.fn();
      const unsubscribe = shortcutEventEmitter.on('toggleTerminal', callback);

      unsubscribe();
      shortcutEventEmitter.dispatch('toggleTerminal');

      expect(callback).not.toHaveBeenCalled();
    });
  });
});
