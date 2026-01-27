import { memo, type ComponentType, type MemoExoticComponent } from 'react';

// Generic memo wrapper that preserves type information
export function genericMemo<P extends object>(
  component: ComponentType<P>,
  propsAreEqual?: (prevProps: Readonly<P>, nextProps: Readonly<P>) => boolean,
): MemoExoticComponent<ComponentType<P>> & { displayName?: string } {
  const memoized = memo(component, propsAreEqual);
  return memoized as MemoExoticComponent<ComponentType<P>> & { displayName?: string };
}
