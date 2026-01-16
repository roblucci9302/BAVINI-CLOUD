import { lazy, Suspense, memo } from 'react';
import type { AgentChatIntegrationProps } from './AgentChatIntegration';

/**
 * Lazy load the AgentChatIntegration component.
 * This component imports framer-motion and multiple stores,
 * so deferring its load improves initial bundle size.
 */
const LazyAgentChatIntegration = lazy(() =>
  import('./AgentChatIntegration').then((m) => ({ default: m.AgentChatIntegration })),
);

/**
 * Minimal skeleton shown while loading.
 * Invisible to avoid layout shift since the component is positioned absolutely.
 */
function AgentIntegrationSkeleton() {
  return null;
}

/**
 * Lazy-loaded AgentChatIntegration wrapper.
 * Reduces initial bundle size by deferring load of framer-motion and agent stores.
 */
export const LazyAgentChatIntegrationWrapper = memo((props: AgentChatIntegrationProps) => {
  return (
    <Suspense fallback={<AgentIntegrationSkeleton />}>
      <LazyAgentChatIntegration {...props} />
    </Suspense>
  );
});

LazyAgentChatIntegrationWrapper.displayName = 'LazyAgentChatIntegration';

export { LazyAgentChatIntegrationWrapper as AgentChatIntegration };
