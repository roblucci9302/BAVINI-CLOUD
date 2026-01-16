'use client';

import { memo, useEffect, useState } from 'react';
import { useStore } from '@nanostores/react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  isGitHubConnected,
  githubUser,
  githubRepos,
  selectedGitHubRepo,
  githubIssues,
  githubPullRequests,
  isLoading,
  githubError,
  initializeGitHub,
  disconnectGitHub,
  selectRepo,
  clearSelectedRepo,
  fetchRepoIssues,
  fetchRepoPullRequests,
  clearGitHubError,
} from '~/lib/stores/github';
import { getAccessToken } from '~/lib/auth/tokens';
import { classNames } from '~/utils/classNames';
import { cubicEasingFn } from '~/utils/easings';
import { Spinner } from '~/components/ui/Spinner';
import type { GitHubRepo } from '~/lib/github/types';

// Standard BAVINI transition
const transition = {
  duration: 0.2,
  ease: cubicEasingFn,
};

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.05 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition },
};

export const GitHubPanel = memo(() => {
  const connected = useStore(isGitHubConnected);
  const user = useStore(githubUser);
  const repos = useStore(githubRepos);
  const selectedRepo = useStore(selectedGitHubRepo);
  const issues = useStore(githubIssues);
  const pullRequests = useStore(githubPullRequests);
  const loading = useStore(isLoading);
  const error = useStore(githubError);
  const [searchQuery, setSearchQuery] = useState('');

  const token = getAccessToken('github');

  useEffect(() => {
    if (token && !connected && !loading) {
      initializeGitHub();
    }
  }, [token, connected, loading]);

  const filteredRepos = repos.filter(
    (repo) =>
      repo.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      repo.full_name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const handleRepoSelect = async (repo: GitHubRepo) => {
    selectRepo(repo.owner.login, repo.name);
    await Promise.all([fetchRepoIssues(), fetchRepoPullRequests()]);
  };

  if (!token) {
    return <NotConnectedState />;
  }

  if (loading && !connected) {
    return <LoadingState />;
  }

  if (error && !connected) {
    return <ErrorState error={error} onRetry={initializeGitHub} />;
  }

  return (
    <div className="space-y-6">
      {/* Header with user info */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-bolt-elements-textPrimary">GitHub</h2>
          <p className="text-sm text-bolt-elements-textSecondary mt-1">
            Gérez vos repositories, issues et pull requests
          </p>
        </div>
        {user && (
          <div className="flex items-center gap-3">
            <img src={user.avatar_url} alt={user.login} className="w-8 h-8 rounded-full" />
            <div className="text-right">
              <p className="text-sm font-medium text-bolt-elements-textPrimary">{user.name || user.login}</p>
              <p className="text-xs text-bolt-elements-textSecondary">@{user.login}</p>
            </div>
          </div>
        )}
      </div>

      {/* Error banner */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={transition}
            className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-md"
          >
            <span className="i-ph:warning-circle text-red-400 flex-shrink-0" />
            <span className="flex-1 text-sm text-red-400">{error}</span>
            <button onClick={clearGitHubError} className="text-red-400 hover:text-red-300 transition-colors">
              <span className="i-ph:x" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main content */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Repositories list */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-bolt-elements-textPrimary flex items-center gap-2">
              <span className="i-ph:folder-notch-open" />
              Repositories
              <span className="text-xs px-2 py-0.5 rounded-full bg-bolt-elements-background-depth-3 text-bolt-elements-textSecondary">
                {repos.length}
              </span>
            </h3>
            <button
              onClick={() => initializeGitHub()}
              className="text-xs text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary flex items-center gap-1 transition-colors"
              disabled={loading}
            >
              {loading ? <Spinner size="xs" /> : <span className="i-ph:arrows-clockwise" />}
              Actualiser
            </button>
          </div>

          {/* Search */}
          <div className="relative">
            <span
              className="i-ph:magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-bolt-elements-textTertiary"
              aria-hidden="true"
            />
            <input
              type="text"
              placeholder="Rechercher un repository..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Rechercher un repository"
              className="w-full pl-9 pr-4 py-2 text-sm bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor rounded-md focus:outline-none focus:border-accent-500 text-bolt-elements-textPrimary placeholder:text-bolt-elements-textTertiary transition-colors"
            />
          </div>

          {/* Repos list */}
          <motion.div
            className="space-y-2 max-h-[400px] overflow-y-auto pr-2"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            {filteredRepos.map((repo) => (
              <motion.button
                key={repo.id}
                variants={itemVariants}
                onClick={() => handleRepoSelect(repo)}
                className={classNames(
                  'w-full text-left p-3 rounded-lg border transition-colors',
                  selectedRepo?.repo === repo.name && selectedRepo?.owner === repo.owner.login
                    ? 'bg-accent-500/10 border-accent-500/30'
                    : 'bg-bolt-elements-background-depth-1 border-bolt-elements-borderColor hover:border-bolt-elements-borderColorHover',
                )}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={repo.private ? 'i-ph:lock-simple' : 'i-ph:globe'} />
                      <span className="font-medium text-bolt-elements-textPrimary truncate">{repo.name}</span>
                    </div>
                    {repo.description && (
                      <p className="text-xs text-bolt-elements-textSecondary mt-1 line-clamp-2">{repo.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 ml-2 shrink-0">
                    {repo.language && (
                      <span className="text-xs px-2 py-0.5 rounded bg-bolt-elements-background-depth-3 text-bolt-elements-textSecondary">
                        {repo.language}
                      </span>
                    )}
                    <span className="text-xs text-bolt-elements-textTertiary flex items-center gap-1">
                      <span className="i-ph:star" />
                      {repo.stargazers_count}
                    </span>
                  </div>
                </div>
              </motion.button>
            ))}
            {filteredRepos.length === 0 && (
              <p className="text-center text-sm text-bolt-elements-textTertiary py-8">
                {searchQuery ? 'Aucun repository trouvé' : 'Aucun repository'}
              </p>
            )}
          </motion.div>
        </div>

        {/* Selected repo details */}
        <div className="space-y-4">
          {selectedRepo ? (
            <SelectedRepoDetails
              owner={selectedRepo.owner}
              repo={selectedRepo.repo}
              issues={issues}
              pullRequests={pullRequests}
              loading={loading}
              onClose={clearSelectedRepo}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-center border border-dashed border-bolt-elements-borderColor rounded-lg p-8">
              <span className="i-ph:cursor-click text-4xl text-bolt-elements-textTertiary mb-3" />
              <p className="text-bolt-elements-textSecondary">
                Sélectionnez un repository pour voir les issues et pull requests
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Disconnect button */}
      <div className="pt-4 border-t border-bolt-elements-borderColor">
        <button
          onClick={disconnectGitHub}
          className="px-3 py-1.5 text-sm bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded-md flex items-center gap-2 transition-colors"
        >
          <span className="i-ph:sign-out" />
          Déconnecter GitHub
        </button>
      </div>
    </div>
  );
});

// Sub-components

const NotConnectedState = memo(() => (
  <div className="space-y-6">
    <div>
      <h2 className="text-lg font-semibold text-bolt-elements-textPrimary">GitHub</h2>
      <p className="text-sm text-bolt-elements-textSecondary mt-1">
        Connectez votre compte GitHub pour gérer vos repositories
      </p>
    </div>

    <div className="flex flex-col items-center justify-center py-12 border border-dashed border-bolt-elements-borderColor rounded-lg">
      <span className="i-ph:github-logo text-5xl text-bolt-elements-textTertiary mb-4" />
      <h3 className="text-lg font-medium text-bolt-elements-textPrimary mb-2">GitHub non connecté</h3>
      <p className="text-sm text-bolt-elements-textSecondary text-center max-w-sm mb-4">
        Ajoutez votre token GitHub dans l'onglet Connecteurs pour accéder à vos repositories, issues et pull requests.
      </p>
      <a
        href="https://github.com/settings/tokens/new?scopes=repo,read:user"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 px-4 py-2 bg-bolt-elements-sidebar-buttonBackgroundDefault text-bolt-elements-sidebar-buttonText hover:bg-bolt-elements-sidebar-buttonBackgroundHover rounded-md text-sm font-medium transition-theme"
      >
        <span className="i-ph:key" />
        Créer un token GitHub
      </a>
    </div>
  </div>
));

const LoadingState = memo(() => (
  <div className="flex flex-col items-center justify-center py-16">
    <Spinner size="xl" className="text-accent-500 mb-4" />
    <p className="text-bolt-elements-textSecondary">Connexion à GitHub...</p>
  </div>
));

interface ErrorStateProps {
  error: string;
  onRetry: () => void;
}

const ErrorState = memo(({ error, onRetry }: ErrorStateProps) => (
  <div className="space-y-6">
    <div>
      <h2 className="text-lg font-semibold text-bolt-elements-textPrimary">GitHub</h2>
      <p className="text-sm text-bolt-elements-textSecondary mt-1">Une erreur est survenue lors de la connexion</p>
    </div>

    <div className="flex flex-col items-center justify-center py-12 border border-red-500/30 bg-red-500/5 rounded-lg">
      <span className="i-ph:warning-circle text-4xl text-red-400 mb-4" />
      <p className="text-sm text-red-400 text-center max-w-sm mb-4">{error}</p>
      <button
        onClick={onRetry}
        className="inline-flex items-center gap-2 px-3 py-1.5 bg-bolt-elements-sidebar-buttonBackgroundDefault text-bolt-elements-sidebar-buttonText hover:bg-bolt-elements-sidebar-buttonBackgroundHover rounded-md text-sm font-medium transition-theme"
      >
        <span className="i-ph:arrows-clockwise" />
        Réessayer
      </button>
    </div>
  </div>
));

interface SelectedRepoDetailsProps {
  owner: string;
  repo: string;
  issues: typeof githubIssues extends { get(): infer T } ? T : never;
  pullRequests: typeof githubPullRequests extends { get(): infer T } ? T : never;
  loading: boolean;
  onClose: () => void;
}

const SelectedRepoDetails = memo(
  ({ owner, repo, issues, pullRequests, loading, onClose }: SelectedRepoDetailsProps) => {
    const [activeTab, setActiveTab] = useState<'issues' | 'prs'>('issues');

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-bolt-elements-textPrimary flex items-center gap-2">
            <span className="i-ph:folder-notch" />
            {owner}/{repo}
          </h3>
          <button onClick={onClose} className="text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary">
            <span className="i-ph:x" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-bolt-elements-borderColor">
          <button
            onClick={() => setActiveTab('issues')}
            className={classNames(
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              activeTab === 'issues'
                ? 'border-accent-500 text-accent-500'
                : 'border-transparent text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary',
            )}
          >
            <span className="i-ph:circle-wavy-warning mr-1" />
            Issues ({issues.length})
          </button>
          <button
            onClick={() => setActiveTab('prs')}
            className={classNames(
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              activeTab === 'prs'
                ? 'border-accent-500 text-accent-500'
                : 'border-transparent text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary',
            )}
          >
            <span className="i-ph:git-pull-request mr-1" />
            Pull Requests ({pullRequests.length})
          </button>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Spinner size="lg" className="text-accent-500" />
          </div>
        ) : (
          <motion.div
            className="space-y-2 max-h-[350px] overflow-y-auto pr-2"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            {activeTab === 'issues' ? (
              issues.length > 0 ? (
                issues.map((issue) => (
                  <motion.a
                    key={issue.id}
                    variants={itemVariants}
                    href={issue.html_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block p-3 rounded-lg bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor hover:border-bolt-elements-borderColorHover transition-colors"
                  >
                    <div className="flex items-start gap-2">
                      <span
                        className={classNames(
                          'mt-0.5',
                          issue.state === 'open'
                            ? 'i-ph:circle-dashed text-green-500'
                            : 'i-ph:check-circle text-purple-500',
                        )}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-bolt-elements-textPrimary line-clamp-1">{issue.title}</p>
                        <p className="text-xs text-bolt-elements-textTertiary mt-1">
                          #{issue.number} ouvert par {issue.user.login}
                        </p>
                      </div>
                    </div>
                  </motion.a>
                ))
              ) : (
                <p className="text-center text-sm text-bolt-elements-textTertiary py-8">Aucune issue ouverte</p>
              )
            ) : pullRequests.length > 0 ? (
              pullRequests.map((pr) => (
                <motion.a
                  key={pr.id}
                  variants={itemVariants}
                  href={pr.html_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block p-3 rounded-lg bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor hover:border-bolt-elements-borderColorHover transition-colors"
                >
                  <div className="flex items-start gap-2">
                    <span
                      className={classNames(
                        'mt-0.5',
                        pr.state === 'open'
                          ? 'i-ph:git-pull-request text-green-500'
                          : pr.merged
                            ? 'i-ph:git-merge text-purple-500'
                            : 'i-ph:git-pull-request text-red-500',
                      )}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-bolt-elements-textPrimary line-clamp-1">{pr.title}</p>
                      <p className="text-xs text-bolt-elements-textTertiary mt-1">
                        #{pr.number} par {pr.user.login} • {pr.head.ref} → {pr.base.ref}
                      </p>
                    </div>
                  </div>
                </motion.a>
              ))
            ) : (
              <p className="text-center text-sm text-bolt-elements-textTertiary py-8">Aucune pull request ouverte</p>
            )}
          </motion.div>
        )}

        {/* Quick actions */}
        <div className="flex gap-2 pt-2">
          <a
            href={`https://github.com/${owner}/${repo}/issues/new`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-1.5 bg-bolt-elements-sidebar-buttonBackgroundDefault text-bolt-elements-sidebar-buttonText hover:bg-bolt-elements-sidebar-buttonBackgroundHover rounded-md text-sm font-medium transition-theme"
          >
            <span className="i-ph:plus" />
            Nouvelle Issue
          </a>
          <a
            href={`https://github.com/${owner}/${repo}/compare`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-1.5 bg-bolt-elements-sidebar-buttonBackgroundDefault text-bolt-elements-sidebar-buttonText hover:bg-bolt-elements-sidebar-buttonBackgroundHover rounded-md text-sm font-medium transition-theme"
          >
            <span className="i-ph:git-pull-request" />
            Nouvelle PR
          </a>
        </div>
      </div>
    );
  },
);
