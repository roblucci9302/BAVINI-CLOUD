/**
 * Route index - Interface Chat principale
 * Le produit EST la landing page
 */

import { json } from '@remix-run/cloudflare';
import type { MetaFunction } from '@remix-run/react';
import { lazy, Suspense, useState, useEffect } from 'react';
import { ClientOnly } from 'remix-utils/client-only';
import { BaseChat } from '~/components/chat/BaseChat';
import { Chat } from '~/components/chat/Chat.client';
import { Header } from '~/components/header/Header';
import { SkipLink } from '~/components/ui/SkipLink';
import { ErrorBoundary, MinimalErrorFallback } from '~/components/ui/ErrorBoundary';
// DISABLED: Auth system temporarily disabled for development
// import { initAuth } from '~/lib/stores/auth';

// Lazy load AgentSystemProvider - only load when needed
const AgentSystemProvider = lazy(() =>
  import('~/lib/agents/react').then((mod) => ({ default: mod.AgentSystemProvider })),
);

export const meta: MetaFunction = () => {
  return [
    { title: 'BAVINI - Créez des applications web avec l\'IA' },
    { name: 'description', content: 'Décrivez ce que vous voulez créer. BAVINI génère le code, vous montre un aperçu en temps réel, et vous permet d\'itérer instantanément.' },
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

// DISABLED: Auth system temporarily disabled for development
// Initialize auth on client side
// function AuthInitializer({ children }: { children: React.ReactNode }) {
//   useEffect(() => {
//     initAuth();
//   }, []);
//
//   return <>{children}</>;
// }

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
            // DISABLED: AuthInitializer temporarily disabled for development
            // <AuthInitializer>
              <DeferredAgentProvider>
                <Chat />
              </DeferredAgentProvider>
            // </AuthInitializer>
          )}
        </ClientOnly>
      </main>
    </div>
  );
}
