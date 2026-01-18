/**
 * Outils d'écriture pour les agents BAVINI
 * Ces outils permettent de créer, modifier et supprimer des fichiers
 */

import type { ToolDefinition, ToolExecutionResult } from '../types';
import { validateBeforeWrite } from '../utils/import-validator';
import { validateContentForSecrets, suggestSecretFixes } from '../security/secret-scanner';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('WriteTools');

/*
 * ============================================================================
 * DÉFINITIONS DES OUTILS
 * ============================================================================
 */

/**
 * Outil pour écrire/créer un fichier
 */
export const WriteFileTool: ToolDefinition = {
  name: 'write_file',
  description:
    "Créer un nouveau fichier ou remplacer entièrement le contenu d'un fichier existant. " +
    'Utilise cet outil pour créer de nouveaux fichiers ou réécrire complètement un fichier.',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Chemin du fichier à créer/écrire (relatif au projet)',
      },
      content: {
        type: 'string',
        description: 'Contenu complet du fichier',
      },
      createDirectories: {
        type: 'boolean',
        description: 'Créer les dossiers parents si nécessaire (défaut: true)',
      },
    },
    required: ['path', 'content'],
  },
};

/**
 * Outil pour éditer une portion d'un fichier
 */
export const EditFileTool: ToolDefinition = {
  name: 'edit_file',
  description:
    "Modifier une portion spécifique d'un fichier existant. " +
    'Utilise le pattern old_content → new_content pour des modifications précises. ' +
    'Préférer cet outil à write_file pour des modifications partielles.',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Chemin du fichier à modifier',
      },
      oldContent: {
        type: 'string',
        description: 'Contenu existant à remplacer (doit être exact)',
      },
      newContent: {
        type: 'string',
        description: 'Nouveau contenu à insérer',
      },
      replaceAll: {
        type: 'boolean',
        description: 'Remplacer toutes les occurrences (défaut: false, première seulement)',
      },
    },
    required: ['path', 'oldContent', 'newContent'],
  },
};

/**
 * Outil pour supprimer un fichier
 */
export const DeleteFileTool: ToolDefinition = {
  name: 'delete_file',
  description: 'Supprimer un fichier du projet. ' + 'ATTENTION: Cette action est irréversible.',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Chemin du fichier à supprimer',
      },
    },
    required: ['path'],
  },
};

/**
 * Outil pour créer un dossier
 */
export const CreateDirectoryTool: ToolDefinition = {
  name: 'create_directory',
  description: 'Créer un nouveau dossier (et ses parents si nécessaire).',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Chemin du dossier à créer',
      },
    },
    required: ['path'],
  },
};

/**
 * Outil pour renommer/déplacer un fichier
 */
export const MoveFileTool: ToolDefinition = {
  name: 'move_file',
  description: 'Renommer ou déplacer un fichier vers un nouvel emplacement.',
  inputSchema: {
    type: 'object',
    properties: {
      oldPath: {
        type: 'string',
        description: 'Chemin actuel du fichier',
      },
      newPath: {
        type: 'string',
        description: 'Nouveau chemin du fichier',
      },
    },
    required: ['oldPath', 'newPath'],
  },
};

/*
 * ============================================================================
 * LISTE DES OUTILS D'ÉCRITURE
 * ============================================================================
 */

export const WRITE_TOOLS: ToolDefinition[] = [
  WriteFileTool,
  EditFileTool,
  DeleteFileTool,
  CreateDirectoryTool,
  MoveFileTool,
];

/*
 * ============================================================================
 * INTERFACE FILESYSTEM ÉTENDUE POUR L'ÉCRITURE
 * ============================================================================
 */

/**
 * Interface pour les capacités d'écriture du système de fichiers
 */
export interface WritableFileSystem {
  /** Lire un fichier */
  readFile(path: string): Promise<string>;

  /** Écrire un fichier (créer ou remplacer) */
  writeFile(path: string, content: string): Promise<void>;

  /** Supprimer un fichier */
  deleteFile(path: string): Promise<void>;

  /** Créer un dossier */
  mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;

  /** Renommer/déplacer un fichier */
  rename(oldPath: string, newPath: string): Promise<void>;

  /** Vérifier si un fichier/dossier existe */
  exists(path: string): Promise<boolean>;

  /** Lister le contenu d'un dossier */
  readdir(path: string): Promise<Array<{ name: string; isDirectory: boolean; size?: number }>>;
}

/*
 * ============================================================================
 * SÉCURITÉ - VALIDATION DES CHEMINS
 * ============================================================================
 */

/**
 * Regex précompilée pour détecter les chemins système dangereux
 * Performance: O(1) au lieu de O(n) avec une boucle sur un tableau
 */
const DANGEROUS_PATHS_REGEX = /\/(etc|usr|var|root|home|bin|sbin|tmp)\//i;

/**
 * Valide un chemin de fichier pour prévenir les attaques de traversal de répertoire
 * @param path - Le chemin à valider
 * @returns Un objet avec isValid et un message d'erreur si invalide
 */
function validatePath(path: string): { isValid: boolean; error?: string } {
  // Vérifier que le chemin n'est pas vide
  if (!path || path.trim() === '') {
    return { isValid: false, error: 'Le chemin ne peut pas être vide' };
  }

  // Normaliser le chemin (remplacer les backslashes)
  const normalizedPath = path.replace(/\\/g, '/');

  // Vérifier les séquences de traversal de répertoire
  if (normalizedPath.includes('..')) {
    return { isValid: false, error: 'Chemin invalide: séquence ".." non autorisée (tentative de traversal)' };
  }

  // Vérifier les chemins absolus (ne pas autoriser l'écriture hors du projet)
  // Permet /project/ (production) et /test/ (tests unitaires)
  const allowedPrefixes = ['/project/', '/test/'];
  if (normalizedPath.startsWith('/') && !allowedPrefixes.some((prefix) => normalizedPath.startsWith(prefix))) {
    return { isValid: false, error: 'Chemin invalide: les chemins absolus hors du projet ne sont pas autorisés' };
  }

  // Vérifier les caractères nuls (null byte injection)
  if (normalizedPath.includes('\0')) {
    return { isValid: false, error: 'Chemin invalide: caractères nuls non autorisés' };
  }

  // Vérifier les chemins dangereux connus avec regex précompilée (plus rapide)
  const dangerousMatch = normalizedPath.toLowerCase().match(DANGEROUS_PATHS_REGEX);
  if (dangerousMatch) {
    return {
      isValid: false,
      error: `Chemin invalide: accès au répertoire système "${dangerousMatch[0]}" non autorisé`,
    };
  }

  return { isValid: true };
}

/*
 * ============================================================================
 * HANDLERS D'EXÉCUTION
 * ============================================================================
 */

/**
 * Créer les handlers pour les outils d'écriture
 */
export function createWriteToolHandlers(
  fs: WritableFileSystem,
): Record<string, (input: Record<string, unknown>) => Promise<ToolExecutionResult>> {
  return {
    /**
     * Écrire/créer un fichier
     */
    write_file: async (input: Record<string, unknown>): Promise<ToolExecutionResult> => {
      const path = input.path as string;
      const content = input.content as string;
      const createDirectories = input.createDirectories !== false;

      // Valider le chemin
      const pathValidation = validatePath(path);
      if (!pathValidation.isValid) {
        return {
          success: false,
          output: null,
          error: pathValidation.error,
        };
      }

      // Scanner les secrets hardcodés AVANT l'écriture
      const secretValidation = validateContentForSecrets(content, path);
      if (!secretValidation.allowed) {
        const suggestions = suggestSecretFixes(secretValidation.findings);
        logger.warn(`Secret scan blocked write to ${path}`, {
          findings: secretValidation.findings.length,
          reason: secretValidation.reason,
        });
        return {
          success: false,
          output: null,
          error: `${secretValidation.reason}\n\nSuggestions:\n${suggestions.map((s) => `- ${s}`).join('\n')}`,
        };
      }

      // Log warning si des secrets medium ont été trouvés mais autorisés
      if (secretValidation.findings.length > 0) {
        logger.warn(`Secrets detected but allowed in ${path}`, {
          findings: secretValidation.findings.map((f) => f.type),
        });
      }

      // Valider les imports (pour fichiers TS/JS)
      const importValidation = await validateBeforeWrite(path, content, fs);
      if (!importValidation.canWrite) {
        return {
          success: false,
          output: null,
          error: `Import validation failed:\n${importValidation.errors.join('\n')}`,
        };
      }

      try {
        // Créer les dossiers parents si nécessaire
        if (createDirectories) {
          const dirPath = path.split('/').slice(0, -1).join('/');

          if (dirPath) {
            await fs.mkdir(dirPath, { recursive: true });
          }
        }

        await fs.writeFile(path, content);

        // Construire le message de succès avec les warnings éventuels
        let output = `File written successfully: ${path} (${content.length} characters)`;
        if (importValidation.warnings.length > 0) {
          output += `\n\n⚠️ Import warnings:\n${importValidation.warnings.join('\n')}`;
        }

        return {
          success: true,
          output,
        };
      } catch (error) {
        return {
          success: false,
          output: null,
          error: `Failed to write file ${path}: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },

    /**
     * Éditer une portion d'un fichier
     */
    edit_file: async (input: Record<string, unknown>): Promise<ToolExecutionResult> => {
      const path = input.path as string;
      const oldContent = input.oldContent as string;
      const newContent = input.newContent as string;
      const replaceAll = input.replaceAll === true;

      // Valider le chemin
      const pathValidation = validatePath(path);
      if (!pathValidation.isValid) {
        return {
          success: false,
          output: null,
          error: pathValidation.error,
        };
      }

      // Scanner les secrets dans le nouveau contenu AVANT l'édition
      const secretValidation = validateContentForSecrets(newContent, path);
      if (!secretValidation.allowed) {
        const suggestions = suggestSecretFixes(secretValidation.findings);
        logger.warn(`Secret scan blocked edit to ${path}`, {
          findings: secretValidation.findings.length,
          reason: secretValidation.reason,
        });
        return {
          success: false,
          output: null,
          error: `${secretValidation.reason}\n\nSuggestions:\n${suggestions.map((s) => `- ${s}`).join('\n')}`,
        };
      }

      try {
        // Lire le contenu actuel
        const currentContent = await fs.readFile(path);

        // Vérifier que l'ancien contenu existe
        if (!currentContent.includes(oldContent)) {
          return {
            success: false,
            output: null,
            error: `Content to replace not found in file ${path}. Make sure the old content matches exactly.`,
          };
        }

        // Effectuer le remplacement
        let updatedContent: string;

        if (replaceAll) {
          // Utilise replaceAll() natif - plus performant que split().join()
          updatedContent = currentContent.replaceAll(oldContent, newContent);
        } else {
          updatedContent = currentContent.replace(oldContent, newContent);
        }

        // Valider les imports du contenu modifié (pour fichiers TS/JS)
        const importValidation = await validateBeforeWrite(path, updatedContent, fs);
        if (!importValidation.canWrite) {
          return {
            success: false,
            output: null,
            error: `Import validation failed after edit:\n${importValidation.errors.join('\n')}`,
          };
        }

        // Écrire le fichier modifié
        await fs.writeFile(path, updatedContent);

        // Compte les remplacements sans créer de tableau intermédiaire
        let replacements = 1;
        if (replaceAll) {
          let count = 0;
          let pos = 0;
          while ((pos = currentContent.indexOf(oldContent, pos)) !== -1) {
            count++;
            pos += oldContent.length;
          }
          replacements = count;
        }

        // Construire le message de succès avec les warnings éventuels
        let output = `File edited successfully: ${path} (${replacements} replacement(s))`;
        if (importValidation.warnings.length > 0) {
          output += `\n\n⚠️ Import warnings:\n${importValidation.warnings.join('\n')}`;
        }

        return {
          success: true,
          output,
        };
      } catch (error) {
        return {
          success: false,
          output: null,
          error: `Failed to edit file ${path}: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },

    /**
     * Supprimer un fichier
     */
    delete_file: async (input: Record<string, unknown>): Promise<ToolExecutionResult> => {
      const path = input.path as string;

      // Valider le chemin
      const pathValidation = validatePath(path);
      if (!pathValidation.isValid) {
        return {
          success: false,
          output: null,
          error: pathValidation.error,
        };
      }

      try {
        // Vérifier que le fichier existe
        const exists = await fs.exists(path);

        if (!exists) {
          return {
            success: false,
            output: null,
            error: `File not found: ${path}`,
          };
        }

        await fs.deleteFile(path);

        return {
          success: true,
          output: `File deleted successfully: ${path}`,
        };
      } catch (error) {
        return {
          success: false,
          output: null,
          error: `Failed to delete file ${path}: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },

    /**
     * Créer un dossier
     */
    create_directory: async (input: Record<string, unknown>): Promise<ToolExecutionResult> => {
      const path = input.path as string;

      // Valider le chemin
      const pathValidation = validatePath(path);
      if (!pathValidation.isValid) {
        return {
          success: false,
          output: null,
          error: pathValidation.error,
        };
      }

      try {
        await fs.mkdir(path, { recursive: true });

        return {
          success: true,
          output: `Directory created successfully: ${path}`,
        };
      } catch (error) {
        return {
          success: false,
          output: null,
          error: `Failed to create directory ${path}: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },

    /**
     * Renommer/déplacer un fichier
     */
    move_file: async (input: Record<string, unknown>): Promise<ToolExecutionResult> => {
      const oldPath = input.oldPath as string;
      const newPath = input.newPath as string;

      // Valider les deux chemins
      const oldPathValidation = validatePath(oldPath);
      if (!oldPathValidation.isValid) {
        return {
          success: false,
          output: null,
          error: `Source: ${oldPathValidation.error}`,
        };
      }

      const newPathValidation = validatePath(newPath);
      if (!newPathValidation.isValid) {
        return {
          success: false,
          output: null,
          error: `Destination: ${newPathValidation.error}`,
        };
      }

      try {
        // Vérifier que le fichier source existe
        const exists = await fs.exists(oldPath);

        if (!exists) {
          return {
            success: false,
            output: null,
            error: `Source file not found: ${oldPath}`,
          };
        }

        // Créer le dossier de destination si nécessaire
        const destDir = newPath.split('/').slice(0, -1).join('/');

        if (destDir) {
          await fs.mkdir(destDir, { recursive: true });
        }

        await fs.rename(oldPath, newPath);

        return {
          success: true,
          output: `File moved successfully: ${oldPath} → ${newPath}`,
        };
      } catch (error) {
        return {
          success: false,
          output: null,
          error: `Failed to move file: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },
  };
}

/*
 * ============================================================================
 * MOCK FILESYSTEM AVEC ÉCRITURE (POUR LES TESTS)
 * ============================================================================
 */

/**
 * Créer un mock FileSystem avec capacités d'écriture pour les tests
 */
export function createMockWritableFileSystem(
  initialFiles: Record<string, string> = {},
): WritableFileSystem & { getFiles(): Record<string, string> } {
  const files = new Map<string, string>(Object.entries(initialFiles));
  const directories = new Set<string>();

  // Initialiser les dossiers à partir des fichiers existants
  for (const path of files.keys()) {
    const parts = path.split('/');

    for (let i = 1; i < parts.length; i++) {
      directories.add(parts.slice(0, i).join('/'));
    }
  }

  return {
    async readFile(path: string): Promise<string> {
      const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
      const content = files.get(normalizedPath);

      if (content === undefined) {
        throw new Error(`File not found: ${path}`);
      }

      return content;
    },

    async writeFile(path: string, content: string): Promise<void> {
      const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
      files.set(normalizedPath, content);

      // Ajouter les dossiers parents
      const parts = normalizedPath.split('/');

      for (let i = 1; i < parts.length; i++) {
        directories.add(parts.slice(0, i).join('/'));
      }
    },

    async deleteFile(path: string): Promise<void> {
      const normalizedPath = path.startsWith('/') ? path.slice(1) : path;

      if (!files.has(normalizedPath)) {
        throw new Error(`File not found: ${path}`);
      }

      files.delete(normalizedPath);
    },

    async mkdir(path: string, _options?: { recursive?: boolean }): Promise<void> {
      const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
      directories.add(normalizedPath);

      // Ajouter les parents aussi
      const parts = normalizedPath.split('/');

      for (let i = 1; i < parts.length; i++) {
        directories.add(parts.slice(0, i).join('/'));
      }
    },

    async rename(oldPath: string, newPath: string): Promise<void> {
      const normalizedOld = oldPath.startsWith('/') ? oldPath.slice(1) : oldPath;
      const normalizedNew = newPath.startsWith('/') ? newPath.slice(1) : newPath;

      const content = files.get(normalizedOld);

      if (content === undefined) {
        throw new Error(`File not found: ${oldPath}`);
      }

      files.delete(normalizedOld);
      files.set(normalizedNew, content);
    },

    async exists(path: string): Promise<boolean> {
      const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
      return files.has(normalizedPath) || directories.has(normalizedPath);
    },

    async readdir(path: string): Promise<Array<{ name: string; isDirectory: boolean }>> {
      const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
      const prefix = normalizedPath ? `${normalizedPath}/` : '';
      const entries = new Map<string, boolean>();

      // Trouver les fichiers dans ce dossier
      for (const filePath of files.keys()) {
        if (filePath.startsWith(prefix)) {
          const rest = filePath.slice(prefix.length);
          const name = rest.split('/')[0];

          if (name && !entries.has(name)) {
            entries.set(name, rest.includes('/'));
          }
        }
      }

      // Trouver les dossiers
      for (const dirPath of directories) {
        if (dirPath.startsWith(prefix)) {
          const rest = dirPath.slice(prefix.length);
          const name = rest.split('/')[0];

          if (name && !entries.has(name)) {
            entries.set(name, true);
          }
        }
      }

      return Array.from(entries.entries()).map(([name, isDirectory]) => ({
        name,
        isDirectory,
      }));
    },

    getFiles(): Record<string, string> {
      return Object.fromEntries(files);
    },
  };
}
