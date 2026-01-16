import { lazy, Suspense, memo } from 'react';
import { classNames } from '~/utils/classNames';
import type { SupportedTheme } from '~/lib/shiki';

export interface CodeBlockProps {
  className?: string;
  code: string;
  language?: string;
  theme?: SupportedTheme;
  disableCopy?: boolean;
}

// Lazy load the heavy Shiki-powered component
const LazyCodeBlock = lazy(() => import('./CodeBlock').then((m) => ({ default: m.CodeBlock })));

/**
 * Skeleton placeholder shown while Shiki is loading
 */
function CodeBlockSkeleton({ className, code }: { className?: string; code: string }) {
  // Count lines for proper skeleton height
  const lineCount = Math.min(code.split('\n').length, 20);

  return (
    <div className={classNames('relative group text-left', className)}>
      <div className="bg-bolt-elements-background-depth-2 rounded-lg p-4 animate-pulse">
        <div className="space-y-2">
          {Array.from({ length: lineCount }, (_, i) => (
            <div
              key={i}
              className="h-4 bg-bolt-elements-background-depth-3 rounded"
              style={{
                width: `${Math.max(30, Math.min(95, 50 + Math.random() * 45))}%`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Lazy-loaded CodeBlock wrapper
 * Reduces initial bundle size by deferring Shiki load
 * Uses optimized highlighter with only essential languages (~200KB vs 2.5MB)
 */
export const LazyCodeBlockWrapper = memo((props: CodeBlockProps) => {
  return (
    <Suspense fallback={<CodeBlockSkeleton className={props.className} code={props.code} />}>
      <LazyCodeBlock {...props} />
    </Suspense>
  );
});

LazyCodeBlockWrapper.displayName = 'LazyCodeBlock';

// Also export named for compatibility
export { LazyCodeBlockWrapper as CodeBlock };
