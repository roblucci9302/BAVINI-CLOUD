/**
 * =============================================================================
 * BAVINI CLOUD - Lazy Animate Hook
 * =============================================================================
 * Provides lazy loading of framer-motion to avoid initial bundle size.
 *
 * @module lib/hooks/useLazyAnimate
 * =============================================================================
 */

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Animation function type
 */
export type AnimateFunction = (
  selector: string,
  keyframes: Record<string, unknown>,
  options?: Record<string, unknown>,
) => Promise<void>;

/**
 * Animation scope type (ref to scoped element)
 */
export type AnimationScope = React.RefObject<HTMLDivElement>;

/**
 * Hook for lazy loading framer-motion animations.
 * Loads framer-motion only when needed to reduce initial bundle size.
 *
 * @returns A tuple of [scopeRef, animateFunction]
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const [animationScope, animate] = useLazyAnimate();
 *
 *   const runAnimation = async () => {
 *     await animate('#element', { opacity: 0 }, { duration: 0.3 });
 *   };
 *
 *   return (
 *     <div ref={animationScope}>
 *       <div id="element">Content</div>
 *     </div>
 *   );
 * }
 * ```
 */
export function useLazyAnimate(): [AnimationScope, AnimateFunction] {
  const scopeRef = useRef<HTMLDivElement>(null);
  const animateFnRef = useRef<AnimateFunction | null>(null);
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    import('framer-motion').then((mod) => {
      // Store the animate function for later use
      const { animate } = mod;

      animateFnRef.current = async (
        selector: string,
        keyframes: Record<string, unknown>,
        options?: Record<string, unknown>,
      ) => {
        if (scopeRef.current) {
          const element = scopeRef.current.querySelector(selector);

          if (element) {
            await animate(element, keyframes, options);
          }
        }
      };
      forceUpdate((n) => n + 1);
    });
  }, []);

  const animateFn: AnimateFunction = useCallback(async (selector, keyframes, options) => {
    if (animateFnRef.current) {
      await animateFnRef.current(selector, keyframes, options);
    }
  }, []);

  return [scopeRef, animateFn];
}
