/**
 * Check if the current viewport is mobile-sized.
 * Uses sm: breakpoint (640px) as the threshold.
 * Safe to call in SSR context - returns false.
 */
export function isMobile(): boolean {
  // SSR guard: innerWidth is not available on server
  if (typeof globalThis.innerWidth === 'undefined') {
    return false;
  }

  return globalThis.innerWidth < 640;
}
