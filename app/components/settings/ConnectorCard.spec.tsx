import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ConnectorCard } from './ConnectorCard';
import { connectorsStore, type ConnectorConfig, CONNECTORS } from '~/lib/stores/connectors';
import { validateConnector } from '~/lib/connectors';

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    span: ({ children, ...props }: any) => <span {...props}>{children}</span>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
  cubicBezier: () => (t: number) => t,
}));

// Mock easings
vi.mock('~/utils/easings', () => ({
  cubicEasingFn: (t: number) => t,
}));

// Mock react-toastify
vi.mock('react-toastify', () => ({
  toast: {
    success: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock validators
vi.mock('~/lib/connectors', () => ({
  validateConnector: vi.fn(),
  hasValidator: vi.fn().mockReturnValue(true),
}));

// OAuth connector (GitHub)
const mockGithubConnector: ConnectorConfig = {
  id: 'github',
  name: 'GitHub',
  description: 'Gestion de code et repositories',
  category: 'personal',
  icon: 'github',
  docsUrl: 'https://docs.github.com',
  authMethod: 'oauth',
  fields: [
    { key: 'token', label: "Token d'accès personnel", type: 'password', placeholder: 'ghp_...', required: true },
  ],
};

// OAuth connector (Supabase)
const mockSupabaseConnector: ConnectorConfig = {
  id: 'supabase',
  name: 'Supabase',
  description: 'Base de données PostgreSQL et authentification',
  category: 'shared',
  icon: 'supabase',
  docsUrl: 'https://supabase.com/docs',
  authMethod: 'oauth',
  fields: [
    { key: 'url', label: 'URL du projet', type: 'url', placeholder: 'https://xxx.supabase.co', required: true },
    { key: 'anonKey', label: 'Clé Anon', type: 'password', placeholder: 'eyJhbGciOiJIUzI1NiIs...', required: true },
  ],
};

// OAuth connector (Netlify)
const mockNetlifyConnector: ConnectorConfig = {
  id: 'netlify',
  name: 'Netlify',
  description: 'Déploiement et hébergement',
  category: 'shared',
  icon: 'netlify',
  docsUrl: 'https://docs.netlify.com',
  authMethod: 'oauth',
  fields: [
    { key: 'accessToken', label: "Token d'accès", type: 'password', required: true },
    { key: 'siteId', label: 'ID du site', type: 'text', placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' },
  ],
};

describe('ConnectorCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // reset store to disconnected state
    const defaultState: Record<string, { isConnected: boolean; credentials: Record<string, string> }> = {};

    for (const connector of CONNECTORS) {
      defaultState[connector.id] = { isConnected: false, credentials: {} };
    }

    connectorsStore.set(defaultState as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('rendering', () => {
    it('should render connector name', () => {
      render(<ConnectorCard connector={mockGithubConnector} />);

      expect(screen.getByText('GitHub')).toBeInTheDocument();
    });

    it('should render Supabase connector', () => {
      render(<ConnectorCard connector={mockSupabaseConnector} />);

      expect(screen.getByText('Supabase')).toBeInTheDocument();
    });

    it('should render Netlify connector', () => {
      render(<ConnectorCard connector={mockNetlifyConnector} />);

      expect(screen.getByText('Netlify')).toBeInTheDocument();
    });

    it('should show sign-in icon when disconnected', () => {
      const { container } = render(<ConnectorCard connector={mockGithubConnector} />);

      expect(container.querySelector('.i-ph\\:sign-in')).toBeInTheDocument();
    });

    it('should show sign-out icon when connected', () => {
      const { container } = render(<ConnectorCard connector={mockGithubConnector} isConnected={true} />);

      expect(container.querySelector('.i-ph\\:sign-out')).toBeInTheDocument();
    });

    it('should show green dot when connected', () => {
      const { container } = render(<ConnectorCard connector={mockGithubConnector} isConnected={true} />);

      expect(container.querySelector('.bg-green-400')).toBeInTheDocument();
    });
  });

  describe('OAuth connector behavior', () => {
    it('should show toast when OAuth connector button is clicked', async () => {
      const { toast } = await import('react-toastify');

      render(<ConnectorCard connector={mockGithubConnector} />);

      const card = screen.getByText('GitHub').closest('div[class*="cursor-pointer"]');
      fireEvent.click(card!);

      expect(toast.info).toHaveBeenCalledWith('Redirection vers GitHub...');
    });

    it('should disconnect OAuth connector correctly', async () => {
      const { toast } = await import('react-toastify');

      connectorsStore.set({
        ...connectorsStore.get(),
        github: { isConnected: true, credentials: { accessToken: 'test' }, lastConnected: Date.now(), isOAuth: true },
      });

      render(<ConnectorCard connector={mockGithubConnector} isConnected={true} />);

      const card = screen.getByText('GitHub').closest('div[class*="cursor-pointer"]');
      fireEvent.click(card!);

      expect(toast.info).toHaveBeenCalledWith('GitHub déconnecté');
    });
  });

  describe('disconnect', () => {
    it('should disconnect when clicking on connected card', async () => {
      const { toast } = await import('react-toastify');

      connectorsStore.set({
        ...connectorsStore.get(),
        github: { isConnected: true, credentials: { token: 'test' }, lastConnected: Date.now() },
      });

      render(<ConnectorCard connector={mockGithubConnector} isConnected={true} />);

      const card = screen.getByText('GitHub').closest('div[class*="cursor-pointer"]');
      fireEvent.click(card!);

      // should show info toast
      expect(toast.info).toHaveBeenCalledWith('GitHub déconnecté');
    });
  });

  describe('styling', () => {
    it('should have green border when connected', () => {
      const { container } = render(<ConnectorCard connector={mockGithubConnector} isConnected={true} />);

      const card = container.firstChild as HTMLElement;
      expect(card).toHaveClass('border-green-500/30');
    });

    it('should have default border when disconnected', () => {
      const { container } = render(<ConnectorCard connector={mockGithubConnector} isConnected={false} />);

      const card = container.firstChild as HTMLElement;
      expect(card).toHaveClass('border-bolt-elements-borderColor');
    });
  });

  describe('all connectors', () => {
    it('should render GitHub correctly', () => {
      render(<ConnectorCard connector={mockGithubConnector} />);
      expect(screen.getByText('GitHub')).toBeInTheDocument();
    });

    it('should render Supabase correctly', () => {
      render(<ConnectorCard connector={mockSupabaseConnector} />);
      expect(screen.getByText('Supabase')).toBeInTheDocument();
    });

    it('should render Netlify correctly', () => {
      render(<ConnectorCard connector={mockNetlifyConnector} />);
      expect(screen.getByText('Netlify')).toBeInTheDocument();
    });
  });
});
