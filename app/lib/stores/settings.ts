import { map } from 'nanostores';
import { workbenchStore } from './workbench';

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

export interface InterfaceSettings {
  showAgentStatusBadge: boolean;
}

export interface Settings {
  shortcuts: Shortcuts;
  interface: InterfaceSettings;
}

// Default interface settings - loaded synchronously, localStorage deferred
const DEFAULT_INTERFACE_SETTINGS: InterfaceSettings = { showAgentStatusBadge: true };

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

export const settingsStore = map<Settings>({
  shortcuts: shortcutsStore.get(),
  interface: interfaceSettingsStore.get(),
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

// Helper to toggle agent status badge
export function toggleAgentStatusBadge(): void {
  const current = interfaceSettingsStore.get();
  interfaceSettingsStore.set({
    ...current,
    showAgentStatusBadge: !current.showAgentStatusBadge,
  });
}
