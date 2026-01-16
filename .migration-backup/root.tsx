import { useStore } from '@nanostores/react';
import type { LinksFunction } from '@remix-run/cloudflare';
import { Links, Meta, Outlet, Scripts, ScrollRestoration } from '@remix-run/react';
import tailwindReset from '@unocss/reset/tailwind-compat.css?url';
import { themeStore } from './lib/stores/theme';
import { stripIndents } from './utils/stripIndent';
import { createHead } from 'remix-island';
import { useEffect } from 'react';
import { ErrorBoundary } from '~/components/ui/ErrorBoundary';
import { createScopedLogger } from '~/utils/logger';

import globalStyles from './styles/index.scss?url';

const logger = createScopedLogger('Root');

import 'virtual:uno.css';

export const links: LinksFunction = () => [
  {
    rel: 'icon',
    href: '/favicon.svg',
    type: 'image/svg+xml',
  },

  // Preconnect to Google Fonts for faster font loading
  {
    rel: 'preconnect',
    href: 'https://fonts.googleapis.com',
  },
  {
    rel: 'preconnect',
    href: 'https://fonts.gstatic.com',
    crossOrigin: 'anonymous',
  },

  // DNS prefetch for API endpoints
  {
    rel: 'dns-prefetch',
    href: 'https://api.anthropic.com',
  },

  // Preload critical assets
  {
    rel: 'preload',
    href: '/assets/pyodide/pyodide.mjs',
    as: 'script',
    type: 'text/javascript',
  },

  // Google Fonts - Inter with display=swap for non-blocking rendering
  {
    rel: 'stylesheet',
    href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
  },
  { rel: 'stylesheet', href: tailwindReset },
  { rel: 'stylesheet', href: globalStyles },
];

const inlineThemeCode = stripIndents`
  setTutorialKitTheme();

  function setTutorialKitTheme() {
    let theme = localStorage.getItem('bolt_theme');

    if (!theme) {
      theme = 'dark';
    }

    document.querySelector('html')?.setAttribute('data-theme', theme);
  }
`;

export const Head = createHead(() => (
  <>
    <meta charSet="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <Meta />
    <Links />
    {/* safe: inlineThemeCode is a static constant defined in this file */}
    <script dangerouslySetInnerHTML={{ __html: inlineThemeCode }} />
  </>
));

export function Layout({ children }: { children: React.ReactNode }) {
  const theme = useStore(themeStore);

  useEffect(() => {
    document.querySelector('html')?.setAttribute('data-theme', theme);
  }, [theme]);

  return (
    <>
      <ErrorBoundary
        onError={(error, errorInfo) => {
          logger.error('Root error boundary caught error:', error);
          logger.error('Component stack:', errorInfo.componentStack);
        }}
      >
        {children}
      </ErrorBoundary>
      <ScrollRestoration />
      <Scripts />
    </>
  );
}

export default function App() {
  return <Outlet />;
}
