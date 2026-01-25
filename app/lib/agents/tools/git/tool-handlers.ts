/**
 * =============================================================================
 * BAVINI CLOUD - Git Tool Handlers
 * =============================================================================
 * Handler functions for executing Git tool operations.
 *
 * @module lib/agents/tools/git/tool-handlers
 * =============================================================================
 */

import type { ToolExecutionResult } from '../../types';
import type { GitInterface, GitBranch } from './types';
import {
  validatePushOperation,
  validateCommitMessage,
  validateBranchDelete,
  checkSensitiveFiles,
  prePushCheck,
  type GitProtectionConfig,
  getDefaultGitProtectionConfig,
} from '../../security/git-protection';
import { validateGitUrl, getGlobalUrlValidationConfig } from './url-validation';

/**
 * Créer les handlers pour les outils Git
 */
export function createGitToolHandlers(
  git: GitInterface,
  protectionConfig?: GitProtectionConfig,
): Record<string, (input: Record<string, unknown>) => Promise<ToolExecutionResult>> {
  const config = protectionConfig || getDefaultGitProtectionConfig();

  return {
    /**
     * Initialiser un repo
     */
    git_init: async (input: Record<string, unknown>): Promise<ToolExecutionResult> => {
      const defaultBranch = (input.defaultBranch as string) || 'main';

      try {
        await git.init({ defaultBranch });

        return {
          success: true,
          output: `Initialized empty Git repository with default branch '${defaultBranch}'`,
        };
      } catch (error) {
        return {
          success: false,
          output: null,
          error: `Failed to init repository: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },

    /**
     * Cloner un repo
     */
    git_clone: async (input: Record<string, unknown>): Promise<ToolExecutionResult> => {
      const url = input.url as string;
      const directory = input.directory as string | undefined;
      const branch = input.branch as string | undefined;
      const depth = input.depth as number | undefined;

      // Valider l'URL Git avant le clonage
      const urlValidation = validateGitUrl(url, getGlobalUrlValidationConfig());
      if (!urlValidation.valid) {
        return {
          success: false,
          output: null,
          error: `Git clone blocked: ${urlValidation.error}`,
        };
      }

      try {
        await git.clone(url, { directory, branch, depth });

        return {
          success: true,
          output: `Cloned ${url}${directory ? ` into ${directory}` : ''} (host: ${urlValidation.host})`,
        };
      } catch (error) {
        return {
          success: false,
          output: null,
          error: `Failed to clone: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },

    /**
     * Status Git
     */
    git_status: async (input: Record<string, unknown>): Promise<ToolExecutionResult> => {
      const short = input.short === true;

      try {
        const status = await git.status();

        if (short) {
          const lines = status.files.map((f) => {
            const prefix = f.staged ? 'A' : f.status === 'untracked' ? '?' : 'M';
            return `${prefix} ${f.path}`;
          });
          return {
            success: true,
            output: lines.join('\n') || 'Nothing to commit, working tree clean',
          };
        }

        const output = [
          `On branch ${status.branch}`,
          status.ahead > 0 ? `Your branch is ahead by ${status.ahead} commit(s)` : '',
          status.behind > 0 ? `Your branch is behind by ${status.behind} commit(s)` : '',
          '',
          status.files.length > 0 ? 'Changes:' : 'Nothing to commit, working tree clean',
          ...status.files.map((f) => `  ${f.staged ? '(staged)' : ''}${f.status}: ${f.path}`),
        ]
          .filter(Boolean)
          .join('\n');

        return {
          success: true,
          output,
        };
      } catch (error) {
        return {
          success: false,
          output: null,
          error: `Failed to get status: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },

    /**
     * Ajouter des fichiers
     */
    git_add: async (input: Record<string, unknown>): Promise<ToolExecutionResult> => {
      const files = input.files as string[];

      try {
        await git.add(files);

        return {
          success: true,
          output: `Added ${files.length === 1 && files[0] === '.' ? 'all files' : files.join(', ')} to staging`,
        };
      } catch (error) {
        return {
          success: false,
          output: null,
          error: `Failed to add files: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },

    /**
     * Créer un commit
     */
    git_commit: async (input: Record<string, unknown>): Promise<ToolExecutionResult> => {
      const message = input.message as string;
      const author = input.author as { name: string; email: string } | undefined;

      // Valider le message de commit
      const messageValidation = validateCommitMessage(message, config);
      if (!messageValidation.valid) {
        return {
          success: false,
          output: null,
          error: `Commit message validation failed:\n${messageValidation.errors.join('\n')}`,
        };
      }

      // Vérifier les fichiers sensibles dans le staging
      try {
        const status = await git.status();
        const stagedFiles = status.files.filter((f) => f.staged).map((f) => f.path);
        const sensitiveCheck = checkSensitiveFiles(stagedFiles, config);

        if (sensitiveCheck.hasSensitive) {
          return {
            success: false,
            output: null,
            error: `BLOCKED: Sensitive files detected in staging area:\n${sensitiveCheck.sensitiveFiles.map((f) => `  - ${f}`).join('\n')}\n\nRemove these files from staging or add them to .gitignore.`,
          };
        }
      } catch {
        // Continue si on ne peut pas vérifier le status
      }

      try {
        const commit = await git.commit(message, { author });

        // Ajouter les warnings s'il y en a
        let output = `[${commit.shortHash}] ${commit.message}`;
        if (messageValidation.warnings.length > 0) {
          output += `\n\nWarnings:\n${messageValidation.warnings.join('\n')}`;
        }

        return {
          success: true,
          output,
        };
      } catch (error) {
        return {
          success: false,
          output: null,
          error: `Failed to commit: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },

    /**
     * Pousser les commits
     */
    git_push: async (input: Record<string, unknown>): Promise<ToolExecutionResult> => {
      const remote = (input.remote as string) || 'origin';
      const branch = input.branch as string | undefined;
      const setUpstream = input.setUpstream === true;
      const force = input.force === true;

      // Obtenir la branche courante si non spécifiée
      let targetBranch = branch;
      if (!targetBranch) {
        try {
          targetBranch = await git.getCurrentBranch();
        } catch {
          targetBranch = 'unknown';
        }
      }

      // Valider l'opération push avec les protections
      const pushValidation = validatePushOperation(targetBranch, { force, currentBranch: targetBranch }, config);

      if (!pushValidation.allowed) {
        return {
          success: false,
          output: null,
          error: pushValidation.errors.join('\n'),
        };
      }

      // Effectuer les vérifications pre-push
      try {
        const status = await git.status();
        const stagedFiles = status.files.filter((f) => f.staged).map((f) => f.path);
        const prePushResult = await prePushCheck(status, stagedFiles, config);

        if (!prePushResult.safe) {
          return {
            success: false,
            output: null,
            error: prePushResult.errors.join('\n'),
          };
        }

        // Ajouter les warnings au résultat
        if (prePushResult.warnings.length > 0) {
          pushValidation.warnings.push(...prePushResult.warnings);
        }
      } catch {
        // Continue si on ne peut pas effectuer les vérifications
      }

      try {
        await git.push({ remote, branch, setUpstream, force });

        // Construire le message de succès avec les warnings
        let output = `Pushed to ${remote}${branch ? `/${branch}` : ''}`;
        if (pushValidation.warnings.length > 0) {
          output += `\n\nWarnings:\n${pushValidation.warnings.join('\n')}`;
        }

        return {
          success: true,
          output,
        };
      } catch (error) {
        return {
          success: false,
          output: null,
          error: `Failed to push: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },

    /**
     * Tirer les commits
     */
    git_pull: async (input: Record<string, unknown>): Promise<ToolExecutionResult> => {
      const remote = (input.remote as string) || 'origin';
      const branch = input.branch as string | undefined;
      const rebase = input.rebase === true;

      try {
        await git.pull({ remote, branch, rebase });

        return {
          success: true,
          output: `Pulled from ${remote}${branch ? `/${branch}` : ''}${rebase ? ' (with rebase)' : ''}`,
        };
      } catch (error) {
        return {
          success: false,
          output: null,
          error: `Failed to pull: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },

    /**
     * Gérer les branches
     */
    git_branch: async (input: Record<string, unknown>): Promise<ToolExecutionResult> => {
      const action = input.action as 'list' | 'create' | 'delete' | 'checkout';
      const name = input.name as string | undefined;
      const force = input.force === true;

      try {
        if (action === 'list') {
          const branches = (await git.branch('list')) as GitBranch[];
          const output = branches
            .map((b) => `${b.current ? '* ' : '  '}${b.name}${b.tracking ? ` -> ${b.tracking}` : ''}`)
            .join('\n');

          return {
            success: true,
            output: output || 'No branches',
          };
        }

        if (!name) {
          return {
            success: false,
            output: null,
            error: `Branch name is required for '${action}'`,
          };
        }

        // Valider la suppression de branche
        if (action === 'delete') {
          const deleteValidation = validateBranchDelete(name, force, config);
          if (!deleteValidation.allowed) {
            return {
              success: false,
              output: null,
              error: deleteValidation.errors.join('\n'),
            };
          }
        }

        await git.branch(action, name, force);

        const messages = {
          create: `Created branch '${name}'`,
          delete: `Deleted branch '${name}'`,
          checkout: `Switched to branch '${name}'`,
        };

        return {
          success: true,
          output: messages[action],
        };
      } catch (error) {
        return {
          success: false,
          output: null,
          error: `Failed to ${action} branch: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },

    /**
     * Log Git
     */
    git_log: async (input: Record<string, unknown>): Promise<ToolExecutionResult> => {
      const count = (input.count as number) || 10;
      const oneline = input.oneline !== false;
      const branch = input.branch as string | undefined;

      try {
        const commits = await git.log({ count, branch });

        if (oneline) {
          const output = commits.map((c) => `${c.shortHash} ${c.message}`).join('\n');
          return {
            success: true,
            output: output || 'No commits',
          };
        }

        const output = commits
          .map((c) =>
            [
              `commit ${c.hash}`,
              `Author: ${c.author.name} <${c.author.email}>`,
              `Date:   ${c.date.toISOString()}`,
              '',
              `    ${c.message}`,
              '',
            ].join('\n'),
          )
          .join('\n');

        return {
          success: true,
          output: output || 'No commits',
        };
      } catch (error) {
        return {
          success: false,
          output: null,
          error: `Failed to get log: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },

    /**
     * Différences Git
     */
    git_diff: async (input: Record<string, unknown>): Promise<ToolExecutionResult> => {
      const staged = input.staged === true;
      const file = input.file as string | undefined;
      const commit = input.commit as string | undefined;

      try {
        const diff = await git.diff({ staged, file, commit });

        return {
          success: true,
          output: diff || 'No differences',
        };
      } catch (error) {
        return {
          success: false,
          output: null,
          error: `Failed to get diff: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },
  };
}
