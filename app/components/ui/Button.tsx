import { forwardRef, memo, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { classNames } from '~/utils/classNames';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline';
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg' | 'icon';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * Visual variant of the button
   * - primary: Main action button (accent color)
   * - secondary: Secondary action (subtle)
   * - danger: Destructive action (red)
   * - ghost: Transparent background
   * - outline: Bordered button
   */
  variant?: ButtonVariant;

  /**
   * Size of the button
   */
  size?: ButtonSize;

  /**
   * Show loading spinner and disable button
   */
  isLoading?: boolean;

  /**
   * Icon to show on the left side
   */
  leftIcon?: ReactNode;

  /**
   * Icon to show on the right side
   */
  rightIcon?: ReactNode;

  /**
   * Icon class (for icon-only buttons using UnoCSS icons)
   */
  icon?: string;

  /**
   * Full width button
   */
  fullWidth?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: [
    'bg-bolt-elements-button-primary-background',
    'text-bolt-elements-button-primary-text',
    'hover:bg-bolt-elements-button-primary-backgroundHover',
    'border-transparent',
  ].join(' '),
  secondary: [
    'bg-bolt-elements-button-secondary-background',
    'text-bolt-elements-button-secondary-text',
    'hover:bg-bolt-elements-button-secondary-backgroundHover',
    'border-transparent',
  ].join(' '),
  danger: [
    'bg-bolt-elements-button-danger-background',
    'text-bolt-elements-button-danger-text',
    'hover:bg-bolt-elements-button-danger-backgroundHover',
    'border-transparent',
  ].join(' '),
  ghost: [
    'bg-transparent',
    'text-bolt-elements-textPrimary',
    'hover:bg-bolt-elements-item-backgroundActive',
    'border-transparent',
  ].join(' '),
  outline: [
    'bg-transparent',
    'text-bolt-elements-textPrimary',
    'hover:bg-bolt-elements-item-backgroundActive',
    'border-bolt-elements-borderColor',
  ].join(' '),
};

const sizeClasses: Record<ButtonSize, string> = {
  xs: 'h-6 px-2 text-xs gap-1 rounded',
  sm: 'h-8 px-3 text-xs gap-1.5 rounded-md',
  md: 'h-9 px-4 text-sm gap-1.5 rounded-md',
  lg: 'h-11 px-6 text-base gap-2 rounded-lg',
  icon: 'h-9 w-9 p-0 rounded-md',
};

const iconSizeClasses: Record<ButtonSize, string> = {
  xs: 'text-xs',
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-lg',
  icon: 'text-xl',
};

export const Button = memo(
  forwardRef<HTMLButtonElement, ButtonProps>(
    (
      {
        variant = 'primary',
        size = 'md',
        isLoading = false,
        leftIcon,
        rightIcon,
        icon,
        fullWidth = false,
        className,
        children,
        disabled,
        type = 'button',
        ...props
      },
      ref,
    ) => {
      const isDisabled = disabled || isLoading;
      const isIconOnly = size === 'icon' || (icon && !children);

      return (
        <button
          ref={ref}
          type={type}
          className={classNames(
            // Base styles
            'inline-flex items-center justify-center font-medium border',
            'transition-all duration-150 ease-out',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-bolt-elements-borderColorActive focus-visible:ring-offset-1',
            'disabled:opacity-50 disabled:cursor-not-allowed',

            // Press feedback animation
            'active:scale-[0.97] active:transition-transform active:duration-75',

            // Variant styles
            variantClasses[variant],

            // Size styles
            sizeClasses[size],

            // Full width
            { 'w-full': fullWidth },

            // Custom classes
            className,
          )}
          disabled={isDisabled}
          aria-busy={isLoading}
          {...props}
        >
          {/* Loading spinner */}
          {isLoading && (
            <div
              className={classNames('i-svg-spinners:90-ring-with-bg shrink-0', iconSizeClasses[size])}
              aria-hidden="true"
            />
          )}

          {/* Left icon */}
          {!isLoading && leftIcon && (
            <span className={classNames('shrink-0', iconSizeClasses[size])} aria-hidden="true">
              {leftIcon}
            </span>
          )}

          {/* Icon for icon-only buttons */}
          {!isLoading && icon && isIconOnly && (
            <div className={classNames(icon, iconSizeClasses[size])} aria-hidden="true" />
          )}

          {/* Children / Label */}
          {!isLoading && children && <span className={isIconOnly ? 'sr-only' : undefined}>{children}</span>}

          {/* Right icon */}
          {!isLoading && rightIcon && (
            <span className={classNames('shrink-0', iconSizeClasses[size])} aria-hidden="true">
              {rightIcon}
            </span>
          )}
        </button>
      );
    },
  ),
);

Button.displayName = 'Button';

/**
 * Icon-only button variant for common use cases
 */
export interface IconButtonNewProps extends Omit<ButtonProps, 'leftIcon' | 'rightIcon' | 'children'> {
  icon: string;
  'aria-label': string;
}

export const IconButtonNew = memo(
  forwardRef<HTMLButtonElement, IconButtonNewProps>(({ icon, size = 'icon', variant = 'ghost', ...props }, ref) => {
    return <Button ref={ref} size={size} variant={variant} icon={icon} {...props} />;
  }),
);

IconButtonNew.displayName = 'IconButtonNew';

/**
 * Button group for related actions
 */
interface ButtonGroupProps {
  children: ReactNode;
  className?: string;
}

export const ButtonGroup = memo(({ children, className }: ButtonGroupProps) => {
  return (
    <div
      className={classNames(
        'inline-flex rounded-md shadow-sm',
        '[&>button]:rounded-none',
        '[&>button:first-child]:rounded-l-md',
        '[&>button:last-child]:rounded-r-md',
        '[&>button:not(:first-child)]:-ml-px',
        className,
      )}
      role="group"
    >
      {children}
    </div>
  );
});

ButtonGroup.displayName = 'ButtonGroup';
