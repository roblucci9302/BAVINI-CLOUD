'use client';

import { memo, useMemo, useState, useEffect } from 'react';
import { diffLines, type Change } from 'diff';
import { classNames } from '~/utils/classNames';
import { useDiffWorker } from '~/lib/hooks/useDiffWorker';
import type { DiffResult, DiffLine } from '~/workers/diff.worker';

// Seuil pour utiliser le worker (en caractères combinés)
const WORKER_THRESHOLD = 10000;

export interface DiffViewerProps {
  originalContent: string;
  modifiedContent: string;
  fileName?: string;
  className?: string;

  /** Forcer l'utilisation du worker */
  forceWorker?: boolean;
}

/**
 * DiffViewer component that displays a unified diff view
 * comparing original content with modified content.
 */
export const DiffViewer = memo(
  ({ originalContent, modifiedContent, fileName, className, forceWorker = false }: DiffViewerProps) => {
    // Worker pour les gros diffs
    const { computeDiff: workerComputeDiff, isReady: workerReady } = useDiffWorker();
    const [workerResult, setWorkerResult] = useState<DiffResult | null>(null);
    const [isComputing, setIsComputing] = useState(false);

    // Déterminer si on utilise le worker
    const totalLength = originalContent.length + modifiedContent.length;
    const useWorker = (forceWorker || totalLength > WORKER_THRESHOLD) && workerReady;

    // Calcul synchrone pour les petits diffs
    const syncResult = useMemo(() => {
      if (useWorker) {
        return null;
      }

      const changes = diffLinesContent(originalContent, modifiedContent);

      return processDiffChangesToResult(changes);
    }, [originalContent, modifiedContent, useWorker]);

    // Calcul async via worker pour les gros diffs
    useEffect(() => {
      if (!useWorker) {
        setWorkerResult(null);
        return;
      }

      let cancelled = false;
      setIsComputing(true);

      workerComputeDiff(originalContent, modifiedContent)
        .then((result) => {
          if (!cancelled) {
            setWorkerResult(result);
            setIsComputing(false);
          }
        })
        .catch(() => {
          if (!cancelled) {
            // Fallback au calcul synchrone
            const changes = diffLinesContent(originalContent, modifiedContent);
            setWorkerResult(processDiffChangesToResult(changes));
            setIsComputing(false);
          }
        });

      return () => {
        cancelled = true;
      };
    }, [originalContent, modifiedContent, useWorker, workerComputeDiff]);

    // Utiliser le résultat approprié
    const result = useWorker ? workerResult : syncResult;
    const diffLinesData = result?.lines ?? [];
    const stats = result?.stats ?? { additions: 0, deletions: 0, unchanged: 0 };

    const hasChanges = stats.additions > 0 || stats.deletions > 0;

    return (
      <div className={classNames('flex flex-col h-full bg-bolt-elements-background-depth-1', className)}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 bg-bolt-elements-background-depth-2 border-b border-bolt-elements-borderColor">
          <div className="flex items-center gap-2">
            <div className="i-ph:git-diff text-lg text-bolt-elements-textSecondary" />
            <span className="text-sm font-medium text-bolt-elements-textPrimary">
              {fileName ? `Changements: ${fileName}` : 'Comparaison des changements'}
            </span>
          </div>
          {hasChanges ? (
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1 text-green-500">
                <div className="i-ph:plus-bold" />
                {stats.additions} ajout{stats.additions > 1 ? 's' : ''}
              </span>
              <span className="flex items-center gap-1 text-red-500">
                <div className="i-ph:minus-bold" />
                {stats.deletions} suppression{stats.deletions > 1 ? 's' : ''}
              </span>
            </div>
          ) : (
            <span className="text-xs text-bolt-elements-textTertiary">Aucun changement</span>
          )}
        </div>

        {/* Diff content */}
        <div className="flex-1 overflow-auto font-mono text-sm">
          {isComputing ? (
            <div className="flex items-center justify-center h-full text-bolt-elements-textTertiary">
              <div className="flex flex-col items-center gap-2">
                <div className="i-ph:spinner text-3xl animate-spin" />
                <span>Calcul des différences...</span>
              </div>
            </div>
          ) : !hasChanges ? (
            <div className="flex items-center justify-center h-full text-bolt-elements-textTertiary">
              <div className="flex flex-col items-center gap-2">
                <div className="i-ph:check-circle text-3xl text-green-500" />
                <span>Le fichier n'a pas été modifié</span>
              </div>
            </div>
          ) : (
            <table className="w-full border-collapse">
              <tbody>
                {diffLinesData.map((line, index) => (
                  <tr
                    key={index}
                    className={classNames(
                      'hover:brightness-95',
                      { 'bg-green-500/10': line.type === 'added' },
                      { 'bg-red-500/10': line.type === 'removed' },
                    )}
                  >
                    {/* Old line number */}
                    <td className="w-12 px-2 text-right text-bolt-elements-textTertiary select-none border-r border-bolt-elements-borderColor">
                      {line.oldLineNumber ?? ''}
                    </td>
                    {/* New line number */}
                    <td className="w-12 px-2 text-right text-bolt-elements-textTertiary select-none border-r border-bolt-elements-borderColor">
                      {line.newLineNumber ?? ''}
                    </td>
                    {/* Change indicator */}
                    <td
                      className={classNames(
                        'w-6 text-center select-none font-bold',
                        { 'text-green-500': line.type === 'added' },
                        { 'text-red-500': line.type === 'removed' },
                      )}
                    >
                      {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
                    </td>
                    {/* Content */}
                    <td
                      className={classNames(
                        'px-2 whitespace-pre',
                        { 'text-green-700 dark:text-green-400': line.type === 'added' },
                        { 'text-red-700 dark:text-red-400': line.type === 'removed' },
                        { 'text-bolt-elements-textPrimary': line.type === 'unchanged' },
                      )}
                    >
                      {line.content || '\u00A0'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    );
  },
);

DiffViewer.displayName = 'DiffViewer';

/**
 * Compute line-by-line diff between two strings
 */
function diffLinesContent(oldContent: string, newContent: string): Change[] {
  return diffLines(oldContent, newContent);
}

/**
 * Process diff changes into a DiffResult with lines and stats
 */
function processDiffChangesToResult(changes: Change[]): DiffResult {
  const lines: DiffLine[] = [];
  let oldLineNumber = 1;
  let newLineNumber = 1;
  let additions = 0;
  let deletions = 0;
  let unchanged = 0;

  for (const change of changes) {
    const contentLines = change.value.split('\n');

    // Remove last empty element if the string ends with newline
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
