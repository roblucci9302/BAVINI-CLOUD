/**
 * =============================================================================
 * Mock FileSystem pour les tests
 * =============================================================================
 * Fournit une implémentation mock du système de fichiers pour les tests
 * sans dépendance à WebContainer.
 * =============================================================================
 */

import type { FileSystem } from '../tools/read-tools';

/**
 * FileSystem mock pour les tests
 */
export function createMockFileSystem(files: Record<string, string>): FileSystem {
  const fileMap = new Map(Object.entries(files));

  // Construire la structure de dossiers
  const directories = new Map<string, Set<string>>();

  for (const path of fileMap.keys()) {
    const parts = path.split('/');
    let currentPath = '';

    for (let i = 0; i < parts.length - 1; i++) {
      const parent = currentPath;
      currentPath = currentPath ? `${currentPath}/${parts[i]}` : parts[i];

      if (!directories.has(parent)) {
        directories.set(parent, new Set());
      }

      directories.get(parent)!.add(parts[i]);
    }

    // Ajouter le fichier au dossier parent
    const parentDir = parts.slice(0, -1).join('/');

    if (!directories.has(parentDir)) {
      directories.set(parentDir, new Set());
    }

    directories.get(parentDir)!.add(parts[parts.length - 1]);
  }

  return {
    async readFile(path: string): Promise<string> {
      const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
      const content = fileMap.get(normalizedPath);

      if (content === undefined) {
        throw new Error(`File not found: ${path}`);
      }

      return content;
    },

    async readdir(path: string): Promise<Array<{ name: string; isDirectory: boolean; size?: number }>> {
      const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
      const dirPath = normalizedPath || '';

      const entries = directories.get(dirPath);

      if (!entries) {
        throw new Error(`Directory not found: ${path}`);
      }

      return Array.from(entries).map((name) => {
        const fullPath = dirPath ? `${dirPath}/${name}` : name;
        const isDir = directories.has(fullPath);
        const fileContent = fileMap.get(fullPath);

        return {
          name,
          isDirectory: isDir,
          size: fileContent ? fileContent.length : undefined,
        };
      });
    },

    async exists(path: string): Promise<boolean> {
      const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
      return fileMap.has(normalizedPath) || directories.has(normalizedPath);
    },
  };
}
