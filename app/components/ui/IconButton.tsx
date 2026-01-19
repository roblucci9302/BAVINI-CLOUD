'use client';

import { memo } from 'react';
import { classNames } from '~/utils/classNames';

type IconSize = 'sm' | 'md' | 'lg' | 'xl' | 'xxl';

interface BaseIconButtonProps {
  size?: IconSize;
  className?: string;
  iconClassName?: string;
  disabledClassName?: string;
  title?: string;

  /** Label accessible pour les lecteurs d'écran. Fallback sur title si non spécifié. */
  'aria-label'?: string;
  disabled?: boolean;
  onClick?: (event: React.MouseEvent<HTMLButtonElement, MouseEvent>) => void;
}

type IconButtonWithoutChildrenProps = {
  icon: string;
  children?: undefined;
} & BaseIconButtonProps;

type IconButtonWithChildrenProps = {
  icon?: undefined;
  children: string | JSX.Element | JSX.Element[];
} & BaseIconButtonProps;

export type IconButtonProps = IconButtonWithoutChildrenProps | IconButtonWithChildrenProps;

export const IconButton = memo(
  ({
    icon,
    size = 'xl',
    className,
    iconClassName,
    disabledClassName,
    disabled = false,
    title,
    'aria-label': ariaLabel,
    onClick,
    children,
  }: IconButtonProps) => {
    return (
      <button
        className={classNames(
          'flex items-center justify-center text-bolt-elements-textSecondary',
          'w-[30px] h-[30px] rounded-[8px]',
          'bg-transparent border-none',
          'transition-all duration-150 ease-out',
          'enabled:hover:text-bolt-elements-textPrimary enabled:hover:bg-[var(--bolt-bg-hover,#1a1a1e)]',
          'disabled:cursor-not-allowed',
          {
            [classNames('opacity-30', disabledClassName)]: disabled,
          },
          className,
        )}
        title={title}
        aria-label={ariaLabel || title}
        disabled={disabled}
        onClick={(event) => {
          if (disabled) {
            return;
          }

          onClick?.(event);
        }}
      >
        {children ? children : <span className={classNames(icon, getIconSize(size), iconClassName)} />}
      </button>
    );
  },
);

/**
 * Maps icon button size to corresponding Tailwind text size class.
 * Sizes match the mockup: 16px default (base), with smaller/larger options.
 * @param size - The icon size variant
 * @returns Tailwind CSS class for the text size
 */
function getIconSize(size: IconSize): string {
  const sizeMap: Record<IconSize, string> = {
    sm: 'text-xs', // 12px
    md: 'text-sm', // 14px
    lg: 'text-base', // 16px - mockup default
    xl: 'text-lg', // 18px
    xxl: 'text-xl', // 20px
  };
  return sizeMap[size];
}
