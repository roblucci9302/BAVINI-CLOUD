/**
 * =============================================================================
 * Tests: HMR Manager (hmr-manager.ts)
 * =============================================================================
 * FIX 3.1: Tests for Hot Module Replacement manager.
 * =============================================================================
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  HMRManager,
  createHMRManager,
  classifyChange,
  type ChangeType,
  type HMRStatus,
} from '../hmr-manager';

describe('classifyChange', () => {
  describe('CSS files', () => {
    it('should classify .css as css', () => {
      expect(classifyChange('/src/styles.css')).toBe('css');
    });

    it('should classify .scss as css', () => {
      expect(classifyChange('/src/styles.scss')).toBe('css');
    });

    it('should classify .sass as css', () => {
      expect(classifyChange('/src/styles.sass')).toBe('css');
    });

    it('should classify .less as css', () => {
      expect(classifyChange('/src/styles.less')).toBe('css');
    });

    it('should classify .styl as css', () => {
      expect(classifyChange('/src/styles.styl')).toBe('css');
    });
  });

  describe('JavaScript files', () => {
    it('should classify .js as js', () => {
      expect(classifyChange('/src/index.js')).toBe('js');
    });

    it('should classify .jsx as js', () => {
      expect(classifyChange('/src/App.jsx')).toBe('js');
    });

    it('should classify .ts as js', () => {
      expect(classifyChange('/src/utils.ts')).toBe('js');
    });

    it('should classify .tsx as js', () => {
      expect(classifyChange('/src/Component.tsx')).toBe('js');
    });

    it('should classify .mjs as js', () => {
      expect(classifyChange('/src/module.mjs')).toBe('js');
    });

    it('should classify .cjs as js', () => {
      expect(classifyChange('/src/config.cjs')).toBe('js');
    });
  });

  describe('Framework files', () => {
    it('should classify .vue as js (needs full reload)', () => {
      expect(classifyChange('/src/App.vue')).toBe('js');
    });

    it('should classify .svelte as js (needs full reload)', () => {
      expect(classifyChange('/src/App.svelte')).toBe('js');
    });

    it('should classify .astro as js (needs full reload)', () => {
      expect(classifyChange('/src/pages/index.astro')).toBe('js');
    });
  });

  describe('Config files', () => {
    it('should classify package.json as config', () => {
      expect(classifyChange('/package.json')).toBe('config');
    });

    it('should classify tsconfig.json as config', () => {
      expect(classifyChange('/tsconfig.json')).toBe('config');
    });

    // Note: .config.ts/.config.js files are classified as 'js' because
    // extension check happens before config pattern check.
    // This is intentional - config changes need full reload anyway.
    it('should classify vite.config.ts as js (extension takes precedence)', () => {
      expect(classifyChange('/vite.config.ts')).toBe('js');
    });

    it('should classify tailwind.config.js as js (extension takes precedence)', () => {
      expect(classifyChange('/tailwind.config.js')).toBe('js');
    });
  });

  describe('Asset files', () => {
    it('should classify images as asset', () => {
      expect(classifyChange('/src/logo.png')).toBe('asset');
      expect(classifyChange('/src/banner.jpg')).toBe('asset');
      expect(classifyChange('/src/icon.svg')).toBe('asset');
      expect(classifyChange('/src/photo.webp')).toBe('asset');
    });

    it('should classify fonts as asset', () => {
      expect(classifyChange('/fonts/Inter.woff2')).toBe('asset');
      expect(classifyChange('/fonts/Roboto.ttf')).toBe('asset');
    });
  });

  describe('Unknown files', () => {
    it('should classify unknown extensions as unknown', () => {
      expect(classifyChange('/data.json')).toBe('unknown');
      expect(classifyChange('/readme.md')).toBe('unknown');
      expect(classifyChange('/file.xyz')).toBe('unknown');
    });
  });
});

describe('HMRManager', () => {
  let manager: HMRManager;

  beforeEach(() => {
    vi.useFakeTimers();
    manager = createHMRManager();
  });

  afterEach(() => {
    vi.useRealTimers();
    manager.destroy();
  });

  describe('status', () => {
    it('should start with idle status', () => {
      expect(manager.status).toBe('idle');
    });
  });

  describe('setCallbacks', () => {
    it('should call onStatusChange when status changes', async () => {
      const onStatusChange = vi.fn();
      manager.setCallbacks({ onStatusChange });

      manager.notifyChange('/src/styles.css', 'body { color: red; }');

      // Advance past debounce
      await vi.advanceTimersByTimeAsync(150);

      expect(onStatusChange).toHaveBeenCalled();
    });

    it('should call onCSSUpdate for CSS changes', async () => {
      const onCSSUpdate = vi.fn();
      manager.setCallbacks({ onCSSUpdate });

      manager.notifyChange('/src/styles.css', 'body { color: red; }');

      await vi.advanceTimersByTimeAsync(150);

      expect(onCSSUpdate).toHaveBeenCalledWith('body { color: red; }');
    });

    it('should call onFullReload for JS changes', async () => {
      const onFullReload = vi.fn();
      manager.setCallbacks({ onFullReload });

      manager.notifyChange('/src/index.js', 'console.log("hello")');

      await vi.advanceTimersByTimeAsync(150);

      expect(onFullReload).toHaveBeenCalled();
    });
  });

  describe('notifyChange', () => {
    it('should debounce multiple changes', async () => {
      const onCSSUpdate = vi.fn();
      manager.setCallbacks({ onCSSUpdate });

      // Multiple rapid changes
      manager.notifyChange('/src/a.css', 'a');
      manager.notifyChange('/src/b.css', 'b');
      manager.notifyChange('/src/c.css', 'c');

      // Should not have processed yet
      expect(onCSSUpdate).not.toHaveBeenCalled();

      // Advance past debounce
      await vi.advanceTimersByTimeAsync(150);

      // Should combine all CSS
      expect(onCSSUpdate).toHaveBeenCalledTimes(1);
      expect(onCSSUpdate).toHaveBeenCalledWith(expect.stringContaining('a'));
      expect(onCSSUpdate).toHaveBeenCalledWith(expect.stringContaining('b'));
      expect(onCSSUpdate).toHaveBeenCalledWith(expect.stringContaining('c'));
    });

    it('should trigger full reload if any change is JS', async () => {
      const onFullReload = vi.fn();
      const onCSSUpdate = vi.fn();
      manager.setCallbacks({ onFullReload, onCSSUpdate });

      manager.notifyChange('/src/styles.css', 'css');
      manager.notifyChange('/src/index.js', 'js');

      await vi.advanceTimersByTimeAsync(150);

      // JS change takes precedence - full reload
      expect(onFullReload).toHaveBeenCalled();
    });

    it('should trigger full reload for config changes', async () => {
      const onFullReload = vi.fn();
      manager.setCallbacks({ onFullReload });

      manager.notifyChange('/package.json', '{}');

      await vi.advanceTimersByTimeAsync(150);

      expect(onFullReload).toHaveBeenCalled();
    });
  });

  describe('setDebounceMs', () => {
    it('should respect custom debounce time', async () => {
      manager.setDebounceMs(500);

      const onCSSUpdate = vi.fn();
      manager.setCallbacks({ onCSSUpdate });

      manager.notifyChange('/src/styles.css', 'css');

      // Should not fire at 100ms
      await vi.advanceTimersByTimeAsync(100);
      expect(onCSSUpdate).not.toHaveBeenCalled();

      // Should not fire at 400ms
      await vi.advanceTimersByTimeAsync(300);
      expect(onCSSUpdate).not.toHaveBeenCalled();

      // Should fire after 500ms total
      await vi.advanceTimersByTimeAsync(200);
      expect(onCSSUpdate).toHaveBeenCalled();
    });
  });

  describe('forceReload', () => {
    it('should trigger full reload immediately', () => {
      const onFullReload = vi.fn();
      manager.setCallbacks({ onFullReload });

      manager.forceReload();

      expect(onFullReload).toHaveBeenCalled();
    });
  });

  describe('setBuildId', () => {
    it('should update build ID for cache busting', () => {
      manager.setBuildId('abc123');
      // Build ID is used internally for postMessage
      // Just verify it doesn't throw
      expect(() => manager.setBuildId('xyz789')).not.toThrow();
    });
  });

  describe('setPreviewFrame', () => {
    it('should accept iframe reference', () => {
      const iframe = document.createElement('iframe');
      expect(() => manager.setPreviewFrame(iframe)).not.toThrow();
    });

    it('should accept null', () => {
      expect(() => manager.setPreviewFrame(null)).not.toThrow();
    });
  });

  describe('getHMRClientScript', () => {
    it('should return valid script tag', () => {
      const script = manager.getHMRClientScript();

      expect(script).toContain('<script>');
      expect(script).toContain('</script>');
      expect(script).toContain('bavini-hmr');
    });

    it('should include message handler', () => {
      const script = manager.getHMRClientScript();

      expect(script).toContain("addEventListener('message'");
      expect(script).toContain('css-update');
      expect(script).toContain('full-reload');
    });
  });

  describe('destroy', () => {
    it('should clear pending updates', async () => {
      const onCSSUpdate = vi.fn();
      manager.setCallbacks({ onCSSUpdate });

      manager.notifyChange('/src/styles.css', 'css');

      // Destroy before debounce fires
      manager.destroy();

      await vi.advanceTimersByTimeAsync(200);

      // Should not fire after destroy
      expect(onCSSUpdate).not.toHaveBeenCalled();
    });

    it('should reset status to idle', () => {
      manager.destroy();
      expect(manager.status).toBe('idle');
    });
  });
});

describe('createHMRManager', () => {
  it('should create new HMRManager instance', () => {
    const manager = createHMRManager();
    expect(manager).toBeInstanceOf(HMRManager);
    manager.destroy();
  });
});
