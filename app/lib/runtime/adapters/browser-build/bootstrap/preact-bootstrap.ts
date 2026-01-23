/**
 * =============================================================================
 * BAVINI CLOUD - Preact Bootstrap
 * =============================================================================
 * Bootstrap code generator for Preact applications.
 * =============================================================================
 */

import type { BootstrapContext } from './types';

/**
 * Generate Preact bootstrap entry code
 *
 * @param entryPath - Entry file path
 * @param context - Bootstrap context
 * @returns Bootstrap JavaScript code
 */
export function createPreactBootstrapEntry(
  entryPath: string,
  context: BootstrapContext
): string {
  const { files, findFile, logger } = context;
  const entryContent = files.get(entryPath) || '';

  // Check if this is already a mounting entry file
  if (entryContent.includes('render(') && entryContent.includes('preact')) {
    logger.debug(`Entry ${entryPath} is a Preact mounting file, importing for side effects`);
    return `import '${entryPath.replace(/\.tsx?$/, '')}';`;
  }

  // Find main App component
  let appPath = entryPath;
  const appFile = findFile('/src/App') || findFile('/App');
  if (appFile) {
    appPath = appFile;
  }

  return `
import { h, render } from 'preact';
import App from '${appPath.replace(/\.tsx?$/, '')}';

// Mount the Preact app
const container = document.getElementById('root') || document.getElementById('app');
if (container) {
  render(h(App, {}), container);
} else {
  console.error('Root element not found');
}
`;
}
