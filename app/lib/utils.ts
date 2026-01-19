import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Utility function for conditionally joining classNames together.
 * Uses clsx for conditional classes and tailwind-merge for deduplication.
 *
 * @example
 * cn('px-2 py-1', 'bg-red-500', { 'opacity-50': disabled })
 * cn('text-sm', className) // merge with incoming className prop
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
