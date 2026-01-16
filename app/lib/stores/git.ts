/**
 * Git store for managing Git state in BAVINI.
 * Uses nanostores for reactive state management.
 */

import { atom, map } from 'nanostores';

export type GitStatus = 'idle' | 'cloning' | 'pushing' | 'pulling' | 'fetching' | 'committing';

export interface GitFileChange {
  path: string;
  status: 'modified' | 'added' | 'deleted' | 'untracked' | 'unchanged';
}

export interface GitCommit {
  oid: string;
  message: string;
  author: {
    name: string;
    email: string;
    timestamp: number;
  };
}

export interface GitRemote {
  name: string;
  url: string;
}

export interface GitState {
  // repository state
  initialized: boolean;
  repoPath: string | null;
  remoteUrl: string | null;

  // current branch info
  currentBranch: string | null;
  branches: string[];

  // file changes
  changes: GitFileChange[];
  stagedChanges: GitFileChange[];

  // commit history
  commits: GitCommit[];

  // remotes
  remotes: GitRemote[];

  // operation status
  status: GitStatus;
  progress: number;
  progressMessage: string;

  // error handling
  error: string | null;

  // authentication
  hasAuth: boolean;
}

const initialState: GitState = {
  initialized: false,
  repoPath: null,
  remoteUrl: null,
  currentBranch: null,
  branches: [],
  changes: [],
  stagedChanges: [],
  commits: [],
  remotes: [],
  status: 'idle',
  progress: 0,
  progressMessage: '',
  error: null,
  hasAuth: false,
};

// main git store
export const gitStore = map<GitState>(initialState);

// derived atoms for specific state slices
export const isGitBusy = atom(false);
export const gitError = atom<string | null>(null);

// helper functions to update the store
export function setGitStatus(status: GitStatus, message: string = ''): void {
  gitStore.setKey('status', status);
  gitStore.setKey('progressMessage', message);
  isGitBusy.set(status !== 'idle');
}

export function setGitProgress(progress: number, message?: string): void {
  gitStore.setKey('progress', progress);

  if (message) {
    gitStore.setKey('progressMessage', message);
  }
}

export function setGitError(error: string | null): void {
  gitStore.setKey('error', error);
  gitError.set(error);
}

export function setRepoInfo(repoPath: string, remoteUrl: string | null = null): void {
  gitStore.setKey('initialized', true);
  gitStore.setKey('repoPath', repoPath);
  gitStore.setKey('remoteUrl', remoteUrl);
}

export function setBranches(current: string | null, all: string[]): void {
  gitStore.setKey('currentBranch', current);
  gitStore.setKey('branches', all);
}

export function setChanges(changes: GitFileChange[]): void {
  gitStore.setKey('changes', changes);
}

export function setStagedChanges(changes: GitFileChange[]): void {
  gitStore.setKey('stagedChanges', changes);
}

export function setCommits(commits: GitCommit[]): void {
  gitStore.setKey('commits', commits);
}

export function setRemotes(remotes: GitRemote[]): void {
  gitStore.setKey('remotes', remotes);
}

export function setHasAuth(hasAuth: boolean): void {
  gitStore.setKey('hasAuth', hasAuth);
}
