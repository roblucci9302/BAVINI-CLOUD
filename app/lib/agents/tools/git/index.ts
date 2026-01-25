/**
 * =============================================================================
 * BAVINI CLOUD - Git Tools Module
 * =============================================================================
 * Barrel export for Git tools submodules.
 *
 * @module lib/agents/tools/git
 * =============================================================================
 */

// Types
export type { GitBranch, GitCommit, GitFileStatus, GitInterface } from './types';

// URL Validation
export {
  ALLOWED_GIT_HOSTS,
  type GitUrlValidationResult,
  type GitUrlValidationConfig,
  validateGitUrl,
  configureGitUrlValidation,
  addAllowedGitHost,
  getGitUrlValidationConfig,
} from './url-validation';

// Tool Definitions
export {
  GitInitTool,
  GitCloneTool,
  GitStatusTool,
  GitAddTool,
  GitCommitTool,
  GitPushTool,
  GitPullTool,
  GitBranchTool,
  GitLogTool,
  GitDiffTool,
  GIT_TOOLS,
} from './tool-definitions';

// Tool Handlers
export { createGitToolHandlers } from './tool-handlers';

// Mock Git (for testing)
export { createMockGit } from './mock-git';
