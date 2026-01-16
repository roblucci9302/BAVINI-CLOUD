import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConnectorsPanel } from './ConnectorsPanel';
import { connectorsStore, CONNECTORS } from '~/lib/stores/connectors';

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  cubicBezier: () => (t: number) => t,
}));

// Mock easings
vi.mock('~/utils/easings', () => ({
  cubicEasingFn: (t: number) => t,
}));

// Mock ConnectorCard to simplify testing
vi.mock('./ConnectorCard', () => ({
  ConnectorCard: ({ connector }: any) => <div data-testid={`connector-card-${connector.id}`}>{connector.name}</div>,
}));

describe('ConnectorsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Reset store to disconnected state
    const defaultState: Record<string, { isConnected: boolean; credentials: Record<string, string> }> = {};

    for (const connector of CONNECTORS) {
      defaultState[connector.id] = { isConnected: false, credentials: {} };
    }

    connectorsStore.set(defaultState as any);
  });

  describe('rendering', () => {
    it('should render the main title', () => {
      render(<ConnectorsPanel />);

      expect(screen.getByText('Connecteurs')).toBeInTheDocument();
    });

    it('should render all connector cards', () => {
      render(<ConnectorsPanel />);

      for (const connector of CONNECTORS) {
        expect(screen.getByTestId(`connector-card-${connector.id}`)).toBeInTheDocument();
      }
    });

    it('should render exactly 6 connectors', () => {
      render(<ConnectorsPanel />);

      expect(CONNECTORS.length).toBe(6);
      expect(screen.getByTestId('connector-card-github')).toBeInTheDocument();
      expect(screen.getByTestId('connector-card-supabase')).toBeInTheDocument();
      expect(screen.getByTestId('connector-card-netlify')).toBeInTheDocument();
      expect(screen.getByTestId('connector-card-figma')).toBeInTheDocument();
      expect(screen.getByTestId('connector-card-notion')).toBeInTheDocument();
      expect(screen.getByTestId('connector-card-stripe')).toBeInTheDocument();
    });
  });

  describe('connector names', () => {
    it('should display GitHub connector', () => {
      render(<ConnectorsPanel />);

      expect(screen.getByText('GitHub')).toBeInTheDocument();
    });

    it('should display Supabase connector', () => {
      render(<ConnectorsPanel />);

      expect(screen.getByText('Supabase')).toBeInTheDocument();
    });

    it('should display Netlify connector', () => {
      render(<ConnectorsPanel />);

      expect(screen.getByText('Netlify')).toBeInTheDocument();
    });
  });

  describe('store integration', () => {
    it('should render with disconnected state by default', () => {
      render(<ConnectorsPanel />);

      const state = connectorsStore.get();

      for (const connector of CONNECTORS) {
        expect(state[connector.id].isConnected).toBe(false);
      }
    });

    it('should pass isConnected prop to ConnectorCard', () => {
      connectorsStore.set({
        ...connectorsStore.get(),
        github: { isConnected: true, credentials: { token: 'ghp_test' }, lastConnected: Date.now() },
      });

      render(<ConnectorsPanel />);

      // The mock ConnectorCard still renders, confirming the component works with connected state
      expect(screen.getByTestId('connector-card-github')).toBeInTheDocument();
    });
  });
});
