/**
 * =============================================================================
 * BAVINI CLOUD - Git Tool Definitions
 * =============================================================================
 * Tool definition objects for Git operations.
 *
 * @module lib/agents/tools/git/tool-definitions
 * =============================================================================
 */

import type { ToolDefinition } from '../../types';

/**
 * Outil pour initialiser un repo Git
 */
export const GitInitTool: ToolDefinition = {
  name: 'git_init',
  description: 'Initialiser un nouveau dépôt Git dans le projet.',
  inputSchema: {
    type: 'object',
    properties: {
      defaultBranch: {
        type: 'string',
        description: 'Nom de la branche par défaut (défaut: main)',
      },
    },
    required: [],
  },
};

/**
 * Outil pour cloner un repo
 */
export const GitCloneTool: ToolDefinition = {
  name: 'git_clone',
  description: 'Cloner un dépôt Git distant.',
  inputSchema: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'URL du dépôt à cloner (HTTPS ou SSH)',
      },
      directory: {
        type: 'string',
        description: 'Dossier de destination (optionnel)',
      },
      branch: {
        type: 'string',
        description: 'Branche à cloner (défaut: default branch)',
      },
      depth: {
        type: 'number',
        description: 'Profondeur du clone (pour shallow clone)',
      },
    },
    required: ['url'],
  },
};

/**
 * Outil pour voir le status Git
 */
export const GitStatusTool: ToolDefinition = {
  name: 'git_status',
  description: 'Afficher le status Git du projet (fichiers modifiés, staged, etc.).',
  inputSchema: {
    type: 'object',
    properties: {
      short: {
        type: 'boolean',
        description: 'Format court (défaut: false)',
      },
    },
    required: [],
  },
};

/**
 * Outil pour ajouter des fichiers au staging
 */
export const GitAddTool: ToolDefinition = {
  name: 'git_add',
  description: 'Ajouter des fichiers au staging area.',
  inputSchema: {
    type: 'object',
    properties: {
      files: {
        type: 'array',
        items: { type: 'string' },
        description: 'Liste des fichiers à ajouter (ou ["."] pour tout)',
      },
    },
    required: ['files'],
  },
};

/**
 * Outil pour créer un commit
 */
export const GitCommitTool: ToolDefinition = {
  name: 'git_commit',
  description: 'Créer un commit avec les changements stagés.',
  inputSchema: {
    type: 'object',
    properties: {
      message: {
        type: 'string',
        description: 'Message du commit',
      },
      author: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          email: { type: 'string' },
        },
        description: 'Auteur du commit (optionnel)',
      },
    },
    required: ['message'],
  },
};

/**
 * Outil pour pousser les commits
 */
export const GitPushTool: ToolDefinition = {
  name: 'git_push',
  description: 'Pousser les commits vers le dépôt distant.',
  inputSchema: {
    type: 'object',
    properties: {
      remote: {
        type: 'string',
        description: 'Nom du remote (défaut: origin)',
      },
      branch: {
        type: 'string',
        description: 'Branche à pousser (défaut: branche courante)',
      },
      setUpstream: {
        type: 'boolean',
        description: 'Définir comme upstream (défaut: false)',
      },
      force: {
        type: 'boolean',
        description: 'Force push (ATTENTION - défaut: false)',
      },
    },
    required: [],
  },
};

/**
 * Outil pour tirer les commits
 */
export const GitPullTool: ToolDefinition = {
  name: 'git_pull',
  description: 'Tirer les commits depuis le dépôt distant.',
  inputSchema: {
    type: 'object',
    properties: {
      remote: {
        type: 'string',
        description: 'Nom du remote (défaut: origin)',
      },
      branch: {
        type: 'string',
        description: 'Branche à tirer (défaut: branche courante)',
      },
      rebase: {
        type: 'boolean',
        description: 'Utiliser rebase au lieu de merge (défaut: false)',
      },
    },
    required: [],
  },
};

/**
 * Outil pour gérer les branches
 */
export const GitBranchTool: ToolDefinition = {
  name: 'git_branch',
  description: 'Créer, lister ou supprimer des branches.',
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['list', 'create', 'delete', 'checkout'],
        description: 'Action à effectuer',
      },
      name: {
        type: 'string',
        description: 'Nom de la branche (requis pour create, delete, checkout)',
      },
      force: {
        type: 'boolean',
        description: 'Forcer la suppression (défaut: false)',
      },
    },
    required: ['action'],
  },
};

/**
 * Outil pour voir le log Git
 */
export const GitLogTool: ToolDefinition = {
  name: 'git_log',
  description: "Afficher l'historique des commits.",
  inputSchema: {
    type: 'object',
    properties: {
      count: {
        type: 'number',
        description: 'Nombre de commits à afficher (défaut: 10)',
      },
      oneline: {
        type: 'boolean',
        description: 'Format une ligne par commit (défaut: true)',
      },
      branch: {
        type: 'string',
        description: 'Branche à afficher (défaut: courante)',
      },
    },
    required: [],
  },
};

/**
 * Outil pour voir les différences
 */
export const GitDiffTool: ToolDefinition = {
  name: 'git_diff',
  description: 'Afficher les différences entre versions.',
  inputSchema: {
    type: 'object',
    properties: {
      staged: {
        type: 'boolean',
        description: 'Voir les changements stagés (défaut: false)',
      },
      file: {
        type: 'string',
        description: 'Fichier spécifique à comparer',
      },
      commit: {
        type: 'string',
        description: 'Commit de référence',
      },
    },
    required: [],
  },
};

/**
 * Liste de tous les outils Git
 */
export const GIT_TOOLS: ToolDefinition[] = [
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
];
