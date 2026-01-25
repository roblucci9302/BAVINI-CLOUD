/**
 * =============================================================================
 * BAVINI CLOUD - Mock Git Interface
 * =============================================================================
 * Mock implementation of GitInterface for testing.
 *
 * @module lib/agents/tools/git/mock-git
 * =============================================================================
 */

import type { GitInterface, GitBranch, GitCommit, GitFileStatus } from './types';

/**
 * Créer un mock GitInterface pour les tests
 */
export function createMockGit(
  options: {
    isRepo?: boolean;
    currentBranch?: string;
    branches?: GitBranch[];
    commits?: GitCommit[];
    files?: GitFileStatus[];
  } = {},
): GitInterface {
  const defaultBranch = options.currentBranch || 'main';
  let currentBranch = defaultBranch;
  const branches: GitBranch[] = options.branches || [{ name: 'main', current: true }];
  const commits: GitCommit[] = options.commits || [];
  const stagedFiles = new Set<string>();

  return {
    async init(_initOptions) {
      // Mock init
    },

    async clone(_url, _cloneOptions) {
      // Mock clone
    },

    async status() {
      return {
        branch: currentBranch,
        ahead: 0,
        behind: 0,
        files: options.files || [],
      };
    },

    async add(files) {
      files.forEach((f) => stagedFiles.add(f));
    },

    async commit(message, commitOptions) {
      const commit: GitCommit = {
        hash: Math.random().toString(36).substring(2, 10),
        shortHash: Math.random().toString(36).substring(2, 9),
        message,
        author: commitOptions?.author || { name: 'Test', email: 'test@test.com' },
        date: new Date(),
      };
      commits.unshift(commit);
      stagedFiles.clear();

      return commit;
    },

    async push(_pushOptions) {
      // Mock push
    },

    async pull(_pullOptions) {
      // Mock pull
    },

    async branch(action, name, _force) {
      switch (action) {
        case 'list':
          return branches;
        case 'create':
          if (name) {
            branches.push({ name, current: false });
          }

          break;
        case 'delete':
          const idx = branches.findIndex((b) => b.name === name);

          if (idx !== -1) {
            branches.splice(idx, 1);
          }

          break;
        case 'checkout':
          branches.forEach((b) => (b.current = b.name === name));
          currentBranch = name || defaultBranch;
          break;
      }
    },

    async log(logOptions) {
      const count = logOptions?.count || 10;
      return commits.slice(0, count);
    },

    async diff(_diffOptions) {
      return '';
    },

    async getCurrentBranch() {
      return currentBranch;
    },

    async isRepository() {
      return options.isRepo !== false;
    },
  };
}
