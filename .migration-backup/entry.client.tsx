import { RemixBrowser } from '@remix-run/react';
import { startTransition } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { initPreloading, registerServiceWorker } from '~/lib/performance';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('Client');

// Global handler pour les Promise rejections non gérées
window.addEventListener('unhandledrejection', (event) => {
  logger.error('Unhandled Promise Rejection:', event.reason);

  // En dev, on laisse l'erreur remonter pour le debugging
  if (import.meta.env.DEV) {
    console.error('[Unhandled Rejection]', event.reason);
  } else {
    // En prod, on prévient le crash mais on log
    event.preventDefault();
  }
});

// Global handler pour les erreurs non capturées
window.addEventListener('error', (event) => {
  logger.error('Uncaught Error:', event.error);

  if (!import.meta.env.DEV) {
    // En prod, on pourrait envoyer à un service de monitoring
    event.preventDefault();
  }
});

startTransition(() => {
  hydrateRoot(document.getElementById('root')!, <RemixBrowser />);
});

// Initialize performance optimizations after hydration
if (typeof window !== 'undefined') {
  // Wait for hydration to complete before starting optimizations
  requestAnimationFrame(() => {
    // Strategic module preloading during idle time
    initPreloading();

    // Register service worker for asset caching (production only)
    registerServiceWorker();
  });
}
