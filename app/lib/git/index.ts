/**
 * Git module for BAVINI.
 * Uses isomorphic-git for browser-based Git operations.
 */

// Named exports for better tree-shaking (avoid export *)

// Operations (operations.ts)
export {
  type CloneOptions,
  type GitProgress,
  type GitAuth,
  type CommitOptions,
  type PushOptions,
  type PullOptions,
  type FileStatus,
  type LogEntry,
  getFs,
  clone,
  init,
  currentBranch,
  listBranches,
  status,
  add,
  addAll,
  commit,
  push,
  pull,
  fetch,
  log,
  checkout,
  createBranch,
  listRemotes,
  addRemote,
  isGitRepo,
  readFile,
  writeFile,
  listFiles,
  deleteRepo,
} from './operations';

// CORS Proxy (cors-proxy.ts)
export {
  getCorsProxyUrl,
  setCorsProxyUrl,
  resetCorsProxy,
  tryNextProxy,
  needsCorsProxy,
  parseGitUrl,
  sshToHttps,
} from './cors-proxy';

// File Sync (file-sync.ts)
export { syncToWebContainer, syncFileToLightningFS, syncAllToLightningFS, clearWebContainerWorkdir } from './file-sync';

// Git Store
export { gitStore, type GitState, type GitStatus } from '~/lib/stores/git';
