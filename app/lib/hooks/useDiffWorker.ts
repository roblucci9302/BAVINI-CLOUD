/**
 * Hook pour utiliser le Diff Web Worker
 * Décharge le calcul de diff du main thread
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { DiffResult, DiffWorkerRequest, DiffWorkerResponse } from '~/workers/diff.worker';

interface UseDiffWorkerResult {
  /** Calculer le diff entre deux contenus */
  computeDiff: (oldContent: string, newContent: string) => Promise<DiffResult>;

  /** Worker prêt */
  isReady: boolean;

  /** Erreur du worker */
  error: Error | null;
}

// ID pour les messages
let messageId = 0;

/**
 * Générer un ID unique pour les messages
 */
function generateId(): string {
  return `diff-${++messageId}-${Date.now()}`;
}

/**
 * Hook pour utiliser le Diff Web Worker
 */
export function useDiffWorker(): UseDiffWorkerResult {
  const workerRef = useRef<Worker | null>(null);
  const pendingRef = useRef<Map<string, { resolve: (value: DiffResult) => void; reject: (error: Error) => void }>>(
    new Map(),
  );
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Initialiser le worker
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      const worker = new Worker(new URL('../../workers/diff.worker.ts', import.meta.url), {
        type: 'module',
      });

      worker.onmessage = (event: MessageEvent<DiffWorkerResponse | { type: 'ready' }>) => {
        const data = event.data;

        // Message de ready initial
        if ('type' in data && data.type === 'ready') {
          setIsReady(true);
          return;
        }

        // Réponses aux requêtes
        const response = data as DiffWorkerResponse;
        const pending = pendingRef.current.get(response.id);

        if (pending) {
          pendingRef.current.delete(response.id);

          if (response.type === 'success' && response.result) {
            pending.resolve(response.result);
          } else {
            pending.reject(new Error(response.error || 'Unknown error'));
          }
        }
      };

      worker.onerror = (event) => {
        setError(new Error(`Worker error: ${event.message}`));
      };

      workerRef.current = worker;

      return () => {
        worker.terminate();
        workerRef.current = null;
        pendingRef.current.clear();
      };
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to create worker'));
    }
  }, []);

  /**
   * Calculer le diff entre deux contenus
   */
  const computeDiff = useCallback((oldContent: string, newContent: string): Promise<DiffResult> => {
    return new Promise((resolve, reject) => {
      if (!workerRef.current) {
        reject(new Error('Worker not initialized'));
        return;
      }

      const id = generateId();
      pendingRef.current.set(id, { resolve, reject });

      workerRef.current.postMessage({
        id,
        type: 'computeDiff',
        payload: { oldContent, newContent },
      } as DiffWorkerRequest);

      // Timeout après 30 secondes
      setTimeout(() => {
        if (pendingRef.current.has(id)) {
          pendingRef.current.delete(id);
          reject(new Error('Worker request timeout'));
        }
      }, 30000);
    });
  }, []);

  return {
    computeDiff,
    isReady,
    error,
  };
}

/**
 * Singleton worker pour usage global (hors composants React)
 */
let globalWorker: Worker | null = null;
let globalWorkerReady = false;
const globalPending = new Map<string, { resolve: (value: DiffResult) => void; reject: (error: Error) => void }>();

/**
 * Obtenir le worker global
 */
function getGlobalWorker(): Worker {
  if (typeof window === 'undefined') {
    throw new Error('Workers are only available in browser');
  }

  if (!globalWorker) {
    globalWorker = new Worker(new URL('../../workers/diff.worker.ts', import.meta.url), {
      type: 'module',
    });

    globalWorker.onmessage = (event: MessageEvent<DiffWorkerResponse | { type: 'ready' }>) => {
      const data = event.data;

      if ('type' in data && data.type === 'ready') {
        globalWorkerReady = true;
        return;
      }

      const response = data as DiffWorkerResponse;
      const pending = globalPending.get(response.id);

      if (pending) {
        globalPending.delete(response.id);

        if (response.type === 'success' && response.result) {
          pending.resolve(response.result);
        } else {
          pending.reject(new Error(response.error || 'Unknown error'));
        }
      }
    };
  }

  return globalWorker;
}

/**
 * Calculer le diff via le worker global (pour usage hors React)
 */
export async function computeDiffWithWorker(oldContent: string, newContent: string): Promise<DiffResult> {
  const worker = getGlobalWorker();

  return new Promise((resolve, reject) => {
    const id = generateId();
    globalPending.set(id, { resolve, reject });

    worker.postMessage({
      id,
      type: 'computeDiff',
      payload: { oldContent, newContent },
    } as DiffWorkerRequest);

    setTimeout(() => {
      if (globalPending.has(id)) {
        globalPending.delete(id);
        reject(new Error('Worker request timeout'));
      }
    }, 30000);
  });
}

/**
 * Terminer le worker global
 */
export function terminateGlobalDiffWorker(): void {
  if (globalWorker) {
    globalWorker.terminate();
    globalWorker = null;
    globalWorkerReady = false;
    globalPending.clear();
  }
}
