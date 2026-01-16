import { memo, type ComponentType } from 'react';

// Generic memo wrapper that preserves type information
export function genericMemo<P extends object>(
  component: ComponentType<P>,
  propsAreEqual?: (prevProps: Readonly<P>, nextProps: Readonly<P>) => boolean,
): ComponentType<P> & { displayName?: string } {
  return memo(component, propsAreEqual) as ComponentType<P> & { displayName?: string };
}
