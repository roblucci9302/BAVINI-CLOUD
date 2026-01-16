import { json } from '@remix-run/cloudflare';
import type { MetaFunction } from '@remix-run/react';
import { lazy, Suspense, useState, useEffect } from 'react';
import { ClientOnly } from 'remix-utils/client-only';
import { BaseChat } from '~/components/chat/BaseChat';
import { Chat } from '~/components/chat/Chat.client';
import { Header } from '~/components/header/Header';
import { SkipLink } from '~/components/ui/SkipLink';
import { ErrorBoundary, MinimalErrorFallback } from '~/components/ui/ErrorBoundary';

// Lazy load AgentSystemProvider - only load when needed
const AgentSystemProvider = lazy(() =>
  import('~/lib/agents/react').then((mod) => ({ default: mod.AgentSystemProvider })),
);

export const meta: MetaFunction = () => {
  return [
    { title: 'BAVINI' },
    { name: 'description', content: 'Discutez avec BAVINI, votre assistant IA de développement web' },
  ];
};

export const loader = () => json({});

// Wrapper that defers AgentSystemProvider loading
function DeferredAgentProvider({ children }: { children: React.ReactNode }) {
  const [shouldLoad, setShouldLoad] = useState(false);

  useEffect(() => {
    // Defer loading until after first paint
    const timer = requestAnimationFrame(() => {
      setShouldLoad(true);
    });
    return () => cancelAnimationFrame(timer);
  }, []);

  if (!shouldLoad) {
    return <>{children}</>;
  }

  return (
    <Suspense fallback={<>{children}</>}>
      <AgentSystemProvider initialControlMode="strict">{children}</AgentSystemProvider>
    </Suspense>
  );
}

export default function Index() {
  return (
    <div className="flex flex-col h-full w-full">
      <SkipLink targetId="main-content">Aller au contenu principal</SkipLink>
      <ErrorBoundary fallback={<MinimalErrorFallback />}>
        <Header />
      </ErrorBoundary>
      <main id="main-content" tabIndex={-1} className="flex-1 overflow-hidden">
        <ClientOnly fallback={<BaseChat />}>
          {() => (
            <DeferredAgentProvider>
              <Chat />
            </DeferredAgentProvider>
          )}
        </ClientOnly>
      </main>
    </div>
  );
}
