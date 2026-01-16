import { lazy, Suspense, memo } from 'react';
import type { Theme } from '~/types/theme';
import type { EditorDocument, EditorSettings, OnChangeCallback, OnScrollCallback, OnSaveCallback } from './types';

// Re-export types for consumers
export type {
  EditorDocument,
  EditorSettings,
  EditorUpdate,
  ScrollPosition,
  OnChangeCallback,
  OnScrollCallback,
  OnSaveCallback,
} from './types';

// Lazy load the heavy CodeMirror editor
const LazyCodeMirrorEditor = lazy(() => import('./CodeMirrorEditor').then((m) => ({ default: m.CodeMirrorEditor })));

interface CodeMirrorEditorProps {
  theme: Theme;
  id?: unknown;
  doc?: EditorDocument;
  editable?: boolean;
  debounceChange?: number;
  debounceScroll?: number;
  autoFocusOnDocumentChange?: boolean;
  onChange?: OnChangeCallback;
  onScroll?: OnScrollCallback;
  onSave?: OnSaveCallback;
  className?: string;
  settings?: EditorSettings;
}

/**
 * Editor skeleton shown while CodeMirror is loading
 */
function EditorSkeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`relative h-full ${className}`}>
      <div className="h-full overflow-hidden bg-bolt-elements-background-depth-1 animate-pulse">
        <div className="flex flex-col gap-2 p-4">
          {/* Line numbers column simulation */}
          <div className="flex gap-4">
            <div className="w-8 h-4 bg-bolt-elements-background-depth-3 rounded" />
            <div className="flex-1 h-4 bg-bolt-elements-background-depth-2 rounded" />
          </div>
          <div className="flex gap-4">
            <div className="w-8 h-4 bg-bolt-elements-background-depth-3 rounded" />
            <div className="w-3/4 h-4 bg-bolt-elements-background-depth-2 rounded" />
          </div>
          <div className="flex gap-4">
            <div className="w-8 h-4 bg-bolt-elements-background-depth-3 rounded" />
            <div className="w-1/2 h-4 bg-bolt-elements-background-depth-2 rounded" />
          </div>
          <div className="flex gap-4">
            <div className="w-8 h-4 bg-bolt-elements-background-depth-3 rounded" />
            <div className="w-5/6 h-4 bg-bolt-elements-background-depth-2 rounded" />
          </div>
          <div className="flex gap-4">
            <div className="w-8 h-4 bg-bolt-elements-background-depth-3 rounded" />
            <div className="w-2/3 h-4 bg-bolt-elements-background-depth-2 rounded" />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Lazy-loaded CodeMirror Editor wrapper
 * Reduces initial bundle size by ~180KB (gzipped)
 */
export const CodeMirrorEditor = memo((props: CodeMirrorEditorProps) => {
  return (
    <Suspense fallback={<EditorSkeleton className={props.className} />}>
      <LazyCodeMirrorEditor {...props} />
    </Suspense>
  );
});

CodeMirrorEditor.displayName = 'CodeMirrorEditor';
