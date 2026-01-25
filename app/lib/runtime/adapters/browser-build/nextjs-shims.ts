/**
 * =============================================================================
 * BAVINI CLOUD - Next.js Browser Shims
 * =============================================================================
 * Browser-compatible implementations of Next.js-specific modules.
 * These shims allow Next.js code to run in the browser without a Node.js server.
 *
 * Features:
 * - Hash-based routing (works in Blob URLs)
 * - Font loader emulation
 * - Image/Link component replacements
 * - Navigation hooks
 * =============================================================================
 */

/**
 * Next.js shims for browser-only builds.
 * Keys are Next.js import paths, values are the shim code.
 */
export const NEXTJS_SHIMS: Record<string, string> = {
  'next/font/google': `
    // Browser shim for next/font/google - Dynamic font generator
    // Converts font name to CSS-friendly format (e.g., Space_Grotesk -> "Space Grotesk")
    function createFontLoader(fontName) {
      const cssName = fontName.replace(/_/g, ' ');
      const varName = fontName.toLowerCase().replace(/_/g, '-');
      return function(options) {
        return {
          className: 'font-' + varName,
          variable: options?.variable || '--font-' + varName,
          style: { fontFamily: '"' + cssName + '", system-ui, sans-serif' }
        };
      };
    }

    // Export common fonts explicitly for direct imports
    export const Inter = createFontLoader('Inter');
    export const Roboto = createFontLoader('Roboto');
    export const Open_Sans = createFontLoader('Open_Sans');
    export const Poppins = createFontLoader('Poppins');
    export const Space_Grotesk = createFontLoader('Space_Grotesk');
    export const Playfair_Display = createFontLoader('Playfair_Display');
    export const Montserrat = createFontLoader('Montserrat');
    export const Lato = createFontLoader('Lato');
    export const Oswald = createFontLoader('Oswald');
    export const Raleway = createFontLoader('Raleway');
    export const Nunito = createFontLoader('Nunito');
    export const Source_Sans_3 = createFontLoader('Source_Sans_3');
    export const Work_Sans = createFontLoader('Work_Sans');
    export const DM_Sans = createFontLoader('DM_Sans');
    export const Manrope = createFontLoader('Manrope');
    export const Outfit = createFontLoader('Outfit');
    export const Plus_Jakarta_Sans = createFontLoader('Plus_Jakarta_Sans');
    export const Sora = createFontLoader('Sora');
    export const Fira_Code = createFontLoader('Fira_Code');
    export const JetBrains_Mono = createFontLoader('JetBrains_Mono');

    // Additional display/accent fonts
    export const Antonio = createFontLoader('Antonio');
    export const Archivo = createFontLoader('Archivo');
    export const Archivo_Black = createFontLoader('Archivo_Black');
    export const Bebas_Neue = createFontLoader('Bebas_Neue');
    export const IBM_Plex_Sans = createFontLoader('IBM_Plex_Sans');
    export const IBM_Plex_Mono = createFontLoader('IBM_Plex_Mono');
    export const Nunito_Sans = createFontLoader('Nunito_Sans');
    export const Cabin = createFontLoader('Cabin');
    export const Karla = createFontLoader('Karla');
    export const Lexend = createFontLoader('Lexend');
    export const Figtree = createFontLoader('Figtree');
    export const Geist = createFontLoader('Geist');
    export const Geist_Mono = createFontLoader('Geist_Mono');

    // 2025 Trendy fonts
    export const Syne = createFontLoader('Syne');
    export const Space_Mono = createFontLoader('Space_Mono');
    export const Instrument_Sans = createFontLoader('Instrument_Sans');
    export const Bricolage_Grotesque = createFontLoader('Bricolage_Grotesque');
    export const Darker_Grotesque = createFontLoader('Darker_Grotesque');
    export const Unbounded = createFontLoader('Unbounded');
    export const Onest = createFontLoader('Onest');
    export const General_Sans = createFontLoader('General_Sans');
    export const Clash_Display = createFontLoader('Clash_Display');
    export const Cabinet_Grotesk = createFontLoader('Cabinet_Grotesk');

    // Default export for dynamic imports
    export default createFontLoader;
  `,

  'next/image': `
    // Browser shim for next/image
    import React from 'react';

    function Image({ src, alt, width, height, fill, className, style, priority, ...props }) {
      const imgStyle = fill
        ? { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: style?.objectFit || 'cover', ...style }
        : { width, height, ...style };

      return React.createElement('img', {
        src: typeof src === 'object' ? src.src : src,
        alt: alt || '',
        className,
        style: imgStyle,
        loading: priority ? 'eager' : 'lazy',
        ...props
      });
    }

    export default Image;
  `,

  'next/link': `
    // Browser shim for next/link - Uses HASH-BASED routing for Blob URL compatibility
    import React from 'react';

    // Get current path from hash (for Blob URL routing)
    function getHashPath() {
      const hash = window.location.hash || '#/';
      return hash.startsWith('#') ? hash.slice(1) || '/' : '/';
    }

    // Global navigation handler using hash routing
    window.__BAVINI_NAVIGATE__ = window.__BAVINI_NAVIGATE__ || ((url, options = {}) => {
      const newHash = '#' + (url.startsWith('/') ? url : '/' + url);
      if (options.replace) {
        window.location.replace(newHash);
      } else {
        window.location.hash = newHash;
      }
      // Dispatch custom event for listeners
      window.dispatchEvent(new CustomEvent('bavini-navigate', { detail: { path: url } }));
    });

    function Link({ href, children, className, style, onClick, prefetch, replace, scroll, ...props }) {
      const resolvedHref = typeof href === 'object' ? href.pathname + (href.search || '') + (href.hash || '') : href;

      const handleClick = (e) => {
        // Allow default behavior for external links or modified clicks
        if (
          e.defaultPrevented ||
          e.button !== 0 ||
          e.metaKey ||
          e.ctrlKey ||
          e.shiftKey ||
          e.altKey ||
          (resolvedHref && (resolvedHref.startsWith('http') || resolvedHref.startsWith('mailto:') || resolvedHref.startsWith('tel:')))
        ) {
          return;
        }

        e.preventDefault();
        if (onClick) onClick(e);

        // Use hash-based navigation (works in Blob URLs)
        window.__BAVINI_NAVIGATE__(resolvedHref, { replace: !!replace });

        // Scroll to top if needed
        if (scroll !== false) {
          window.scrollTo(0, 0);
        }
      };

      // Display href as normal path, but navigate via hash
      return React.createElement('a', {
        href: '#' + (resolvedHref.startsWith('/') ? resolvedHref : '/' + resolvedHref),
        className,
        style,
        onClick: handleClick,
        ...props
      }, children);
    }

    export default Link;
  `,

  'next/navigation': `
    // Browser shim for next/navigation - HASH-BASED routing for Blob URL compatibility
    import { useState, useEffect, useSyncExternalStore, useCallback } from 'react';

    // Get current path from hash
    function getHashPath() {
      const hash = window.location.hash || '#/';
      const path = hash.startsWith('#') ? hash.slice(1) : '/';
      // Parse path and search params
      const [pathname, search] = path.split('?');
      return { pathname: pathname || '/', search: search ? '?' + search : '' };
    }

    // Navigation state store - singleton pattern to prevent duplicate listeners
    const listeners = new Set();
    let isListenerSetup = false;

    function subscribe(listener) {
      listeners.add(listener);
      // Setup listeners only once, lazily
      if (!isListenerSetup && typeof window !== 'undefined') {
        isListenerSetup = true;
        window.addEventListener('hashchange', notifyListeners);
        window.addEventListener('bavini-navigate', notifyListeners);
      }
      return () => listeners.delete(listener);
    }

    function notifyListeners() {
      listeners.forEach(listener => listener());
    }

    // Set global navigation handler (without adding listeners here - BaviniRouter handles that)
    if (typeof window !== 'undefined' && !window.__BAVINI_NAVIGATE__) {
      window.__BAVINI_NAVIGATE__ = (url, options = {}) => {
        const newHash = '#' + (url.startsWith('/') ? url : '/' + url);
        if (options.replace) {
          window.location.replace(newHash);
        } else {
          window.location.hash = newHash;
        }
        notifyListeners();
      };
    }

    export function useRouter() {
      const navigate = useCallback((url, options = {}) => {
        if (typeof window !== 'undefined' && window.__BAVINI_NAVIGATE__) {
          window.__BAVINI_NAVIGATE__(url, options);
        }
      }, []);

      return {
        push: (url, options) => navigate(url, { ...options, replace: false }),
        replace: (url, options) => navigate(url, { ...options, replace: true }),
        back: () => { window.history.back(); },
        forward: () => { window.history.forward(); },
        refresh: () => { notifyListeners(); },
        prefetch: () => Promise.resolve(),
      };
    }

    export function usePathname() {
      return useSyncExternalStore(
        subscribe,
        () => typeof window !== 'undefined' ? getHashPath().pathname : '/',
        () => '/'
      );
    }

    export function useSearchParams() {
      const [params, setParams] = useState(() => {
        if (typeof window === 'undefined') return new URLSearchParams();
        const { search } = getHashPath();
        return new URLSearchParams(search);
      });

      useEffect(() => {
        const unsubscribe = subscribe(() => {
          const { search } = getHashPath();
          setParams(new URLSearchParams(search));
        });
        return unsubscribe;
      }, []);

      return params;
    }

    export function useParams() {
      // Get route params set by BaviniRouter
      const [params, setParams] = useState(() =>
        typeof window !== 'undefined' && window.__BAVINI_ROUTE_PARAMS__
          ? window.__BAVINI_ROUTE_PARAMS__
          : {}
      );

      useEffect(() => {
        // Listen specifically for params changes (more efficient than navigation events)
        const handleParamsChange = () => {
          setParams(window.__BAVINI_ROUTE_PARAMS__ || {});
        };

        window.addEventListener('bavini-params-change', handleParamsChange);
        return () => window.removeEventListener('bavini-params-change', handleParamsChange);
      }, []);

      return params;
    }

    export function notFound() {
      throw new Error('NEXT_NOT_FOUND');
    }

    export function redirect(url, type = 'replace') {
      if (typeof window !== 'undefined' && window.__BAVINI_NAVIGATE__) {
        window.__BAVINI_NAVIGATE__(url, { replace: type === 'replace' });
      }
    }

    export function permanentRedirect(url) {
      redirect(url, 'replace');
    }
  `,

  'next': `
    // Browser shim for next
    export const Metadata = {};
    export default {};
  `,
};

/**
 * Check if a path should be handled by Next.js shims
 */
export function isNextJsImport(path: string): boolean {
  return path === 'next' || path.startsWith('next/');
}

/**
 * Get the shim code for a Next.js import path
 */
export function getNextJsShim(path: string): string | undefined {
  return NEXTJS_SHIMS[path];
}

/**
 * Check if a shim exists for a Next.js import path
 */
export function hasNextJsShim(path: string): boolean {
  return path in NEXTJS_SHIMS;
}
