'use client';

import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { Check, Minus } from 'lucide-react';
import * as React from 'react';
import { cn } from '~/lib/utils';

const Checkbox = React.forwardRef<
  React.ComponentRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root> & {
    indeterminate?: boolean;
  }
>(({ className, indeterminate, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      'peer h-4 w-4 shrink-0 rounded-sm border border-bolt-elements-borderColor shadow',
      'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-bolt-elements-borderColorActive',
      'disabled:cursor-not-allowed disabled:opacity-50',
      'data-[state=checked]:bg-bolt-elements-button-primary-background data-[state=checked]:text-bolt-elements-button-primary-text data-[state=checked]:border-transparent',
      'data-[state=indeterminate]:bg-bolt-elements-button-primary-background data-[state=indeterminate]:text-bolt-elements-button-primary-text data-[state=indeterminate]:border-transparent',
      className,
    )}
    {...props}
    checked={indeterminate ? 'indeterminate' : props.checked}
  >
    <CheckboxPrimitive.Indicator className={cn('flex items-center justify-center text-current')}>
      {indeterminate ? <Minus className="h-3 w-3" /> : <Check className="h-3 w-3" />}
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));
Checkbox.displayName = CheckboxPrimitive.Root.displayName;

export { Checkbox };
