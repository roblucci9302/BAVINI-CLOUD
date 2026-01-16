import { useState, useCallback } from 'react';
import { workbenchStore } from '~/lib/stores/workbench';
import type { FileMap } from '~/lib/stores/files';
import { hasTemplateFiles, type ProjectTemplate } from '~/lib/templates';
import type { TemplateFilesResponse } from '~/lib/templates/types';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('useTemplateLoader');

interface UseTemplateLoaderResult {
  /** Charge les fichiers d'un template dans le workbench */
  loadTemplate: (template: ProjectTemplate) => Promise<boolean>;

  /** État de chargement */
  isLoading: boolean;

  /** Erreur éventuelle */
  error: string | null;
}

/**
 * Hook pour charger les fichiers d'un template dans le workbench
 */
export function useTemplateLoader(): UseTemplateLoaderResult {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTemplate = useCallback(async (template: ProjectTemplate): Promise<boolean> => {
    // Vérifier si le template a des fichiers pré-construits
    if (!hasTemplateFiles(template)) {
      logger.debug(`Template "${template.id}" has no pre-built files, skipping`);
      return false;
    }

    setIsLoading(true);
    setError(null);

    try {
      logger.info(`Loading template files for "${template.id}"...`);

      // Appeler l'API pour récupérer les fichiers
      const response = await fetch(`/api/templates/${template.id}`);

      if (!response.ok) {
        throw new Error(`Failed to load template: ${response.statusText}`);
      }

      const data = (await response.json()) as TemplateFilesResponse;

      if (!data.success) {
        throw new Error('Template loading failed');
      }

      logger.info(`Loaded ${data.files.length} files for template "${template.id}"`);

      // Convertir les fichiers en FileMap
      const fileMap: FileMap = {};

      for (const file of data.files) {
        // Créer les dossiers parents
        const parts = file.path.split('/');

        for (let i = 0; i < parts.length - 1; i++) {
          const folderPath = parts.slice(0, i + 1).join('/');

          if (!fileMap[folderPath]) {
            fileMap[folderPath] = { type: 'folder' };
          }
        }

        // Ajouter le fichier
        fileMap[file.path] = {
          type: 'file',
          content: file.content,
          isBinary: false,
        };
      }

      // Charger les fichiers dans le workbench
      await workbenchStore.restoreFromSnapshot(fileMap);

      // Afficher le workbench
      workbenchStore.setShowWorkbench(true);

      logger.info(`Template "${template.id}" loaded successfully`);

      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      logger.error(`Failed to load template "${template.id}":`, message);
      setError(message);

      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    loadTemplate,
    isLoading,
    error,
  };
}
