import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
})();

// mock document
const documentMock = {
  querySelector: vi.fn(() => ({
    getAttribute: vi.fn(() => null),
    setAttribute: vi.fn(),
  })),
};

// set up mocks before importing the module
vi.stubGlobal('localStorage', localStorageMock);
vi.stubGlobal('document', documentMock);

describe('theme store', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('DEFAULT_THEME', () => {
    it('should be dark', async () => {
      const { DEFAULT_THEME } = await import('./theme');

      expect(DEFAULT_THEME).toBe('dark');
    });
  });

  describe('kTheme', () => {
    it('should be bolt_theme', async () => {
      const { kTheme } = await import('./theme');

      expect(kTheme).toBe('bolt_theme');
    });
  });

  describe('themeIsDark', () => {
    it('should return true when theme is dark', async () => {
      const { themeStore, themeIsDark } = await import('./theme');
      themeStore.set('dark');

      expect(themeIsDark()).toBe(true);
    });

    it('should return false when theme is light', async () => {
      const { themeStore, themeIsDark } = await import('./theme');
      themeStore.set('light');

      expect(themeIsDark()).toBe(false);
    });
  });

  describe('toggleTheme', () => {
    it('should toggle from dark to light', async () => {
      const { themeStore, toggleTheme } = await import('./theme');
      themeStore.set('dark');

      toggleTheme();

      expect(themeStore.get()).toBe('light');
    });

    it('should toggle from light to dark', async () => {
      const { themeStore, toggleTheme } = await import('./theme');
      themeStore.set('light');

      toggleTheme();

      expect(themeStore.get()).toBe('dark');
    });

    it('should persist theme to localStorage', async () => {
      const { themeStore, toggleTheme, kTheme } = await import('./theme');
      themeStore.set('dark');

      toggleTheme();

      expect(localStorageMock.setItem).toHaveBeenCalledWith(kTheme, 'light');
    });

    it('should update data-theme attribute on html element', async () => {
      const mockSetAttribute = vi.fn();
      documentMock.querySelector.mockReturnValue({
        getAttribute: vi.fn(),
        setAttribute: mockSetAttribute,
      });

      const { themeStore, toggleTheme } = await import('./theme');
      themeStore.set('dark');

      toggleTheme();

      expect(mockSetAttribute).toHaveBeenCalledWith('data-theme', 'light');
    });
  });

  describe('Theme type', () => {
    it('should only accept dark or light values', async () => {
      const { themeStore } = await import('./theme');

      // these should work without type errors
      themeStore.set('dark');
      expect(themeStore.get()).toBe('dark');

      themeStore.set('light');
      expect(themeStore.get()).toBe('light');
    });
  });
});
