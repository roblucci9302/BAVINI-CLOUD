'use client';

import { memo } from 'react';
import { classNames } from '~/utils/classNames';

export interface PanelHeaderButtonProps {
  className?: string;
  disabledClassName?: string;
  disabled?: boolean;
  children: string | JSX.Element | Array<JSX.Element | string>;
  onClick?: (event: React.MouseEvent<HTMLButtonElement, MouseEvent>) => void;
}

export const PanelHeaderButton = memo(
  ({ className, disabledClassName, disabled = false, children, onClick }: PanelHeaderButtonProps) => {
    return (
      <button
        className={classNames(
          'flex items-center shrink-0 gap-1.5 px-3 py-1.5 rounded-[var(--bolt-radius-sm,8px)] text-bolt-elements-textSecondary text-xs bg-transparent border border-transparent',
          'transition-all duration-150 ease-out',
          'enabled:hover:text-bolt-elements-textPrimary enabled:hover:bg-[var(--bolt-bg-hover,#1a1a1e)] enabled:hover:border-bolt-elements-borderColor',
          'disabled:cursor-not-allowed',
          {
            [classNames('opacity-30', disabledClassName)]: disabled,
          },
          className,
        )}
        disabled={disabled}
        onClick={(event) => {
          if (disabled) {
            return;
          }

          onClick?.(event);
        }}
      >
        {children}
      </button>
    );
  },
);
