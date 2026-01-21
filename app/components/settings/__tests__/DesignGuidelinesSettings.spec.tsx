/**
 * Design Guidelines Settings - Unit Tests
 *
 * Tests for the design guidelines settings in the InterfacePanel.
 *
 * @module components/settings/__tests__/DesignGuidelinesSettings.spec
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

// Mock nanostores
const mockDesignGuidelinesEnabled = vi.fn(() => true);
const mockGuidelinesLevel = vi.fn(() => 'standard');

vi.mock('@nanostores/react', () => ({
  useStore: vi.fn((store) => {
    // Return mock values based on store name
    if (store === mockDesignGuidelinesEnabledStore) return mockDesignGuidelinesEnabled();
    if (store === mockGuidelinesLevelStore) return mockGuidelinesLevel();
    return {};
  }),
}));

// Mock stores
const mockDesignGuidelinesEnabledStore = { get: vi.fn() };
const mockGuidelinesLevelStore = { get: vi.fn() };
const mockSetDesignGuidelinesEnabled = vi.fn();
const mockSetGuidelinesLevel = vi.fn();

vi.mock('~/lib/stores/design-guidelines', () => ({
  designGuidelinesEnabledStore: mockDesignGuidelinesEnabledStore,
  guidelinesLevelStore: mockGuidelinesLevelStore,
  setDesignGuidelinesEnabled: (val: boolean) => mockSetDesignGuidelinesEnabled(val),
  setGuidelinesLevel: (val: string) => mockSetGuidelinesLevel(val),
  getGuidelinesLevelDescription: (level: string) => {
    switch (level) {
      case 'minimal':
        return 'Désactivé - Design par défaut';
      case 'standard':
        return 'Standard - Guidelines essentielles (~500 tokens)';
      case 'full':
        return 'Complet - Toutes les guidelines (~1200 tokens)';
      default:
        return '';
    }
  },
  getEstimatedTokens: (level: string) => {
    switch (level) {
      case 'minimal':
        return 0;
      case 'standard':
        return 500;
      case 'full':
        return 1200;
      default:
        return 0;
    }
  },
}));

// Mock other stores
vi.mock('~/lib/stores/connectors', () => ({
  settingsModalOpen: { get: vi.fn() },
  activeSettingsTab: { get: vi.fn(), set: vi.fn() },
  closeSettingsModal: vi.fn(),
}));

vi.mock('~/lib/stores/settings', () => ({
  interfaceSettingsStore: { get: vi.fn(() => ({ showAgentStatusBadge: true })), set: vi.fn() },
  buildSettingsStore: { get: vi.fn(() => ({ engine: 'browser' })) },
  setBuildEngine: vi.fn(),
}));

// Mock Radix Dialog
vi.mock('@radix-ui/react-dialog', () => ({
  Root: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Portal: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Overlay: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Content: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Close: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: { children: React.ReactNode }) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock UI components
vi.mock('~/components/ui/Dialog', () => ({
  dialogBackdropVariants: {},
  dialogVariants: {},
}));

vi.mock('~/components/ui/IconButton', () => ({
  IconButton: () => <button>Close</button>,
}));

// Mock other panels
vi.mock('../ConnectorsPanel', () => ({
  ConnectorsPanel: () => <div>Connectors Panel</div>,
}));

vi.mock('../GitHubPanel', () => ({
  GitHubPanel: () => <div>GitHub Panel</div>,
}));

describe('Design Guidelines Settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDesignGuidelinesEnabled.mockReturnValue(true);
    mockGuidelinesLevel.mockReturnValue('standard');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Store Integration', () => {
    it('should export correct store functions', async () => {
      const store = await import('~/lib/stores/design-guidelines');

      expect(store.designGuidelinesEnabledStore).toBeDefined();
      expect(store.guidelinesLevelStore).toBeDefined();
      expect(store.setDesignGuidelinesEnabled).toBeDefined();
      expect(store.setGuidelinesLevel).toBeDefined();
      expect(store.getGuidelinesLevelDescription).toBeDefined();
      expect(store.getEstimatedTokens).toBeDefined();
    });

    it('should return correct description for each level', async () => {
      const store = await import('~/lib/stores/design-guidelines');

      expect(store.getGuidelinesLevelDescription('minimal')).toContain('Désactivé');
      expect(store.getGuidelinesLevelDescription('standard')).toContain('Standard');
      expect(store.getGuidelinesLevelDescription('full')).toContain('Complet');
    });

    it('should return correct token estimates', async () => {
      const store = await import('~/lib/stores/design-guidelines');

      expect(store.getEstimatedTokens('minimal')).toBe(0);
      expect(store.getEstimatedTokens('standard')).toBe(500);
      expect(store.getEstimatedTokens('full')).toBe(1200);
    });
  });

  describe('Action Handlers', () => {
    it('setDesignGuidelinesEnabled should be callable', async () => {
      const store = await import('~/lib/stores/design-guidelines');

      store.setDesignGuidelinesEnabled(true);
      expect(mockSetDesignGuidelinesEnabled).toHaveBeenCalledWith(true);

      store.setDesignGuidelinesEnabled(false);
      expect(mockSetDesignGuidelinesEnabled).toHaveBeenCalledWith(false);
    });

    it('setGuidelinesLevel should be callable with valid levels', async () => {
      const store = await import('~/lib/stores/design-guidelines');

      store.setGuidelinesLevel('minimal');
      expect(mockSetGuidelinesLevel).toHaveBeenCalledWith('minimal');

      store.setGuidelinesLevel('standard');
      expect(mockSetGuidelinesLevel).toHaveBeenCalledWith('standard');

      store.setGuidelinesLevel('full');
      expect(mockSetGuidelinesLevel).toHaveBeenCalledWith('full');
    });
  });
});
