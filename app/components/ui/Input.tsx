'use client';

import * as React from 'react';
import { cn } from '~/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /**
   * Error state styling
   */
  error?: boolean;
  /**
   * Left icon (UnoCSS icon class or ReactNode)
   */
  leftIcon?: string | React.ReactNode;
  /**
   * Right icon (UnoCSS icon class or ReactNode)
   */
  rightIcon?: string | React.ReactNode;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, error, leftIcon, rightIcon, ...props }, ref) => {
    const hasLeftIcon = !!leftIcon;
    const hasRightIcon = !!rightIcon;

    const renderIcon = (icon: string | React.ReactNode, position: 'left' | 'right') => {
      if (typeof icon === 'string') {
        return (
          <div
            className={cn(
              'absolute top-1/2 -translate-y-1/2 text-bolt-elements-textTertiary',
              position === 'left' ? 'left-3' : 'right-3',
              icon,
            )}
            aria-hidden="true"
          />
        );
      }

      return (
        <div
          className={cn(
            'absolute top-1/2 -translate-y-1/2 text-bolt-elements-textTertiary',
            position === 'left' ? 'left-3' : 'right-3',
          )}
          aria-hidden="true"
        >
          {icon}
        </div>
      );
    };

    const inputElement = (
      <input
        type={type}
        className={cn(
          // Base styles
          'flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-sm transition-colors',
          // Colors
          'text-bolt-elements-textPrimary placeholder:text-bolt-elements-textTertiary',
          // Border
          error ? 'border-red-500' : 'border-bolt-elements-borderColor',
          // Focus state
          'focus-visible:outline-none focus-visible:ring-1',
          error ? 'focus-visible:ring-red-500' : 'focus-visible:ring-bolt-elements-borderColorActive',
          // Disabled state
          'disabled:cursor-not-allowed disabled:opacity-50',
          // File input
          'file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-bolt-elements-textPrimary',
          // Icons padding
          hasLeftIcon && 'pl-10',
          hasRightIcon && 'pr-10',
          className,
        )}
        ref={ref}
        {...props}
      />
    );

    if (hasLeftIcon || hasRightIcon) {
      return (
        <div className="relative w-full">
          {hasLeftIcon && renderIcon(leftIcon!, 'left')}
          {inputElement}
          {hasRightIcon && renderIcon(rightIcon!, 'right')}
        </div>
      );
    }

    return inputElement;
  },
);
Input.displayName = 'Input';

export { Input };
