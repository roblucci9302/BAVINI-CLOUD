/**
 * Adaptateur pour intégrer WebContainer avec le système d'agents
 * Fournit une interface FileSystem compatible
 */

import type { FileSystem } from '../tools/read-tools';

/**
 * Interface minimale de WebContainer pour l'adaptateur
 */
interface WebContainerFS {
  readFile(path: string, encoding?: string): Promise<string>;
  readdir(
    path: string,
    options?: { withFileTypes?: boolean },
  ): Promise<string[] | Array<{ name: string; isDirectory(): boolean }>>;
  stat?(path: string): Promise<{ size: number; isDirectory(): boolean }>;
}

interface WebContainerInstance {
  fs: WebContainerFS;
}

/**
 * Créer un adaptateur FileSystem à partir de WebContainer
 */
export function createWebContainerAdapter(webcontainer: WebContainerInstance): FileSystem {
  return {
    async readFile(path: string): Promise<string> {
      try {
        // Normaliser le chemin
        const normalizedPath = path.startsWith('/') ? path.slice(1) : path;

        const content = await webcontainer.fs.readFile(normalizedPath, 'utf-8');

        return content;
      } catch (error) {
        throw new Error(`Failed to read file ${path}: ${error instanceof Error ? error.message : String(error)}`);
      }
    },

    async readdir(path: string): Promise<Array<{ name: string; isDirectory: boolean; size?: number }>> {
      try {
        // Normaliser le chemin
        const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
        const dirPath = normalizedPath || '.';

        const entries = await webcontainer.fs.readdir(dirPath, {
          withFileTypes: true,
        });

        // Convertir au format attendu
        return (entries as Array<{ name: string; isDirectory(): boolean }>).map((entry) => ({
          name: entry.name,
          isDirectory: entry.isDirectory(),

          // La taille n'est pas toujours disponible dans WebContainer
          size: undefined,
        }));
      } catch (error) {
        throw new Error(`Failed to read directory ${path}: ${error instanceof Error ? error.message : String(error)}`);
      }
    },

    async exists(path: string): Promise<boolean> {
      try {
        const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
        await webcontainer.fs.readFile(normalizedPath, 'utf-8');

        return true;
      } catch {
        // Essayer comme dossier
        try {
          const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
          await webcontainer.fs.readdir(normalizedPath);

          return true;
        } catch {
          return false;
        }
      }
    },
  };
}

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
