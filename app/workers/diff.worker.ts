/**
 * Web Worker pour le calcul de diff
 * Décharge le main thread pour les comparaisons de gros fichiers
 */

import { diffLines, type Change } from 'diff';

// Types pour la communication
export interface DiffLine {
  type: 'added' | 'removed' | 'unchanged';
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

export interface DiffResult {
  lines: DiffLine[];
  stats: {
    additions: number;
    deletions: number;
    unchanged: number;
  };
}

export interface DiffWorkerRequest {
  id: string;
  type: 'computeDiff';
  payload: {
    oldContent: string;
    newContent: string;
  };
}

export interface DiffWorkerResponse {
  id: string;
  type: 'success' | 'error';
  result?: DiffResult;
  error?: string;
}

/**
 * Traiter les changements de diff en lignes avec numéros
 */
function processDiffChanges(changes: Change[]): DiffResult {
  const lines: DiffLine[] = [];
  let oldLineNumber = 1;
  let newLineNumber = 1;
  let additions = 0;
  let deletions = 0;
  let unchanged = 0;

  for (const change of changes) {
    const contentLines = change.value.split('\n');

    // Retirer le dernier élément vide si la chaîne se termine par newline
    if (contentLines[contentLines.length - 1] === '') {
      contentLines.pop();
    }

    for (const content of contentLines) {
      if (change.added) {
        lines.push({
          type: 'added',
          content,
          newLineNumber: newLineNumber++,
        });
        additions++;
      } else if (change.removed) {
        lines.push({
          type: 'removed',
          content,
          oldLineNumber: oldLineNumber++,
        });
        deletions++;
      } else {
        lines.push({
          type: 'unchanged',
          content,
          oldLineNumber: oldLineNumber++,
          newLineNumber: newLineNumber++,
        });
        unchanged++;
      }
    }
  }

  return {
    lines,
    stats: { additions, deletions, unchanged },
  };
}

/**
 * Calculer le diff entre deux contenus
 */
function computeDiff(oldContent: string, newContent: string): DiffResult {
  const changes = diffLines(oldContent, newContent);
  return processDiffChanges(changes);
}

/**
 * Envoyer une réponse
 */
function sendResponse(response: DiffWorkerResponse): void {
  self.postMessage(response);
}

/**
 * Gestionnaire de messages
 */
self.onmessage = (event: MessageEvent<DiffWorkerRequest>) => {
  const { id, type, payload } = event.data;

  try {
    switch (type) {
      case 'computeDiff': {
        const result = computeDiff(payload.oldContent, payload.newContent);
        sendResponse({ id, type: 'success', result });
        break;
      }

      default:
        sendResponse({ id, type: 'error', error: `Unknown message type: ${type}` });
    }
  } catch (error) {
    sendResponse({
      id,
      type: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

// Informer que le worker est prêt
self.postMessage({ type: 'ready' });
