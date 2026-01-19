'use client';

import * as React from 'react';
import { cn } from '~/lib/utils';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  /**
   * Error state styling
   */
  error?: boolean;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, error, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        // Base styles
        'flex min-h-[60px] w-full rounded-md border px-3 py-2 text-sm shadow-sm transition-colors',
        // Colors
        'bg-transparent text-bolt-elements-textPrimary placeholder:text-bolt-elements-textTertiary',
        // Border
        error ? 'border-red-500' : 'border-bolt-elements-borderColor',
        // Focus state
        'focus-visible:outline-none focus-visible:ring-1',
        error ? 'focus-visible:ring-red-500' : 'focus-visible:ring-bolt-elements-borderColorActive',
        // Disabled state
        'disabled:cursor-not-allowed disabled:opacity-50',
        // Resize
        'resize-none',
        className,
      )}
      ref={ref}
      {...props}
    />
  );
});
Textarea.displayName = 'Textarea';

export { Textarea };
