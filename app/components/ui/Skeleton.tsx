import { memo, type HTMLAttributes } from 'react';
import { classNames } from '~/utils/classNames';
import styles from './Skeleton.module.scss';

type SkeletonVariant = 'text' | 'rectangular' | 'circular' | 'button';

interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  /**
   * The variant of the skeleton
   * - text: For text content (rounded corners, inline)
   * - rectangular: For images/cards (rounded-lg)
   * - circular: For avatars (fully rounded)
   * - button: For button placeholders
   */
  variant?: SkeletonVariant;

  /**
   * Width of the skeleton (CSS value or number for px)
   */
  width?: string | number;

  /**
   * Height of the skeleton (CSS value or number for px)
   */
  height?: string | number;

  /**
   * Number of skeleton lines to render (for text variant)
   */
  lines?: number;
}

export const Skeleton = memo(
  ({ variant = 'text', width, height, lines = 1, className, style, ...props }: SkeletonProps) => {
    const computedWidth = typeof width === 'number' ? `${width}px` : width;
    const computedHeight = typeof height === 'number' ? `${height}px` : height;

    // For multiple lines, render multiple skeletons
    if (variant === 'text' && lines > 1) {
      return (
        <div className={classNames(styles.skeletonGroup, className)} {...props}>
          {Array.from({ length: lines }).map((_, index) => (
            <div
              key={index}
              className={classNames(styles.skeleton, styles.text)}
              style={{
                width: index === lines - 1 ? '75%' : '100%', // Last line shorter
                height: computedHeight || '1em',
                ...style,
              }}
            />
          ))}
        </div>
      );
    }

    return (
      <div
        className={classNames(styles.skeleton, styles[variant], className)}
        style={{
          width: computedWidth || (variant === 'circular' ? '40px' : '100%'),
          height: computedHeight || (variant === 'text' ? '1em' : variant === 'circular' ? '40px' : undefined),
          ...style,
        }}
        role="status"
        aria-label="Chargement..."
        {...props}
      />
    );
  },
);

Skeleton.displayName = 'Skeleton';

/**
 * Pre-configured skeleton for message content
 */
export const MessageSkeleton = memo(() => (
  <div className="flex gap-4 p-6 w-full">
    <Skeleton variant="circular" width={34} height={34} />
    <div className="flex-1 space-y-3">
      <Skeleton variant="text" width="30%" height={14} />
      <Skeleton variant="text" lines={3} height={14} />
    </div>
  </div>
));

MessageSkeleton.displayName = 'MessageSkeleton';

/**
 * Pre-configured skeleton for file tree items
 */
export const FileTreeSkeleton = memo(({ count = 5 }: { count?: number }) => (
  <div className="space-y-1 p-2">
    {Array.from({ length: count }).map((_, index) => (
      <div key={index} className="flex items-center gap-2 py-1" style={{ paddingLeft: `${8 + (index % 3) * 8}px` }}>
        <Skeleton variant="rectangular" width={16} height={16} />
        <Skeleton variant="text" width={`${60 + Math.random() * 30}%`} height={14} />
      </div>
    ))}
  </div>
));

FileTreeSkeleton.displayName = 'FileTreeSkeleton';

/**
 * Pre-configured skeleton for code editor
 */
export const EditorSkeleton = memo(() => (
  <div className="p-4 space-y-2">
    {Array.from({ length: 12 }).map((_, index) => (
      <div key={index} className="flex items-center gap-3">
        <Skeleton variant="text" width={24} height={14} className="opacity-50" />
        <Skeleton
          variant="text"
          width={`${20 + Math.random() * 60}%`}
          height={14}
          style={{ marginLeft: `${(index % 4) * 16}px` }}
        />
      </div>
    ))}
  </div>
));

EditorSkeleton.displayName = 'EditorSkeleton';
