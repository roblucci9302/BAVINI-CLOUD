/**
 * Hook pour utiliser le Shiki Web Worker
 * Décharge le syntax highlighting du main thread
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ShikiWorkerRequest, ShikiWorkerResponse } from '~/workers/shiki.worker';

interface UseShikiWorkerOptions {
  /** Initialiser le worker au montage */
  autoInit?: boolean;

  /** Thème par défaut */
  defaultTheme?: 'light-plus' | 'dark-plus';
}

interface UseShikiWorkerResult {
  /** Highlight du code (async) */
  highlight: (code: string, lang: string, theme?: 'light-plus' | 'dark-plus') => Promise<string>;

  /** Précharger un langage */
  loadLanguage: (lang: string) => Promise<boolean>;

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
  return `shiki-${++messageId}-${Date.now()}`;
}

/**
 * Hook pour utiliser le Shiki Web Worker
 */
export function useShikiWorker(options: UseShikiWorkerOptions = {}): UseShikiWorkerResult {
  const { autoInit = true, defaultTheme = 'dark-plus' } = options;

  const workerRef = useRef<Worker | null>(null);
  const pendingRef = useRef<Map<string, { resolve: (value: string) => void; reject: (error: Error) => void }>>(
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
      const worker = new Worker(new URL('../../workers/shiki.worker.ts', import.meta.url), {
        type: 'module',
      });

      worker.onmessage = (event: MessageEvent<ShikiWorkerResponse | { type: 'ready' }>) => {
        const data = event.data;

        // Message de ready initial
        if ('type' in data && data.type === 'ready') {
          if (autoInit) {
            // Initialiser le highlighter
            const initId = generateId();
            worker.postMessage({ id: initId, type: 'init' } as ShikiWorkerRequest);
          } else {
            setIsReady(true);
          }

          return;
        }

        // Réponses aux requêtes
        const response = data as ShikiWorkerResponse;
        const pending = pendingRef.current.get(response.id);

        if (pending) {
          pendingRef.current.delete(response.id);

          if (response.type === 'success') {
            // Marquer comme prêt après la première init réussie
            if (!isReady && response.result === 'initialized') {
              setIsReady(true);
            }

            pending.resolve(response.result || '');
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
  }, [autoInit, isReady]);

  /**
   * Envoyer un message au worker et attendre la réponse
   */
  const sendMessage = useCallback(
    (type: ShikiWorkerRequest['type'], payload?: ShikiWorkerRequest['payload']): Promise<string> => {
      return new Promise((resolve, reject) => {
        if (!workerRef.current) {
          reject(new Error('Worker not initialized'));
          return;
        }

        const id = generateId();
        pendingRef.current.set(id, { resolve, reject });

        workerRef.current.postMessage({ id, type, payload } as ShikiWorkerRequest);

        // Timeout après 30 secondes
        setTimeout(() => {
          if (pendingRef.current.has(id)) {
            pendingRef.current.delete(id);
            reject(new Error('Worker request timeout'));
          }
        }, 30000);
      });
    },
    [],
  );

  /**
   * Highlight du code
   */
  const highlight = useCallback(
    async (code: string, lang: string, theme?: 'light-plus' | 'dark-plus'): Promise<string> => {
      return sendMessage('highlight', {
        code,
        lang,
        theme: theme || defaultTheme,
      });
    },
    [sendMessage, defaultTheme],
  );

  /**
   * Précharger un langage
   */
  const loadLanguage = useCallback(
    async (lang: string): Promise<boolean> => {
      try {
        await sendMessage('loadLanguage', { lang });
        return true;
      } catch {
        return false;
      }
    },
    [sendMessage],
  );

  return {
    highlight,
    loadLanguage,
    isReady,
    error,
  };
}

/**
 * Singleton worker pour usage global (hors composants React)
 */
let globalWorker: Worker | null = null;
let globalWorkerReady = false;
const globalPending = new Map<string, { resolve: (value: string) => void; reject: (error: Error) => void }>();

/**
 * Obtenir le worker global
 */
function getGlobalWorker(): Worker {
  if (typeof window === 'undefined') {
    throw new Error('Workers are only available in browser');
  }

  if (!globalWorker) {
    globalWorker = new Worker(new URL('../../workers/shiki.worker.ts', import.meta.url), {
      type: 'module',
    });

    globalWorker.onmessage = (event: MessageEvent<ShikiWorkerResponse | { type: 'ready' }>) => {
      const data = event.data;

      if ('type' in data && data.type === 'ready') {
        globalWorkerReady = true;
        return;
      }

      const response = data as ShikiWorkerResponse;
      const pending = globalPending.get(response.id);

      if (pending) {
        globalPending.delete(response.id);

        if (response.type === 'success') {
          pending.resolve(response.result || '');
        } else {
          pending.reject(new Error(response.error || 'Unknown error'));
        }
      }
    };
  }

  return globalWorker;
}

/**
 * Highlight du code via le worker global (pour usage hors React)
 */
export async function highlightWithWorker(
  code: string,
  lang: string,
  theme: 'light-plus' | 'dark-plus' = 'dark-plus',
): Promise<string> {
  const worker = getGlobalWorker();

  return new Promise((resolve, reject) => {
    const id = generateId();
    globalPending.set(id, { resolve, reject });

    worker.postMessage({
      id,
      type: 'highlight',
      payload: { code, lang, theme },
    } as ShikiWorkerRequest);

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
export function terminateGlobalWorker(): void {
  if (globalWorker) {
    globalWorker.terminate();
    globalWorker = null;
    globalWorkerReady = false;
    globalPending.clear();
  }
}
