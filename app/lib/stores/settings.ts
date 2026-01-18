import { map } from 'nanostores';
import { workbenchStore } from './workbench';
import { runtimeTypeStore, type RuntimeType } from '~/lib/runtime';

export interface Shortcut {
  key: string;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  ctrlOrMetaKey?: boolean;
  action: () => void;
}

export interface Shortcuts {
  toggleTerminal: Shortcut;
}

/**
 * Build engine type for the runtime.
 * - 'webcontainer': Uses StackBlitz WebContainer (current behavior)
 * - 'browser': Uses esbuild-wasm in browser (future)
 */
export type BuildEngineType = RuntimeType;

export interface InterfaceSettings {
  showAgentStatusBadge: boolean;
}

export interface BuildSettings {
  /** Build engine to use: 'webcontainer' or 'browser' */
  engine: BuildEngineType;
}

export interface Settings {
  shortcuts: Shortcuts;
  interface: InterfaceSettings;
  build: BuildSettings;
}

// Default interface settings - loaded synchronously, localStorage deferred
const DEFAULT_INTERFACE_SETTINGS: InterfaceSettings = { showAgentStatusBadge: false };

// Default build settings - testing browser mode (esbuild-wasm)
const DEFAULT_BUILD_SETTINGS: BuildSettings = { engine: 'browser' };

// Deferred loading from localStorage (non-blocking)
let settingsLoaded = false;

function loadInterfaceSettingsDeferred(): void {
  if (settingsLoaded || typeof window === 'undefined') {
    return;
  }

  settingsLoaded = true;

  try {
    const saved = localStorage.getItem('bavini-interface-settings');

    if (saved) {
      const parsed = JSON.parse(saved) as InterfaceSettings;
      interfaceSettingsStore.set({ ...DEFAULT_INTERFACE_SETTINGS, ...parsed });
    }
  } catch {
    // Ignore parse errors
  }
}

// Save interface settings to localStorage
function saveInterfaceSettings(settings: InterfaceSettings): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    localStorage.setItem('bavini-interface-settings', JSON.stringify(settings));
  } catch {
    // Ignore save errors
  }
}

export const shortcutsStore = map<Shortcuts>({
  toggleTerminal: {
    key: 'j',
    ctrlOrMetaKey: true,
    action: () => workbenchStore.toggleTerminal(),
  },
});

// Initialize with defaults - localStorage loaded lazily
export const interfaceSettingsStore = map<InterfaceSettings>(DEFAULT_INTERFACE_SETTINGS);

// Build settings store - synced with runtimeTypeStore
export const buildSettingsStore = map<BuildSettings>(DEFAULT_BUILD_SETTINGS);

// Load from localStorage on first idle frame (non-blocking)
if (typeof window !== 'undefined') {
  if (typeof requestIdleCallback !== 'undefined') {
    requestIdleCallback(() => loadInterfaceSettingsDeferred(), { timeout: 150 });
  } else {
    setTimeout(loadInterfaceSettingsDeferred, 0);
  }
}

// Persist interface settings changes
interfaceSettingsStore.subscribe((settings) => {
  saveInterfaceSettings(settings);
});

/**
 * Sync flag to prevent infinite loop between buildSettingsStore and runtimeTypeStore.
 * When one store updates the other, this flag prevents re-entrant updates.
 */
let isSyncingBuildRuntime = false;

// Sync buildSettingsStore with runtimeTypeStore (bidirectional, protected against infinite loops)
buildSettingsStore.subscribe((settings) => {
  // Skip if we're already syncing (prevents re-entrancy)
  if (isSyncingBuildRuntime) {
    return;
  }

  // Check if sync is needed
  if (runtimeTypeStore.get() !== settings.engine) {
    isSyncingBuildRuntime = true;

    try {
      runtimeTypeStore.set(settings.engine);
    } finally {
      // Always reset flag, even if set() throws
      isSyncingBuildRuntime = false;
    }
  }
});

runtimeTypeStore.subscribe((type) => {
  // Skip if we're already syncing (prevents re-entrancy)
  if (isSyncingBuildRuntime) {
    return;
  }

  // Check if sync is needed
  if (buildSettingsStore.get().engine !== type) {
    isSyncingBuildRuntime = true;

    try {
      buildSettingsStore.set({ engine: type });
    } finally {
      // Always reset flag, even if set() throws
      isSyncingBuildRuntime = false;
    }
  }
});

export const settingsStore = map<Settings>({
  shortcuts: shortcutsStore.get(),
  interface: interfaceSettingsStore.get(),
  build: buildSettingsStore.get(),
});

shortcutsStore.subscribe((shortcuts) => {
  settingsStore.set({
    ...settingsStore.get(),
    shortcuts,
  });
});

interfaceSettingsStore.subscribe((interfaceSettings) => {
  settingsStore.set({
    ...settingsStore.get(),
    interface: interfaceSettings,
  });
});

buildSettingsStore.subscribe((buildSettings) => {
  settingsStore.set({
    ...settingsStore.get(),
    build: buildSettings,
  });
});

// Helper to toggle agent status badge
export function toggleAgentStatusBadge(): void {
  const current = interfaceSettingsStore.get();
  interfaceSettingsStore.set({
    ...current,
    showAgentStatusBadge: !current.showAgentStatusBadge,
  });
}

/**
 * Set the build engine to use.
 * This will automatically sync with runtimeTypeStore.
 *
 * @param engine - 'webcontainer' or 'browser'
 */
export function setBuildEngine(engine: BuildEngineType): void {
  buildSettingsStore.set({ engine });
}

/**
 * Get the current build engine.
 */
export function getBuildEngine(): BuildEngineType {
  return buildSettingsStore.get().engine;
}
