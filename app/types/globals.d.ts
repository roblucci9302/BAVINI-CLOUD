/**
 * Global TypeScript augmentation for BAVINI runtime globals
 * These replace `as any` casts when accessing global state
 */

/**
 * Vite worker import declarations
 * Allows importing workers with ?worker suffix
 */
declare module '*?worker' {
  const WorkerFactory: new () => Worker;
  export default WorkerFactory;
}

declare module '*.worker.ts?worker' {
  const WorkerFactory: new () => Worker;
  export default WorkerFactory;
}

declare global {
  // esbuild initialization flags
  var __esbuildInitialized: boolean | undefined;
  var __esbuildPromise: Promise<void> | undefined;

  // Tailwind initialization flags
  var __tailwindInitialized: boolean | undefined;
  var __tailwindPromise: Promise<void> | undefined;
  var __tailwindProcessor: unknown | undefined;

  // Error overlay
  var __BAVINI_ERROR_OVERLAY__: unknown | undefined;
}

export {};
