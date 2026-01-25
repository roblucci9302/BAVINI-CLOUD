/**
 * =============================================================================
 * BAVINI CLOUD - Git Tools Types
 * =============================================================================
 * Type definitions for Git operations.
 *
 * @module lib/agents/tools/git/types
 * =============================================================================
 */

/**
 * Information sur une branche
 */
export interface GitBranch {
  name: string;
  current: boolean;
  remote?: string;
  tracking?: string;
}

/**
 * Information sur un commit
 */
export interface GitCommit {
  hash: string;
  shortHash: string;
  message: string;
  author: {
    name: string;
    email: string;
  };
  date: Date;
}

/**
 * Status d'un fichier
 */
export interface GitFileStatus {
  path: string;
  status: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked' | 'ignored';
  staged: boolean;
}

/**
 * Interface pour les opérations Git
 */
export interface GitInterface {
  /** Initialiser un repo */
  init(options?: { defaultBranch?: string }): Promise<void>;

  /** Cloner un repo */
  clone(
    url: string,
    options?: {
      directory?: string;
      branch?: string;
      depth?: number;
    },
  ): Promise<void>;

  /** Obtenir le status */
  status(): Promise<{
    branch: string;
    ahead: number;
    behind: number;
    files: GitFileStatus[];
  }>;

  /** Ajouter des fichiers */
  add(files: string[]): Promise<void>;

  /** Créer un commit */
  commit(
    message: string,
    options?: {
      author?: { name: string; email: string };
    },
  ): Promise<GitCommit>;

  /** Pousser les commits */
  push(options?: { remote?: string; branch?: string; setUpstream?: boolean; force?: boolean }): Promise<void>;

  /** Tirer les commits */
  pull(options?: { remote?: string; branch?: string; rebase?: boolean }): Promise<void>;

  /** Opérations sur les branches */
  branch(
    action: 'list' | 'create' | 'delete' | 'checkout',
    name?: string,
    force?: boolean,
  ): Promise<GitBranch[] | void>;

  /** Obtenir le log */
  log(options?: { count?: number; branch?: string }): Promise<GitCommit[]>;

  /** Obtenir les différences */
  diff(options?: { staged?: boolean; file?: string; commit?: string }): Promise<string>;

  /** Obtenir la branche courante */
  getCurrentBranch(): Promise<string>;

  /** Vérifier si c'est un repo Git */
  isRepository(): Promise<boolean>;
}
