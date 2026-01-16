/**
 * React hook for managing checkpoints (Time Travel feature).
 * Provides a convenient interface for checkpoint operations in components.
 */

import { useCallback, useEffect, useState } from 'react';
import { useStore } from '@nanostores/react';
import type { Message } from '~/types/message';
import type { Checkpoint, RestoreOptions, RestoreResult, CheckpointEvent } from '~/types/checkpoint';
import type { FileMap } from '~/lib/stores/files';
import type { ActionState } from '~/lib/runtime/action-runner';
import {
  checkpointsMap,
  currentChatCheckpoints,
  latestCheckpoint,
  checkpointCount,
  hasCheckpoints,
  checkpointStats,
  isRestoring,
  isLoading,
  checkpointError,
  currentCheckpointId,
  checkpointConfig,
  addCheckpoint,
  removeCheckpoint,
  clearCheckpointsForChat,
  updateCheckpointDescription as updateDescription,
  setCurrentCheckpoint,
  setRestoring,
  setLoading,
  setError,
  setCurrentChatId,
  canCreateAutoCheckpoint,
  recordAutoCheckpoint,
  filterExcludedFiles,
  subscribeToEvents,
  formatCheckpointForTimeline,
} from '~/lib/stores/checkpoints';
import {
  createCheckpoint as dbCreateCheckpoint,
  getCheckpointsByChat as dbGetCheckpointsByChat,
  getCheckpointById as dbGetCheckpointById,
  deleteCheckpoint as dbDeleteCheckpoint,
  deleteOldCheckpoints as dbDeleteOldCheckpoints,
  updateCheckpointDescription as dbUpdateDescription,
} from '~/lib/persistence/checkpoints-db';
import { getPGlite } from '~/lib/persistence/pglite';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('useCheckpoints');

export interface UseCheckpointsOptions {
  /** Chat ID to manage checkpoints for */
  chatId: string;

  /** Callback to get current files snapshot */
  getFilesSnapshot?: () => FileMap;

  /** Callback to get current messages */
  getMessages?: () => Message[];

  /** Callback to get current actions state */
  getActionsSnapshot?: () => Record<string, ActionState>;

  /** Callback when files should be restored */
  onRestoreFiles?: (files: FileMap) => Promise<void>;

  /** Callback when messages should be restored */
  onRestoreMessages?: (messages: Message[]) => void;

  /** Auto-load checkpoints on mount */
  autoLoad?: boolean;
}

export interface UseCheckpointsReturn {
  // State
  checkpoints: Checkpoint[];
  latestCheckpoint: Checkpoint | null;
  currentCheckpointId: string | null;
  checkpointCount: number;
  hasCheckpoints: boolean;
  stats: ReturnType<typeof checkpointStats.get>;
  isRestoring: boolean;
  isLoading: boolean;
  error: Error | null;

  // Actions
  createCheckpoint: (
    description?: string,
    triggerType?: 'manual' | 'auto' | 'before_action',
  ) => Promise<Checkpoint | null>;
  restoreCheckpoint: (checkpointId: string, options?: Partial<RestoreOptions>) => Promise<RestoreResult>;
  deleteCheckpoint: (checkpointId: string) => Promise<boolean>;
  updateDescription: (checkpointId: string, description: string) => Promise<boolean>;
  loadCheckpoints: () => Promise<void>;
  clearCheckpoints: () => Promise<void>;

  // Utilities
  canCreateCheckpoint: boolean;
  formatForTimeline: (checkpoint: Checkpoint) => ReturnType<typeof formatCheckpointForTimeline>;
  subscribeToEvents: (listener: (event: CheckpointEvent) => void) => () => void;
}

/**
 * Hook React pour la gestion des checkpoints (Time Travel).
 *
 * Ce hook fournit une interface complète pour:
 * - Créer des points de sauvegarde manuels ou automatiques
 * - Restaurer l'état du projet à un point précédent
 * - Gérer et supprimer les checkpoints existants
 * - Suivre les statistiques et l'état de chargement
 *
 * @param options - Configuration du hook
 * @param options.chatId - ID du chat pour lequel gérer les checkpoints
 * @param options.getFilesSnapshot - Callback pour obtenir l'état actuel des fichiers
 * @param options.getMessages - Callback pour obtenir les messages actuels
 * @param options.getActionsSnapshot - Callback pour obtenir l'état des actions
 * @param options.onRestoreFiles - Callback pour restaurer les fichiers
 * @param options.onRestoreMessages - Callback pour restaurer les messages
 * @param options.autoLoad - Charger automatiquement les checkpoints au montage (défaut: true)
 *
 * @returns Interface UseCheckpointsReturn avec état et actions
 *
 * @example
 * ```tsx
 * const {
 *   checkpoints,
 *   createCheckpoint,
 *   restoreCheckpoint,
 *   isRestoring,
 * } = useCheckpoints({
 *   chatId: 'chat-123',
 *   getFilesSnapshot: () => filesStore.get(),
 *   onRestoreFiles: async (files) => filesStore.set(files),
 * });
 *
 * // Créer un checkpoint manuel
 * await createCheckpoint('Avant refactoring', 'manual');
 *
 * // Restaurer un checkpoint
 * await restoreCheckpoint(checkpoints[0].id);
 * ```
 */
export function useCheckpoints(options: UseCheckpointsOptions): UseCheckpointsReturn {
  const {
    chatId,
    getFilesSnapshot,
    getMessages,
    getActionsSnapshot,
    onRestoreFiles,
    onRestoreMessages,
    autoLoad = true,
  } = options;

  // Subscribe to store state
  const checkpoints = useStore(currentChatCheckpoints);
  const latest = useStore(latestCheckpoint);
  const count = useStore(checkpointCount);
  const hasAny = useStore(hasCheckpoints);
  const stats = useStore(checkpointStats);
  const restoring = useStore(isRestoring);
  const loading = useStore(isLoading);
  const error = useStore(checkpointError);
  const currentId = useStore(currentCheckpointId);
  const config = useStore(checkpointConfig);

  // Local state
  const [initialized, setInitialized] = useState(false);

  // Set current chat ID when it changes
  useEffect(() => {
    setCurrentChatId(chatId);
  }, [chatId]);

  // Auto-load checkpoints on mount
  useEffect(() => {
    if (autoLoad && chatId && !initialized) {
      loadCheckpoints();
      setInitialized(true);
    }
  }, [chatId, autoLoad, initialized]);

  /**
   * Charge les checkpoints depuis la base de données PGlite.
   * Appelé automatiquement si autoLoad est true.
   *
   * @returns Promise résolue quand le chargement est terminé
   */
  const loadCheckpoints = useCallback(async (): Promise<void> => {
    if (!chatId) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const db = await getPGlite();
      const dbCheckpoints = await dbGetCheckpointsByChat(db, chatId);

      // Clear existing and add loaded checkpoints
      clearCheckpointsForChat(chatId);

      for (const checkpoint of dbCheckpoints) {
        addCheckpoint(checkpoint);
      }

      logger.debug(`Loaded ${dbCheckpoints.length} checkpoints for chat ${chatId}`);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to load checkpoints');
      setError(error);
      logger.error('Failed to load checkpoints:', error);
    } finally {
      setLoading(false);
    }
  }, [chatId]);

  /**
   * Crée un nouveau checkpoint avec l'état actuel du projet.
   *
   * @param description - Description optionnelle du checkpoint
   * @param triggerType - Type de déclencheur ('manual', 'auto', 'before_action')
   * @returns Le checkpoint créé, ou null en cas d'erreur ou throttling
   */
  const createCheckpoint = useCallback(
    async (
      description?: string,
      triggerType: 'manual' | 'auto' | 'before_action' = 'manual',
    ): Promise<Checkpoint | null> => {
      if (!chatId) {
        logger.warn('Cannot create checkpoint: no chat ID');
        return null;
      }

      // Check throttling for auto checkpoints
      if (triggerType === 'auto' && !canCreateAutoCheckpoint()) {
        logger.debug('Auto checkpoint throttled');
        return null;
      }

      // Get snapshots
      const filesSnapshot = getFilesSnapshot?.() ?? {};
      const messagesSnapshot = getMessages?.() ?? [];
      const actionsSnapshot = getActionsSnapshot?.();

      // Filter excluded files
      const filteredFiles = filterExcludedFiles(filesSnapshot);

      setError(null);

      try {
        const db = await getPGlite();

        const checkpoint = await dbCreateCheckpoint(db, {
          chatId,
          filesSnapshot: filteredFiles,
          messagesSnapshot,
          actionsSnapshot,
          description,
          triggerType,
        });

        // Add to store
        addCheckpoint(checkpoint);

        // Record auto checkpoint time if applicable
        if (triggerType === 'auto') {
          recordAutoCheckpoint();
        }

        // Cleanup old checkpoints if needed
        const currentCheckpoints = Object.values(checkpointsMap.get()).filter((cp) => cp.chatId === chatId);

        if (currentCheckpoints.length > config.maxCheckpointsPerChat) {
          await dbDeleteOldCheckpoints(db, chatId, config.maxCheckpointsPerChat, {
            preserveManual: config.preserveManualOnCleanup,
          });

          // Reload to sync store with DB
          await loadCheckpoints();
        }

        logger.info(`Checkpoint created: ${checkpoint.id}`);

        return checkpoint;
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to create checkpoint');
        setError(error);
        logger.error('Failed to create checkpoint:', error);

        return null;
      }
    },
    [chatId, getFilesSnapshot, getMessages, getActionsSnapshot, config, loadCheckpoints],
  );

  /**
   * Restaure l'état du projet à un checkpoint précédent.
   *
   * @param checkpointId - ID du checkpoint à restaurer
   * @param options - Options de restauration
   * @param options.restoreFiles - Restaurer les fichiers (défaut: true)
   * @param options.restoreConversation - Restaurer la conversation (défaut: false)
   * @param options.createRestorePoint - Créer un point de restauration avant (défaut: true)
   * @returns Résultat avec success, filesRestored, messagesRestored, etc.
   */
  const restoreCheckpoint = useCallback(
    async (checkpointId: string, options: Partial<RestoreOptions> = {}): Promise<RestoreResult> => {
      const { restoreFiles = true, restoreConversation = false, createRestorePoint = true } = options;

      setRestoring(true);
      setError(null);

      const result: RestoreResult = {
        success: false,
        restoredCheckpointId: checkpointId,
        filesRestored: 0,
        messagesRestored: 0,
      };

      try {
        const db = await getPGlite();

        // Get the checkpoint to restore
        const checkpoint = await dbGetCheckpointById(db, checkpointId);

        if (!checkpoint) {
          throw new Error(`Checkpoint not found: ${checkpointId}`);
        }

        // Create restore point before restoring
        if (createRestorePoint) {
          const restorePoint = await createCheckpoint(
            `Avant restauration de ${checkpoint.description || checkpointId}`,
            'before_action',
          );

          if (restorePoint) {
            result.restorePointId = restorePoint.id;
          }
        }

        // Restore files
        if (restoreFiles && onRestoreFiles) {
          await onRestoreFiles(checkpoint.filesSnapshot);
          result.filesRestored = Object.keys(checkpoint.filesSnapshot).length;
        }

        // Restore messages
        if (restoreConversation && onRestoreMessages) {
          onRestoreMessages(checkpoint.messagesSnapshot);
          result.messagesRestored = checkpoint.messagesSnapshot.length;
        }

        // Update current checkpoint ID
        setCurrentCheckpoint(checkpointId);

        result.success = true;

        logger.info(`Checkpoint restored: ${checkpointId}`);
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to restore checkpoint');
        setError(error);
        result.error = error.message;
        logger.error('Failed to restore checkpoint:', error);
      } finally {
        setRestoring(false);
      }

      return result;
    },
    [createCheckpoint, onRestoreFiles, onRestoreMessages],
  );

  /**
   * Supprime un checkpoint de la base de données.
   *
   * @param checkpointId - ID du checkpoint à supprimer
   * @returns true si supprimé avec succès, false sinon
   */
  const deleteCheckpointHandler = useCallback(async (checkpointId: string): Promise<boolean> => {
    setError(null);

    try {
      const db = await getPGlite();
      const deleted = await dbDeleteCheckpoint(db, checkpointId);

      if (deleted) {
        removeCheckpoint(checkpointId);
        logger.info(`Checkpoint deleted: ${checkpointId}`);
      }

      return deleted;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to delete checkpoint');
      setError(error);
      logger.error('Failed to delete checkpoint:', error);

      return false;
    }
  }, []);

  /**
   * Met à jour la description d'un checkpoint existant.
   *
   * @param checkpointId - ID du checkpoint à modifier
   * @param description - Nouvelle description
   * @returns true si mis à jour avec succès, false sinon
   */
  const updateDescriptionHandler = useCallback(async (checkpointId: string, description: string): Promise<boolean> => {
    setError(null);

    try {
      const db = await getPGlite();
      const updated = await dbUpdateDescription(db, checkpointId, description);

      if (updated) {
        updateDescription(checkpointId, description);
        logger.debug(`Checkpoint ${checkpointId} description updated`);
      }

      return updated;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to update description');
      setError(error);
      logger.error('Failed to update description:', error);

      return false;
    }
  }, []);

  /**
   * Supprime tous les checkpoints du chat actuel.
   * ⚠️ Action irréversible.
   *
   * @returns Promise résolue quand la suppression est terminée
   */
  const clearCheckpointsHandler = useCallback(async (): Promise<void> => {
    if (!chatId) {
      return;
    }

    setError(null);

    try {
      const db = await getPGlite();
      await db.query('DELETE FROM checkpoints WHERE chat_id = $1', [chatId]);
      clearCheckpointsForChat(chatId);

      logger.info(`All checkpoints cleared for chat ${chatId}`);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to clear checkpoints');
      setError(error);
      logger.error('Failed to clear checkpoints:', error);
    }
  }, [chatId]);

  /**
   * Formate un checkpoint pour l'affichage dans la timeline.
   *
   * @param checkpoint - Le checkpoint à formater
   * @returns Objet formaté avec time, date, filesCount, etc.
   */
  const formatForTimeline = useCallback((checkpoint: Checkpoint) => {
    return formatCheckpointForTimeline(checkpoint);
  }, []);

  return {
    // State
    checkpoints,
    latestCheckpoint: latest,
    currentCheckpointId: currentId,
    checkpointCount: count,
    hasCheckpoints: hasAny,
    stats,
    isRestoring: restoring,
    isLoading: loading,
    error,

    // Actions
    createCheckpoint,
    restoreCheckpoint,
    deleteCheckpoint: deleteCheckpointHandler,
    updateDescription: updateDescriptionHandler,
    loadCheckpoints,
    clearCheckpoints: clearCheckpointsHandler,

    // Utilities
    canCreateCheckpoint: !restoring && !loading && !!chatId,
    formatForTimeline,
    subscribeToEvents,
  };
}
