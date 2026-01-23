/**
 * =============================================================================
 * BAVINI CLOUD - React Bootstrap
 * =============================================================================
 * Bootstrap code generator for React applications.
 * Includes automatic routing detection and hash-based router for Blob URLs.
 * =============================================================================
 */

import type { BootstrapContext, RouteDefinition } from './types';
import { generateRouterCode, generateRouteImports, generateAppWithRouter } from './router';

/**
 * Generate React bootstrap entry code
 *
 * @param entryPath - Entry file path
 * @param context - Bootstrap context
 * @returns Bootstrap JavaScript code
 */
export function createReactBootstrapEntry(
  entryPath: string,
  context: BootstrapContext
): string {
  const { files, findFile, isMountingEntry, detectRoutes, logger } = context;

  // Get the content of the entry file to analyze it
  const entryContent = files.get(entryPath) || '';

  // Check if this is already a mounting entry file (contains ReactDOM.render or createRoot)
  if (isMountingEntry(entryContent)) {
    logger.debug(`Entry ${entryPath} is a mounting file, importing for side effects`);
    return `import '${entryPath.replace(/\.tsx?$/, '')}';`;
  }

  // Detect routes from file structure
  const filesList = Array.from(files.keys());
  const detectedRoutes = detectRoutes(filesList, files);
  const hasMultiplePages = detectedRoutes.length > 1;

  // Check if project already has a router configured
  const allContent = Array.from(files.values()).join('\n');
  const hasExistingRouter =
    allContent.includes('react-router-dom') ||
    allContent.includes('BrowserRouter') ||
    allContent.includes('@tanstack/react-router');

  logger.debug('Bootstrap routing detection:', {
    detectedRoutes: detectedRoutes.length,
    hasMultiplePages,
    hasExistingRouter,
  });

  // Find layout and page files
  const layoutPath = entryPath;
  const homePage = findFile('/app/page') || findFile('/src/app/page');

  // Build import statements
  // NOTE: We don't use lazy/Suspense for page components since blob URLs
  // don't support code splitting - everything is bundled together
  const imports: string[] = [
    `import React, { useState, useEffect, useRef, useMemo } from 'react';`,
    `import { createRoot } from 'react-dom/client';`,
  ];

  let appComponent = '';
  let routerWrapper = '';

  // Generate routing-aware bootstrap if multiple pages detected
  if (hasMultiplePages && !hasExistingRouter) {
    // Import layout if it exists
    if (layoutPath && layoutPath.includes('layout')) {
      imports.push(`import RootLayout from '${layoutPath.replace(/\.tsx?$/, '')}';`);
    }

    // Generate route imports
    const routeImports = generateRouteImports(detectedRoutes);
    imports.push(...routeImports);

    // Check if we have a layout
    const hasLayout = !!(layoutPath && layoutPath.includes('layout'));

    // Generate router code
    routerWrapper = generateRouterCode(detectedRoutes, hasLayout);

    // Generate App component with router
    appComponent = generateAppWithRouter(hasLayout);
  } else if (homePage) {
    // Simple Next.js style: layout + single page (no routing needed yet)
    imports.push(`import RootLayout from '${layoutPath.replace(/\.tsx?$/, '')}';`);
    imports.push(`import HomePage from '${homePage.replace(/\.tsx?$/, '')}';`);

    appComponent = `
function App() {
  return (
    <RootLayout>
      <HomePage />
    </RootLayout>
  );
}`;
  } else {
    // Standard single component app
    const hasDefaultExport = /export\s+default\s+/.test(entryContent);
    const hasNamedAppExport = /export\s+(function|const|class)\s+App/.test(entryContent);

    if (hasDefaultExport) {
      imports.push(`import MainComponent from '${entryPath.replace(/\.tsx?$/, '')}';`);
      appComponent = `
function App() {
  return <MainComponent />;
}`;
    } else if (hasNamedAppExport) {
      imports.push(`import { App as MainComponent } from '${entryPath.replace(/\.tsx?$/, '')}';`);
      appComponent = `
function App() {
  return <MainComponent />;
}`;
    } else {
      const appFilePath = findFile('/src/App') || findFile('/App') || findFile('/components/App');
      if (appFilePath) {
        const appContent = files.get(appFilePath) || '';
        const appHasDefault = /export\s+default\s+/.test(appContent);
        const appHasNamed = /export\s+(function|const|class)\s+App/.test(appContent);

        if (appHasDefault) {
          imports.push(`import MainComponent from '${appFilePath.replace(/\.tsx?$/, '')}';`);
        } else if (appHasNamed) {
          imports.push(`import { App as MainComponent } from '${appFilePath.replace(/\.tsx?$/, '')}';`);
        } else {
          imports.push(`import MainComponent from '${appFilePath.replace(/\.tsx?$/, '')}';`);
        }
      } else {
        imports.push(`import MainComponent from '${entryPath.replace(/\.tsx?$/, '')}';`);
      }

      appComponent = `
function App() {
  return <MainComponent />;
}`;
    }
  }

  // Generate the bootstrap code
  // NOTE: StrictMode removed to avoid double renders that can cause performance issues
  return `
${imports.join('\n')}
${routerWrapper}
${appComponent}

// Mount the app
const container = document.getElementById('root');
if (container) {
  try {
    const root = createRoot(container);
    root.render(<App />);
  } catch (error) {
    console.error('[BAVINI] Failed to render application:', error);
    // XSS-safe error display using textContent
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = 'padding:20px;color:#dc3545;font-family:system-ui;';
    const title = document.createElement('h2');
    title.textContent = 'Render Error';
    const pre = document.createElement('pre');
    pre.style.overflow = 'auto';
    pre.textContent = error.message || String(error);
    errorDiv.appendChild(title);
    errorDiv.appendChild(pre);
    container.appendChild(errorDiv);
  }
} else {
  console.error('Root element not found');
}
`;
}
