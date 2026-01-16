'use client';

import { memo } from 'react';
import { classNames } from '~/utils/classNames';

export interface SpinnerProps {
  /** Additional CSS classes */
  className?: string;

  /** Size preset (default: 'md') */
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';

  /** Accessible label for screen readers */
  label?: string;
}

const sizeClasses: Record<NonNullable<SpinnerProps['size']>, string> = {
  xs: 'h-3 w-3',
  sm: 'h-4 w-4',
  md: 'h-5 w-5',
  lg: 'h-6 w-6',
  xl: 'h-8 w-8',
};

/**
 * Animated loading spinner component.
 *
 * Uses SVG with CSS animation for smooth performance.
 * Supports multiple sizes and custom styling.
 *
 * @example
 * <Spinner />
 * <Spinner size="lg" className="text-accent-500" />
 * <Spinner size="sm" label="Loading..." />
 */
export const Spinner = memo(({ className, size = 'md', label = 'Chargement...' }: SpinnerProps) => (
  <svg
    className={classNames('animate-spin', sizeClasses[size], className)}
    viewBox="0 0 24 24"
    role="status"
    aria-label={label}
  >
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
    />
  </svg>
));

Spinner.displayName = 'Spinner';

export default Spinner;
