import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GitHubPanel } from './GitHubPanel';

// Mock the stores
vi.mock('~/lib/stores/github', () => ({
  githubStore: { subscribe: vi.fn(), get: vi.fn() },
  isGitHubConnected: { subscribe: vi.fn(), get: vi.fn(() => false) },
  githubUser: { subscribe: vi.fn(), get: vi.fn(() => null) },
  githubRepos: { subscribe: vi.fn(), get: vi.fn(() => []) },
  selectedGitHubRepo: { subscribe: vi.fn(), get: vi.fn(() => null) },
  githubIssues: { subscribe: vi.fn(), get: vi.fn(() => []) },
  githubPullRequests: { subscribe: vi.fn(), get: vi.fn(() => []) },
  isLoading: { subscribe: vi.fn(), get: vi.fn(() => false) },
  githubError: { subscribe: vi.fn(), get: vi.fn(() => null) },
  initializeGitHub: vi.fn(),
  disconnectGitHub: vi.fn(),
  selectRepo: vi.fn(),
  clearSelectedRepo: vi.fn(),
  fetchRepoIssues: vi.fn(),
  fetchRepoPullRequests: vi.fn(),
  clearGitHubError: vi.fn(),
}));

vi.mock('~/lib/auth/tokens', () => ({
  getAccessToken: vi.fn(),
}));

vi.mock('@nanostores/react', () => ({
  useStore: vi.fn((store) => store.get()),
}));

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
    a: ({ children, ...props }: any) => <a {...props}>{children}</a>,
  },
  AnimatePresence: ({ children }: any) => children,
  cubicBezier: () => (t: number) => t,
}));

vi.mock('~/utils/easings', () => ({
  cubicEasingFn: (t: number) => t,
}));

import * as authTokens from '~/lib/auth/tokens';
import * as githubStore from '~/lib/stores/github';

describe('GitHubPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('not connected state', () => {
    it('should show not connected message when no token', () => {
      vi.mocked(authTokens.getAccessToken).mockReturnValue(undefined);

      render(<GitHubPanel />);

      expect(screen.getByText('GitHub non connecté')).toBeInTheDocument();
      expect(screen.getByText(/Ajoutez votre token GitHub/)).toBeInTheDocument();
    });

    it('should show link to create token', () => {
      vi.mocked(authTokens.getAccessToken).mockReturnValue(undefined);

      render(<GitHubPanel />);

      const link = screen.getByRole('link', { name: /Créer un token GitHub/i });
      expect(link).toHaveAttribute('href', expect.stringContaining('github.com/settings/tokens'));
    });
  });

  describe('loading state', () => {
    it('should show loading indicator when loading', () => {
      vi.mocked(authTokens.getAccessToken).mockReturnValue('token');
      vi.mocked(githubStore.isLoading.get).mockReturnValue(true);
      vi.mocked(githubStore.isGitHubConnected.get).mockReturnValue(false);

      render(<GitHubPanel />);

      expect(screen.getByText('Connexion à GitHub...')).toBeInTheDocument();
    });
  });

  describe('error state', () => {
    it('should show error message when error occurs without connection', () => {
      vi.mocked(authTokens.getAccessToken).mockReturnValue('token');
      vi.mocked(githubStore.isLoading.get).mockReturnValue(false);
      vi.mocked(githubStore.isGitHubConnected.get).mockReturnValue(false);
      vi.mocked(githubStore.githubError.get).mockReturnValue('Authentication failed');

      render(<GitHubPanel />);

      expect(screen.getByText('Authentication failed')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Réessayer/i })).toBeInTheDocument();
    });
  });

  describe('connected state', () => {
    beforeEach(() => {
      vi.mocked(authTokens.getAccessToken).mockReturnValue('token');
      vi.mocked(githubStore.isLoading.get).mockReturnValue(false);
      vi.mocked(githubStore.isGitHubConnected.get).mockReturnValue(true);
      vi.mocked(githubStore.githubUser.get).mockReturnValue({
        login: 'testuser',
        name: 'Test User',
        avatar_url: 'https://avatars.githubusercontent.com/u/123',
      } as any);
      vi.mocked(githubStore.githubRepos.get).mockReturnValue([
        {
          id: 1,
          name: 'repo1',
          full_name: 'testuser/repo1',
          owner: { login: 'testuser' },
          private: false,
          description: 'Test repo',
          language: 'TypeScript',
          stargazers_count: 10,
        },
      ] as any);
      vi.mocked(githubStore.githubError.get).mockReturnValue(null);
    });

    it('should show user info when connected', () => {
      render(<GitHubPanel />);

      expect(screen.getByText('Test User')).toBeInTheDocument();
      expect(screen.getByText('@testuser')).toBeInTheDocument();
    });

    it('should show repositories list', () => {
      render(<GitHubPanel />);

      expect(screen.getByText('Repositories')).toBeInTheDocument();
      expect(screen.getByText('repo1')).toBeInTheDocument();
    });

    it('should show repository details', () => {
      render(<GitHubPanel />);

      expect(screen.getByText('Test repo')).toBeInTheDocument();
      expect(screen.getByText('TypeScript')).toBeInTheDocument();
    });

    it('should show search input', () => {
      render(<GitHubPanel />);

      expect(screen.getByPlaceholderText('Rechercher un repository...')).toBeInTheDocument();
    });

    it('should show disconnect button', () => {
      render(<GitHubPanel />);

      expect(screen.getByText('Déconnecter GitHub')).toBeInTheDocument();
    });
  });

  describe('selected repository', () => {
    beforeEach(() => {
      vi.mocked(authTokens.getAccessToken).mockReturnValue('token');
      vi.mocked(githubStore.isLoading.get).mockReturnValue(false);
      vi.mocked(githubStore.isGitHubConnected.get).mockReturnValue(true);
      vi.mocked(githubStore.githubUser.get).mockReturnValue({
        login: 'testuser',
        name: 'Test User',
        avatar_url: 'https://avatars.githubusercontent.com/u/123',
      } as any);
      vi.mocked(githubStore.githubRepos.get).mockReturnValue([]);
      vi.mocked(githubStore.selectedGitHubRepo.get).mockReturnValue({ owner: 'testuser', repo: 'repo1' });
      vi.mocked(githubStore.githubIssues.get).mockReturnValue([
        {
          id: 1,
          number: 1,
          title: 'Test Issue',
          state: 'open',
          user: { login: 'testuser' },
          html_url: 'https://github.com',
        },
      ] as any);
      vi.mocked(githubStore.githubPullRequests.get).mockReturnValue([]);
      vi.mocked(githubStore.githubError.get).mockReturnValue(null);
    });

    it('should show selected repo name', () => {
      render(<GitHubPanel />);

      expect(screen.getByText('testuser/repo1')).toBeInTheDocument();
    });

    it('should show issues tab', () => {
      render(<GitHubPanel />);

      expect(screen.getByText(/Issues/)).toBeInTheDocument();
    });

    it('should show pull requests tab', () => {
      render(<GitHubPanel />);

      expect(screen.getByText(/Pull Requests/)).toBeInTheDocument();
    });

    it('should show issue in list', () => {
      render(<GitHubPanel />);

      expect(screen.getByText('Test Issue')).toBeInTheDocument();
    });

    it('should show quick action buttons', () => {
      render(<GitHubPanel />);

      expect(screen.getByText('Nouvelle Issue')).toBeInTheDocument();
      expect(screen.getByText('Nouvelle PR')).toBeInTheDocument();
    });
  });
});
