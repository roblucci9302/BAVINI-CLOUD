'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '~/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-bolt-elements-borderColorActive focus:ring-offset-2',
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-bolt-elements-button-primary-background text-bolt-elements-button-primary-text shadow',
        secondary:
          'border-transparent bg-bolt-elements-button-secondary-background text-bolt-elements-button-secondary-text',
        destructive: 'border-transparent bg-bolt-elements-button-danger-background text-bolt-elements-button-danger-text shadow',
        outline: 'text-bolt-elements-textPrimary border-bolt-elements-borderColor',
        success: 'border-transparent bg-green-500/20 text-green-500',
        warning: 'border-transparent bg-orange-500/20 text-orange-500',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
