import { atom } from 'nanostores';

export type Theme = 'dark' | 'light';

export const kTheme = 'bolt_theme';

export function themeIsDark() {
  return themeStore.get() === 'dark';
}

export const DEFAULT_THEME = 'dark';

// Initialize with default - the inline script in root.tsx already handles
// reading from localStorage and setting data-theme on the HTML element.
// We sync with that value lazily to avoid blocking the main thread.
export const themeStore = atom<Theme>(DEFAULT_THEME);

// Deferred initialization - sync with HTML attribute set by inline script
let themeInitialized = false;

export function initThemeStore(): void {
  if (themeInitialized || import.meta.env.SSR) {
    return;
  }

  themeInitialized = true;

  // Read from HTML attribute (already set by inline script) - no localStorage read needed
  // Guard against undefined document.documentElement (can happen in tests after cleanup)
  const themeAttribute = document.documentElement?.getAttribute('data-theme') as Theme | null;

  if (themeAttribute && (themeAttribute === 'dark' || themeAttribute === 'light')) {
    themeStore.set(themeAttribute);
  }
}

// Initialize on first idle frame (non-blocking)
if (!import.meta.env.SSR && typeof requestIdleCallback !== 'undefined') {
  requestIdleCallback(() => initThemeStore(), { timeout: 100 });
} else if (!import.meta.env.SSR) {
  setTimeout(initThemeStore, 0);
}

export function toggleTheme() {
  const currentTheme = themeStore.get();
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

  themeStore.set(newTheme);

  localStorage.setItem(kTheme, newTheme);

  document.querySelector('html')?.setAttribute('data-theme', newTheme);
}
